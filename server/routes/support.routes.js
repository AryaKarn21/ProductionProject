import express from 'express'
import { Op } from 'sequelize'
import { Ticket, TicketReply, User } from '../models/index.js'
import { protect } from '../middleware/auth.js'
import { findInScope } from '../utils/scope.js'

const router = express.Router()
const getCompany = (req) => req.headers['x-company-id'] || null

router.get('/', protect, async (req, res, next) => {
  try {
    const company = getCompany(req)
    const { page = 1, limit = 20, status, priority, search } = req.query
    const where = { companyId: company }
    if (status) where.status = status
    if (priority) where.priority = priority
    if (search) where[Op.or] = [
      { subject: { [Op.like]: `%${search}%` } },
      { description: { [Op.like]: `%${search}%` } },
    ]
    const offset = (parseInt(page) - 1) * parseInt(limit)
    const { rows: tickets, count: total } = await Ticket.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      offset,
      limit: parseInt(limit),
      include: [
        { model: User, as: 'assignedTo', attributes: ['name'] },
        { model: User, as: 'createdBy', attributes: ['name'] },
      ],
    })
    res.json({ tickets, total })
  } catch (err) { next(err) }
})

router.get('/:id', protect, async (req, res, next) => {
  try {
    const ticket = await findInScope(req, Ticket, req.params.id, {
      include: [
        { model: User, as: 'assignedTo', attributes: ['name', ] },
        { model: User, as: 'createdBy', attributes: ['name'] },
        { model: TicketReply, as: 'replies', include: [{ model: User, as: 'author', attributes: ['name'] }], order: [['createdAt', 'ASC']] },
      ],
    })
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' })
    res.json(ticket)
  } catch (err) { next(err) }
})

// NOTE on ticketId numbering:
// Mongoose generated this in a pre('save') hook by counting documents,
// which has the same race-condition risk MySQL AUTO_INCREMENT avoids
// automatically. Since `ticketId` is already AUTO_INCREMENT on the model,
// we simply omit it on create and MySQL assigns the next number safely
// under concurrent requests — no manual counting needed here.
router.post('/', protect, async (req, res, next) => {
  try {
    const ticket = await Ticket.create({ ...req.body, companyId: getCompany(req), createdById: req.user.id })
    res.status(201).json(ticket)
  } catch (err) { next(err) }
})

router.patch('/:id', protect, async (req, res, next) => {
  try {
    const ticket = await findInScope(req, Ticket, req.params.id)

    if (!ticket)
      return res.status(404).json({ message: 'Ticket not found' })

    const updates = { ...req.body }

    if (updates.status === 'Resolved' && ticket.status !== 'Resolved')
      updates.resolvedAt = new Date()

    if (updates.status === 'Closed' && ticket.status !== 'Closed')
      updates.closedAt = new Date()

    await ticket.update(updates)

    res.json(ticket)
  } catch (err) {
    next(err)
  }
})

router.post('/:id/replies', protect, async (req, res, next) => {
  try {
    const ticket = await findInScope(req, Ticket, req.params.id)
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' })
    await TicketReply.create({
      ticketId: ticket.id,
      message: req.body.message,
      authorId: req.user.id,
      isInternal: req.body.isInternal || false,
    })
    if (ticket.status === 'Open') await ticket.update({ status: 'In Progress' })
    await ticket.reload({ include: [{ model: TicketReply, as: 'replies', include: [{ model: User, as: 'author', attributes: ['name'] }] }] })
    res.json(ticket)
  } catch (err) { next(err) }
})

router.delete('/:id', protect, async (req, res, next) => {
  try {
    const ticket = await findInScope(req, Ticket, req.params.id)
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' })
    await ticket.destroy()
    res.json({ message: 'Ticket deleted' })
  } catch (err) { next(err) }
})

export default router
