import express from 'express'
import { Op } from 'sequelize'
import { protect } from '../middleware/auth.js'
import { Lead, Account, Employee, Ticket, Opportunity, InventoryItem, Expense, User } from '../models/index.js'

const router = express.Router()

router.get('/stats', protect, async (req, res, next) => {
  try {
    const company = req.headers['x-company-id'] || req.user.companyId

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)

    const [
      totalLeads, leadsThisMonth, leadsLastMonth,
      totalAccounts,
      opportunities,
      wonOpportunities,
      totalEmployees,
      openTickets,
      totalInventory,
    ] = await Promise.all([
      Lead.count({ where: { companyId: company } }),
      Lead.count({ where: { companyId: company, createdAt: { [Op.gte]: startOfMonth } } }),
      Lead.count({ where: { companyId: company, createdAt: { [Op.gte]: startOfLastMonth, [Op.lte]: endOfLastMonth } } }),
      Account.count({ where: { companyId: company } }),
      Opportunity.findAll({ where: { companyId: company, stage: { [Op.notIn]: ['Closed Won', 'Closed Lost'] } }, attributes: ['value'] }),
      Opportunity.findAll({ where: { companyId: company, stage: 'Closed Won' }, attributes: ['value', 'updatedAt'] }),
      Employee.count({ where: { companyId: company, status: 'active' } }),
      Ticket.count({ where: { companyId: company, status: { [Op.notIn]: ['Resolved', 'Closed'] } } }),
      InventoryItem.count({ where: { companyId: company } }),
    ])

    const pipelineValue = opportunities.reduce((s, o) => s + (o.value || 0), 0)
    const wonValue = wonOpportunities.reduce((s, o) => s + (o.value || 0), 0)
    const wonThisMonth = wonOpportunities.filter(o => new Date(o.updatedAt) >= startOfMonth).length
    const leadsChange = leadsLastMonth
      ? Math.round(((leadsThisMonth - leadsLastMonth) / leadsLastMonth) * 100)
      : 0

    res.json({
      leads:     { total: totalLeads, change: leadsChange },
      accounts:  { total: totalAccounts },
      pipeline:  { value: pipelineValue },
      won:       { count: wonOpportunities.length, value: wonValue, thisMonth: wonThisMonth },
      employees: { total: totalEmployees },
      tickets:   { open: openTickets },
      inventory: { total: totalInventory },
    })
  } catch (err) { next(err) }
})

router.get('/activity', protect, async (req, res, next) => {
  try {
    const company = req.headers['x-company-id'] || req.user.companyId
    const limit = parseInt(req.query.limit) || 10

    const [recentLeads, recentTickets, recentExpenses] = await Promise.all([
      Lead.findAll({ where: { companyId: company }, order: [['createdAt', 'DESC']], limit: 4, include: [{ model: User, as: 'assignedTo', attributes: ['name'] }] }),
      Ticket.findAll({ where: { companyId: company }, order: [['createdAt', 'DESC']], limit: 3, include: [{ model: User, as: 'createdBy', attributes: ['name'] }] }),
      Expense.findAll({ where: { companyId: company }, order: [['createdAt', 'DESC']], limit: 3, include: [{ model: User, as: 'submittedBy', attributes: ['name'] }] }),
    ])

    const items = [
      ...recentLeads.map(l => ({
        user: l.assignedTo?.name || 'System',
        description: `New lead "${l.name}" added`,
        timeAgo: timeAgo(l.createdAt),
        createdAt: l.createdAt,
      })),
      ...recentTickets.map(t => ({
        user: t.createdBy?.name || 'Customer',
        description: `Ticket #${t.ticketId} opened: ${t.subject}`,
        timeAgo: timeAgo(t.createdAt),
        createdAt: t.createdAt,
      })),
      ...recentExpenses.map(e => ({
        user: e.submittedBy?.name || 'Employee',
        description: `Expense "${e.title}" submitted for ${e.amount}`,
        timeAgo: timeAgo(e.createdAt),
        createdAt: e.createdAt,
      })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit)

    res.json({ items })
  } catch (err) { next(err) }
})

router.get('/charts', protect, async (req, res, next) => {
  try {
    const company = req.headers['x-company-id'] || req.user.companyId
    const now = new Date()
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({ year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleString('en-US', { month: 'short' }) })
    }
    const rangeStart = new Date(months[0].year, months[0].month, 1)

    const [leadsRaw, wonOppsRaw, stageOpps, ticketsRaw] = await Promise.all([
      Lead.findAll({ where: { companyId: company, createdAt: { [Op.gte]: rangeStart } }, attributes: ['createdAt'] }),
      Opportunity.findAll({ where: { companyId: company, stage: 'Closed Won', updatedAt: { [Op.gte]: rangeStart } }, attributes: ['value', 'updatedAt'] }),
      Opportunity.findAll({ where: { companyId: company, stage: { [Op.notIn]: ['Closed Won', 'Closed Lost'] } }, attributes: ['stage', 'value'] }),
      Ticket.findAll({ where: { companyId: company }, attributes: ['status'] }),
    ])

    const monthKey = (d) => `${d.getFullYear()}-${d.getMonth()}`
    const leadCounts = {}
    leadsRaw.forEach(l => { const k = monthKey(new Date(l.createdAt)); leadCounts[k] = (leadCounts[k] || 0) + 1 })
    const revenueTotals = {}
    wonOppsRaw.forEach(o => { const k = monthKey(new Date(o.updatedAt)); revenueTotals[k] = (revenueTotals[k] || 0) + (o.value || 0) })

    const trend = months.map(m => {
      const k = `${m.year}-${m.month}`
      return { month: m.label, leads: leadCounts[k] || 0, revenue: Math.round(revenueTotals[k] || 0) }
    })

    const stageTotals = {}
    stageOpps.forEach(o => { stageTotals[o.stage] = (stageTotals[o.stage] || 0) + (o.value || 0) })
    const pipelineByStage = Object.entries(stageTotals).map(([stage, value]) => ({ stage, value: Math.round(value) }))

    const statusTotals = {}
    ticketsRaw.forEach(t => { statusTotals[t.status] = (statusTotals[t.status] || 0) + 1 })
    const ticketsByStatus = Object.entries(statusTotals).map(([status, count]) => ({ status, count }))

    res.json({ trend, pipelineByStage, ticketsByStatus })
  } catch (err) { next(err) }
})

router.get('/top-deals', protect, async (req, res, next) => {
  try {
    const company = req.headers['x-company-id'] || req.user.companyId
    const limit = parseInt(req.query.limit) || 5
    const isWon = req.query.type === 'won'

    const deals = await Opportunity.findAll({
      where: isWon
        ? { companyId: company, stage: 'Closed Won' }
        : { companyId: company, stage: { [Op.notIn]: ['Closed Won', 'Closed Lost'] } },
      order: isWon ? [['updatedAt', 'DESC']] : [['value', 'DESC']],
      limit,
      include: [
        { model: Account, as: 'account', attributes: ['name'] },
        { model: User, as: 'assignedTo', attributes: ['name'] },
      ],
    })

    res.json({
      items: deals.map(d => ({
        id: d.id,
        name: d.name,
        account: d.account?.name || '—',
        owner: d.assignedTo?.name || 'Unassigned',
        stage: d.stage,
        value: d.value || 0,
        probability: d.probability ?? 0,
        closeDate: d.closeDate,
        wonAt: d.updatedAt,
      })),
    })
  } catch (err) { next(err) }
})

function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export default router