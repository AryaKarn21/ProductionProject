import express from 'express'
import { Op } from 'sequelize'
import { AuditLog, User } from '../models/index.js'
import { protect, can } from '../middleware/auth.js'

const router = express.Router()

/*
| config/permissions.js has always defined 'auditlog.view' and
| 'auditlog.export', and the permission matrix has always offered them —
| but these routes only ever checked the legacy `role` ENUM, so granting
| either key did nothing and no non-admin could reach the audit log
| however their role was configured.
|
| This honours the permission AND keeps the existing role check, so no
| account that can read the audit log today loses access.
*/
const requireAudit = (permission) => (req, res, next) => {
  if (req.user?.role === 'super_admin' || req.user?.role === 'admin') return next()
  if (can(req, permission)) return next()
  return res.status(403).json({
    message: 'You do not have permission to view the audit log.',
    required: permission,
  })
}

const csvEscape = (v) => {
  if (v == null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function buildWhere(req) {
  const { module, action, userId, status, search, startDate, endDate, resource, resourceId } = req.query
  const where = {}

  if (req.companyId) where.companyId = req.companyId
  if (module) where.module = module
  if (action) where.action = action
  if (userId) where.userId = userId
  if (status) where.status = status
  if (resource) where.resource = resource
  if (resourceId) where.resourceId = String(resourceId)

  if (search) {
    where[Op.or] = [
      { action: { [Op.like]: `%${search}%` } },
      { resource: { [Op.like]: `%${search}%` } },
      { resourceId: { [Op.like]: `%${search}%` } },
      // Searching by the record's NAME is what an operator actually
      // wants ("find everything that touched Acme Trading"); before
      // resourceLabel existed they could only search by UUID.
      { resourceLabel: { [Op.like]: `%${search}%` } },
    ]
  }

  if (startDate || endDate) {
    where.createdAt = {}
    if (startDate) where.createdAt[Op.gte] = new Date(startDate)
    if (endDate) where.createdAt[Op.lte] = new Date(endDate)
  }

  return where
}


// ── List (filters + pagination) ──
router.get('/', protect, requireAudit('auditlog.view'), async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query
    const where = buildWhere(req)

    const { rows, count } = await AuditLog.findAndCountAll({
      where,
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset: (page - 1) * limit,
    })

    res.json({ logs: rows, total: count })
  } catch (err) {
    next(err)
  }
})

// ── Stats (for the Audit Log dashboard) ──
router.get('/stats', protect, requireAudit('auditlog.view'), async (req, res, next) => {
  try {
    const where = {}
    if (req.companyId) where.companyId = req.companyId

    const [total, success, failed, byModule] = await Promise.all([
      AuditLog.count({ where }),
      AuditLog.count({ where: { ...where, status: 'success' } }),
      AuditLog.count({ where: { ...where, status: 'failed' } }),
      AuditLog.findAll({
        where,
        attributes: ['module', [AuditLog.sequelize.fn('COUNT', AuditLog.sequelize.col('id')), 'count']],
        group: ['module'],
        raw: true,
      }),
    ])

    res.json({
      total,
      success,
      failed,
      byModule: byModule.map((m) => ({ module: m.module || 'unknown', count: Number(m.count) })),
    })
  } catch (err) {
    next(err)
  }
})

// ── CSV export (matches the zero-dependency CSV pattern used elsewhere in the app) ──
router.get('/export', protect, requireAudit('auditlog.export'), async (req, res, next) => {
  try {
    const where = buildWhere(req)

    const logs = await AuditLog.findAll({
      where,
      include: [{ model: User, as: 'user', attributes: ['name', 'email'] }],
      order: [['createdAt', 'DESC']],
      limit: 5000, // sane upper bound for a single export
    })

    const headers = ['Timestamp', 'User', 'Email', 'Action', 'Module', 'Resource', 'Record', 'Resource ID', 'Status', 'IP Address', 'Device', 'Browser']
    const rows = logs.map((l) => [
      l.createdAt.toISOString(),
      l.user?.name || 'System',
      l.user?.email || '',
      l.action,
      l.module || '',
      l.resource,
      l.resourceLabel || '',
      l.resourceId || '',
      l.status,
      l.ipAddress || '',
      l.device || '',
      l.browser || '',
    ])

    const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${Date.now()}.csv"`)
    res.send(csv)
  } catch (err) {
    next(err)
  }
})

export default router