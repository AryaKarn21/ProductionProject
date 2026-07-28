import express from 'express'
import { Op, fn, col } from 'sequelize'
import { sequelize } from '../config/db.js'
import { Vendor, PurchaseOrder, PurchaseOrderItem, User } from '../models/index.js'
import { protect } from '../middleware/auth.js'
import { findInScope } from '../utils/scope.js'

const router = express.Router()
const getCompany = (req) => req.headers['x-company-id'] || null

// ── Dashboard ─────────────────────────────────────────────
router.get('/dashboard', protect, async (req, res, next) => {
  try {
    const companyWhere = req.isCrossCompany ? {} : { companyId: req.companyId }
    const year = new Date().getFullYear()

    const [
      totalOrders,
      draftCount,
      pendingCount,
      approvedCount,
      receivedCount,
      cancelledCount,
      activeVendorCount,
      totalVendorCount,
      committedSpend,
      pendingApprovalValue,
      recentOrdersRaw,
      vendorSpendRaw,
      monthlySpendRaw,
      overdueOrders,
    ] = await Promise.all([
      PurchaseOrder.count({ where: companyWhere }),
      PurchaseOrder.count({ where: { ...companyWhere, status: 'draft' } }),
      PurchaseOrder.count({ where: { ...companyWhere, status: 'pending' } }),
      PurchaseOrder.count({ where: { ...companyWhere, status: 'approved' } }),
      PurchaseOrder.count({ where: { ...companyWhere, status: 'received' } }),
      PurchaseOrder.count({ where: { ...companyWhere, status: 'cancelled' } }),
      Vendor.count({ where: { ...companyWhere, isActive: true } }),
      Vendor.count({ where: companyWhere }),
      PurchaseOrder.sum('totalAmount', { where: { ...companyWhere, status: ['approved', 'received'] } }),
      PurchaseOrder.sum('totalAmount', { where: { ...companyWhere, status: 'pending' } }),
      PurchaseOrder.findAll({
        where: companyWhere,
        order: [['createdAt', 'DESC']],
        limit: 5,
        include: [{ model: Vendor, as: 'vendor', attributes: ['name'] }],
      }),
      PurchaseOrder.findAll({
        where: { ...companyWhere, status: { [Op.ne]: 'cancelled' } },
        attributes: ['vendorId', [fn('SUM', col('totalAmount')), 'spend'], [fn('COUNT', col('id')), 'orderCount']],
        group: ['vendorId'],
        order: [[literalSafeOrder()]],
        raw: true,
      }).catch(() => []),
      PurchaseOrder.findAll({
        where: {
          ...companyWhere,
          status: { [Op.ne]: 'cancelled' },
          orderDate: { [Op.between]: [`${year}-01-01`, `${year}-12-31`] },
        },
        attributes: [
          [fn('MONTH', col('orderDate')), 'month'],
          [fn('SUM', col('totalAmount')), 'total'],
        ],
        group: [fn('MONTH', col('orderDate'))],
        raw: true,
      }),
      PurchaseOrder.count({
        where: {
          ...companyWhere,
          status: 'approved',
          expectedDelivery: { [Op.lt]: new Date().toISOString().slice(0, 10) },
        },
      }),
    ])

    const sortedVendorSpend = [...vendorSpendRaw].sort((a, b) => Number(b.spend) - Number(a.spend)).slice(0, 5)
    const topVendorIds = sortedVendorSpend.map((r) => r.vendorId)
    const topVendorRecords = topVendorIds.length
      ? await Vendor.findAll({ where: { id: topVendorIds }, attributes: ['id', 'name'] })
      : []
    const vendorNameById = Object.fromEntries(topVendorRecords.map((v) => [v.id, v.name]))
    const topVendors = sortedVendorSpend.map((r) => ({
      vendorId: r.vendorId,
      name: vendorNameById[r.vendorId] || 'Unknown Vendor',
      spend: Number(r.spend) || 0,
      orderCount: Number(r.orderCount) || 0,
    }))

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const monthlySpendByIndex = new Map(monthlySpendRaw.map((r) => [Number(r.month), Number(r.total)]))
    const monthlySpend = MONTHS.map((label, i) => ({ month: label, total: monthlySpendByIndex.get(i + 1) || 0 }))

    res.json({
      totalOrders,
      statusCounts: {
        draft: draftCount,
        pending: pendingCount,
        approved: approvedCount,
        received: receivedCount,
        cancelled: cancelledCount,
      },
      vendors: { active: activeVendorCount, total: totalVendorCount },
      committedSpend: committedSpend || 0,
      pendingApprovalValue: pendingApprovalValue || 0,
      avgOrderValue: totalOrders ? Math.round(((committedSpend || 0) / totalOrders) * 100) / 100 : 0,
      overdueDeliveries: overdueOrders,
      monthlySpend,
      topVendors,
      recentOrders: recentOrdersRaw.map((o) => ({
        id: o.id,
        poNumber: o.poNumber,
        vendorName: o.vendor?.name || 'Unknown Vendor',
        status: o.status,
        totalAmount: o.totalAmount,
        orderDate: o.orderDate,
      })),
    })
  } catch (err) { next(err) }
})

function literalSafeOrder() {
  return sequelize.literal('spend DESC')
}

// ── Vendors ───────────────────────────────────────────────
router.get('/vendors', protect, async (req, res, next) => {
  try {
    const vendors = await Vendor.findAll({ where: { companyId: getCompany(req) }, order: [['name', 'ASC']] })
    res.json({ vendors, total: vendors.length })
  } catch (err) { next(err) }
})

router.post('/vendors', protect, async (req, res, next) => {
  try {
    const vendor = await Vendor.create({ ...req.body, companyId: getCompany(req) })
    res.status(201).json(vendor)
  } catch (err) { next(err) }
})

// ── Update Purchase Order ─────────────────────────────────
router.put('/orders/:id', protect, async (req, res, next) => {
  const t = await sequelize.transaction()
  try {
    const company = getCompany(req)
    const order = await PurchaseOrder.findOne({ where: { id: req.params.id, companyId: company }, transaction: t })
    if (!order) {
      await t.rollback()
      return res.status(404).json({ message: 'Purchase Order not found' })
    }

    const { vendorId, expectedDelivery, notes, status, items = [] } = req.body
    const totalAmount = items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0)

    await order.update({ vendorId, expectedDelivery, notes, status, totalAmount }, { transaction: t })
    await PurchaseOrderItem.destroy({ where: { purchaseOrderId: order.id }, transaction: t })

    if (items.length) {
      await PurchaseOrderItem.bulkCreate(
        items.map(item => ({
          purchaseOrderId: order.id,
          name: item.name,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          total: Number(item.quantity) * Number(item.unitPrice),
        })),
        { transaction: t }
      )
    }

    await t.commit()
    await order.reload({ include: [{ model: Vendor, as: 'vendor' }, { model: PurchaseOrderItem, as: 'items' }] })
    res.json({ message: 'Purchase Order updated successfully', order })
  } catch (err) {
    await t.rollback()
    next(err)
  }
})

router.patch('/vendors/:id', protect, async (req, res, next) => {
  try {
    const vendor = await findInScope(req, Vendor, req.params.id)
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' })
    await vendor.update(req.body)
    res.json(vendor)
  } catch (err) { next(err) }
})

// ── Purchase Orders ───────────────────────────────────────
router.get('/orders', protect, async (req, res, next) => {
  try {
    const companyWhere = req.isCrossCompany ? {} : { companyId: req.companyId }
    const { status } = req.query
    const where = { ...companyWhere }
    if (status) {
      const statuses = String(status).split(',').map((s) => s.trim()).filter(Boolean)
      where.status = statuses.length > 1 ? { [Op.in]: statuses } : statuses[0]
    }
    const orders = await PurchaseOrder.findAll({
      where,
      order: [['createdAt', 'DESC']],
      include: [
        { model: Vendor, as: 'vendor', attributes: ['name'] },
        { model: PurchaseOrderItem, as: 'items' },
        { model: User, as: 'createdBy', attributes: ['name', 'email'] },
      ],
    })
    res.json({ orders, total: orders.length })
  } catch (err) { next(err) }
})

router.get('/orders/:id', protect, async (req, res, next) => {
  try {
    const companyWhere = req.isCrossCompany ? {} : { companyId: req.companyId }
    const order = await PurchaseOrder.findOne({
      where: { id: req.params.id, ...companyWhere },
      include: [
        { model: Vendor, as: 'vendor' },
        { model: PurchaseOrderItem, as: 'items' },
        { model: User, as: 'createdBy', attributes: ['name', 'email'] },
      ],
    })
    if (!order) return res.status(404).json({ message: 'Purchase order not found' })
    res.json(order)
  } catch (err) { next(err) }
})

router.post('/orders', protect, async (req, res, next) => {
  const t = await sequelize.transaction()
  try {
    const company = req.isCrossCompany ? null : req.companyId
    const { items = [], ...orderData } = req.body

    const lastPO = await PurchaseOrder.findOne({ where: { companyId: company }, order: [['createdAt', 'DESC']] })
    let poNumber = 'PO-00001'
    if (lastPO) {
      const lastNumber = parseInt(lastPO.poNumber.replace('PO-', ''), 10)
      poNumber = `PO-${String(lastNumber + 1).padStart(5, '0')}`
    }

    const total = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)

    const order = await PurchaseOrder.create(
      { ...orderData, companyId: company, poNumber, totalAmount: total, createdById: req.user.id },
      { transaction: t }
    )

    if (items.length) {
      await PurchaseOrderItem.bulkCreate(
        items.map(i => ({ ...i, total: i.quantity * i.unitPrice, purchaseOrderId: order.id })),
        { transaction: t }
      )
    }

    await t.commit()
    await order.reload({ include: [{ model: PurchaseOrderItem, as: 'items' }] })
    res.status(201).json(order)
  } catch (err) {
    await t.rollback()
    next(err)
  }
})

// Submit a draft Purchase Request for approval (draft -> pending)
router.patch('/orders/:id/submit', protect, async (req, res, next) => {
  try {
    const companyWhere = req.isCrossCompany ? {} : { companyId: req.companyId }
    const order = await PurchaseOrder.findOne({ where: { id: req.params.id, ...companyWhere } })
    if (!order) return res.status(404).json({ message: 'Purchase request not found' })
    if (order.status !== 'draft') {
      return res.status(400).json({ message: `Only draft requests can be submitted for approval (current status: ${order.status})` })
    }
    if (!order.vendorId) {
      return res.status(400).json({ message: 'Select a vendor before submitting this request for approval' })
    }
    const itemCount = await PurchaseOrderItem.count({ where: { purchaseOrderId: order.id } })
    if (itemCount === 0) {
      return res.status(400).json({ message: 'Add at least one line item before submitting this request for approval' })
    }
    await order.update({ status: 'pending' })
    await order.reload({
      include: [
        { model: Vendor, as: 'vendor', attributes: ['name'] },
        { model: PurchaseOrderItem, as: 'items' },
      ],
    })
    res.json(order)
  } catch (err) { next(err) }
})

router.patch('/orders/:id/approve', protect, async (req, res, next) => {
  try {
    const order = await findInScope(req, PurchaseOrder, req.params.id)
    if (!order) return res.status(404).json({ message: 'Purchase order not found' })
    await order.update({ status: 'approved', approvedById: req.user.id })
    res.json(order)
  } catch (err) { next(err) }
})

router.patch('/orders/:id/receive', protect, async (req, res, next) => {
  try {
    const order = await findInScope(req, PurchaseOrder, req.params.id)
    if (!order) return res.status(404).json({ message: 'Purchase order not found' })
    await order.update({ status: 'received', receivedDate: new Date() })
    res.json(order)
  } catch (err) { next(err) }
})

router.get('/vendors/:id', protect, async (req, res, next) => {
  try {
    const vendor = await findInScope(req, Vendor, req.params.id)
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' })
    res.json(vendor)
  } catch (err) { next(err) }
})

router.patch('/orders/:id/cancel', protect, async (req, res, next) => {
  try {
    const order = await findInScope(req, PurchaseOrder, req.params.id)
    if (!order) return res.status(404).json({ message: 'Purchase order not found' })
    await order.update({ status: 'cancelled' })
    res.json(order)
  } catch (err) { next(err) }
})

export default router