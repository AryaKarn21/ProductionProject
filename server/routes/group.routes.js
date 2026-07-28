import express from 'express'
import { Op, fn, col, literal } from 'sequelize'
import {
  AuditLog,
  User,
  Company,
  Lead,
  Opportunity,
  Employee,
  Expense,
  Project,
  Task,
  Ticket,
  Leave,
  PurchaseOrder,
  InventoryItem,
} from '../models/index.js'
import { authorizePermission } from '../middleware/auth.js'
import { resolveGroupScope, narrowScope } from '../middleware/groupScope.js'
import { getCompanyTree } from '../utils/companyTree.js'
import { parsePagination } from '../middleware/validate.js'

/*
|--------------------------------------------------------------------------
| Group Console
|--------------------------------------------------------------------------
|
| Read-only oversight for a parent company (OS Group) over every company
| beneath it in the hierarchy.
|
| Two complementary data sources, because neither alone answers the
| question "what are my child companies doing?":
|
|   1. Rollups (live queries against the child companies' own tables)
|      answer WHERE THINGS STAND — 42 open leads, NPR 1.2M of pending
|      expenses, 3 overdue projects.
|
|   2. The activity feed (audit_logs, now fed automatically by
|      models/auditHooks.js) answers WHAT CHANGED AND WHO DID IT —
|      "Ramesh at Acme Ltd approved expense EXP-114, 2 minutes ago".
|
| Every route here is GET. There is deliberately no write path: group
| oversight is visibility, not control. A parent-company user who needs
| to change a child company's data does it by switching into that company
| with a role that grants it, which leaves its own audit trail.
*/

const router = express.Router()

// Applied to every route below. Order matters: authorizePermission runs
// the super_admin bypass and the RBAC check, then resolveGroupScope
// works out which companies are actually in scope.
router.use(authorizePermission('group.view'), resolveGroupScope)

/** Shapes a company row for the client, always with a resolvable name. */
const companyLabel = (req, companyId) => {
  if (!companyId) return { id: null, name: 'System' }
  const row = req.companyMap.get(String(companyId))
  return {
    id: String(companyId),
    // A company deleted after the audit row was written still has rows
    // pointing at it. Showing the raw UUID would be useless, so say so.
    name: row?.name || 'Removed company',
    type: row?.type || null,
  }
}

/** Turns [{ companyId, count }] into { [companyId]: count }. */
const indexBy = (rows, key = 'companyId', value = 'count') =>
  rows.reduce((acc, row) => {
    acc[String(row[key])] = Number(row[value]) || 0
    return acc
  }, {})

/**
 * COUNT(*) grouped by company, for one model.
 * Returns {} rather than throwing when a model has no companyId column,
 * so one missing table can never take the whole dashboard down.
 */
const countByCompany = async (Model, companyIds, extraWhere = {}) => {
  try {
    const rows = await Model.findAll({
      where: { companyId: { [Op.in]: companyIds }, ...extraWhere },
      attributes: ['companyId', [fn('COUNT', col('id')), 'count']],
      group: ['companyId'],
      raw: true,
    })
    return indexBy(rows)
  } catch (err) {
    console.error(`group rollup failed for ${Model?.name}:`, err.message)
    return {}
  }
}

/** SUM(field) grouped by company. */
const sumByCompany = async (Model, field, companyIds, extraWhere = {}) => {
  try {
    const rows = await Model.findAll({
      where: { companyId: { [Op.in]: companyIds }, ...extraWhere },
      attributes: ['companyId', [fn('SUM', col(field)), 'total']],
      group: ['companyId'],
      raw: true,
    })
    return indexBy(rows, 'companyId', 'total')
  } catch (err) {
    console.error(`group sum failed for ${Model?.name}.${field}:`, err.message)
    return {}
  }
}

const sumAll = (map) => Object.values(map).reduce((a, b) => a + b, 0)

/*
|--------------------------------------------------------------------------
| GET /api/group/scope
|--------------------------------------------------------------------------
| What this user can see. The client calls this first so it can render the
| right empty state instead of firing six dashboard queries that all come
| back empty.
*/
router.get('/scope', async (req, res, next) => {
  try {
    // getCompanyTree(null) returns EVERY company as a root, which would
    // hand the full platform company list to a caller who has no company
    // of their own. An empty scope must render as empty.
    const tree = req.groupRootId ? await getCompanyTree(req.groupRootId) : []

    res.json({
      root: companyLabel(req, req.groupRootId),
      isEmpty: req.groupEmpty,
      childCount: req.childIds.length,
      companies: req.groupIds.map((id) => companyLabel(req, id)),
      children: req.childIds.map((id) => companyLabel(req, id)),
      tree,
    })
  } catch (err) {
    next(err)
  }
})

/*
|--------------------------------------------------------------------------
| GET /api/group/overview
|--------------------------------------------------------------------------
| Group-wide KPIs plus a per-company breakdown — the "what is going on
| across my child companies" screen.
|
| Every rollup runs in parallel; a failure in any one of them degrades to
| zero for that metric rather than 500-ing the whole page.
*/
router.get('/overview', async (req, res, next) => {
  try {
    const ids = req.groupIds

    // Nothing in scope — skip 16 pointless round trips to the database.
    // Totals are returned as explicit zeros rather than an empty object,
    // so the client can render every KPI card unconditionally instead of
    // printing "and its undefined child companies".
    if (ids.length === 0) {
      const zeroed = Object.fromEntries(
        [
          'companies', 'childCompanies', 'leads', 'newLeads',
          'openOpportunities', 'pipelineValue', 'wonValue', 'employees',
          'expensePending', 'expenseApproved', 'projectsActive',
          'projectsOverdue', 'tasksOpen', 'ticketsOpen', 'leavesPending',
          'purchaseOrdersPending', 'changes',
        ].map((k) => [k, 0])
      )

      return res.json({
        periodDays: 30,
        root: companyLabel(req, req.groupRootId),
        isEmpty: true,
        totals: zeroed,
        byCompany: [],
      })
    }

    // Default window: the last 30 days, which is what the trend figures
    // and the "activity this period" counts are measured over.
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const [
      leads,
      openOpportunities,
      wonValue,
      pipelineValue,
      employees,
      expensePending,
      expenseApproved,
      projectsActive,
      projectsOverdue,
      tasksOpen,
      ticketsOpen,
      leavesPending,
      poPending,
      stockValue,
      newLeadsInPeriod,
      changesInPeriod,
    ] = await Promise.all([
      countByCompany(Lead, ids),
      countByCompany(Opportunity, ids, {
        stage: { [Op.notIn]: ['Closed Won', 'Closed Lost'] },
      }),
      sumByCompany(Opportunity, 'value', ids, { stage: 'Closed Won' }),
      sumByCompany(Opportunity, 'value', ids, {
        stage: { [Op.notIn]: ['Closed Won', 'Closed Lost'] },
      }),
      countByCompany(Employee, ids, { status: 'active' }),
      sumByCompany(Expense, 'amount', ids, { status: 'pending' }),
      sumByCompany(Expense, 'amount', ids, { status: 'approved' }),
      countByCompany(Project, ids, { status: 'active' }),
      countByCompany(Project, ids, {
        status: { [Op.in]: ['active', 'on_hold'] },
        endDate: { [Op.lt]: new Date() },
      }),
      countByCompany(Task, ids, { status: { [Op.ne]: 'done' } }),
      countByCompany(Ticket, ids, {
        status: { [Op.in]: ['Open', 'In Progress', 'Pending'] },
      }),
      countByCompany(Leave, ids, { status: 'pending' }),
      countByCompany(PurchaseOrder, ids, {
        // Matches models/PurchaseOrder.js exactly: the ENUM is
        // lowercase, and a value outside it never matches in MySQL.
        status: { [Op.in]: ['draft', 'pending'] },
      }),
      sumByCompany(InventoryItem, 'quantity', ids),
      countByCompany(Lead, ids, { createdAt: { [Op.gte]: since } }),
      countByCompany(AuditLog, ids, { createdAt: { [Op.gte]: since } }),
    ])

    // Per-company rows, so the parent can see which child is which.
    const byCompany = ids.map((id) => ({
      company: companyLabel(req, id),
      isRoot: id === req.groupRootId,
      leads: leads[id] || 0,
      newLeads: newLeadsInPeriod[id] || 0,
      openOpportunities: openOpportunities[id] || 0,
      pipelineValue: pipelineValue[id] || 0,
      wonValue: wonValue[id] || 0,
      employees: employees[id] || 0,
      expensePending: expensePending[id] || 0,
      expenseApproved: expenseApproved[id] || 0,
      projectsActive: projectsActive[id] || 0,
      projectsOverdue: projectsOverdue[id] || 0,
      tasksOpen: tasksOpen[id] || 0,
      ticketsOpen: ticketsOpen[id] || 0,
      leavesPending: leavesPending[id] || 0,
      purchaseOrdersPending: poPending[id] || 0,
      stockUnits: stockValue[id] || 0,
      changes: changesInPeriod[id] || 0,
    }))

    res.json({
      periodDays: days,
      root: companyLabel(req, req.groupRootId),
      isEmpty: req.groupEmpty,
      totals: {
        companies: ids.length,
        childCompanies: req.childIds.length,
        leads: sumAll(leads),
        newLeads: sumAll(newLeadsInPeriod),
        openOpportunities: sumAll(openOpportunities),
        pipelineValue: sumAll(pipelineValue),
        wonValue: sumAll(wonValue),
        employees: sumAll(employees),
        expensePending: sumAll(expensePending),
        expenseApproved: sumAll(expenseApproved),
        projectsActive: sumAll(projectsActive),
        projectsOverdue: sumAll(projectsOverdue),
        tasksOpen: sumAll(tasksOpen),
        ticketsOpen: sumAll(ticketsOpen),
        leavesPending: sumAll(leavesPending),
        purchaseOrdersPending: sumAll(poPending),
        changes: sumAll(changesInPeriod),
      },
      byCompany,
    })
  } catch (err) {
    next(err)
  }
})

/*
|--------------------------------------------------------------------------
| Activity feed
|--------------------------------------------------------------------------
*/

const buildActivityWhere = (req) => {
  const { module, action, resource, userId, status, search, startDate, endDate, source } =
    req.query

  const scope = narrowScope(req, req.query.companyId)
  if (!scope) return null // requested a company outside the caller's scope

  const where = { companyId: { [Op.in]: scope } }

  if (module) where.module = module
  if (action) where.action = action
  if (resource) where.resource = resource
  if (userId) where.userId = userId
  if (status) where.status = status
  if (source) where.source = source

  if (search) {
    where[Op.or] = [
      { action: { [Op.like]: `%${search}%` } },
      { resource: { [Op.like]: `%${search}%` } },
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

/** Adds the company name and actor to a raw audit row for the feed. */
const shapeActivity = (req, log) => ({
  id: log.id,
  createdAt: log.createdAt,
  company: companyLabel(req, log.companyId),
  actor: log.user ? { id: log.user.id, name: log.user.name, email: log.user.email } : null,
  action: log.action,
  module: log.module,
  resource: log.resource,
  resourceId: log.resourceId,
  resourceLabel: log.resourceLabel,
  status: log.status,
  source: log.source,
  changes: log.changes,
  ipAddress: log.ipAddress,
  device: log.device,
  browser: log.browser,
})

/*
|--------------------------------------------------------------------------
| GET /api/group/activity
|--------------------------------------------------------------------------
| The chronological "what did my child companies just do" feed, across
| every company in scope, newest first.
*/
router.get('/activity', async (req, res, next) => {
  try {
    const where = buildActivityWhere(req)
    if (!where) {
      return res.status(403).json({ message: 'That company is not in your group.' })
    }

    const { page, limit, offset } = parsePagination(req)

    const { rows, count } = await AuditLog.findAndCountAll({
      where,
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    })

    res.json({
      activity: rows.map((log) => shapeActivity(req, log)),
      total: count,
      page,
      limit,
    })
  } catch (err) {
    next(err)
  }
})

/*
|--------------------------------------------------------------------------
| GET /api/group/activity/stats
|--------------------------------------------------------------------------
| Counts for the feed's filter chips and charts: volume per company, per
| module, and the busiest users.
*/
router.get('/activity/stats', async (req, res, next) => {
  try {
    const where = buildActivityWhere(req)
    if (!where) {
      return res.status(403).json({ message: 'That company is not in your group.' })
    }

    /*
     * The "busiest people" figure is deliberately computed in two plain
     * steps — GROUP BY on audit_logs alone, then one lookup of the names
     * — rather than a single grouped JOIN.
     *
     * A grouped query with an `include` forces every joined column into
     * the GROUP BY clause, which behaves differently depending on
     * whether the server runs with ONLY_FULL_GROUP_BY (the MySQL 5.7+
     * default). Splitting it keeps the result identical on every
     * configuration, at the cost of one extra, indexed query.
     */
    const [byCompany, byModule, byUser, total] = await Promise.all([
      AuditLog.findAll({
        where,
        attributes: ['companyId', [fn('COUNT', col('id')), 'count']],
        group: ['companyId'],
        raw: true,
      }),
      AuditLog.findAll({
        where,
        attributes: ['module', [fn('COUNT', col('id')), 'count']],
        group: ['module'],
        raw: true,
      }),
      AuditLog.findAll({
        where,
        attributes: ['userId', 'companyId', [fn('COUNT', col('id')), 'count']],
        group: ['userId', 'companyId'],
        order: [[literal('count'), 'DESC']],
        limit: 10,
        raw: true,
      }),
      AuditLog.count({ where }),
    ])

    // Resolve the actor names in one query rather than N.
    const userIds = [...new Set(byUser.map((r) => r.userId).filter(Boolean))]
    const users = userIds.length
      ? await User.findAll({
          where: { id: { [Op.in]: userIds } },
          attributes: ['id', 'name', 'email'],
          raw: true,
        })
      : []
    const userById = new Map(users.map((u) => [String(u.id), u]))

    res.json({
      total,
      byCompany: byCompany.map((r) => ({
        company: companyLabel(req, r.companyId),
        count: Number(r.count),
      })),
      byModule: byModule
        .map((r) => ({ module: r.module || 'other', count: Number(r.count) }))
        .sort((a, b) => b.count - a.count),
      topUsers: byUser.map((r) => {
        const actor = r.userId ? userById.get(String(r.userId)) : null
        return {
          name: actor?.name || 'System',
          email: actor?.email || null,
          company: companyLabel(req, r.companyId),
          count: Number(r.count),
        }
      }),
    })
  } catch (err) {
    next(err)
  }
})

/*
|--------------------------------------------------------------------------
| GET /api/group/activity/export
|--------------------------------------------------------------------------
| CSV of the current filter, for board packs and external auditors.
| Gated on group.export, which is a separate grant from group.view.
*/
const csvEscape = (v) => {
  if (v == null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

router.get(
  '/activity/export',
  authorizePermission('group.export'),
  async (req, res, next) => {
    try {
      const where = buildActivityWhere(req)
      if (!where) {
        return res.status(403).json({ message: 'That company is not in your group.' })
      }

      const logs = await AuditLog.findAll({
        where,
        include: [{ model: User, as: 'user', attributes: ['name', 'email'] }],
        order: [['createdAt', 'DESC']],
        limit: 10000, // matches the bound used by the audit-log export
      })

      const headers = [
        'Timestamp',
        'Company',
        'User',
        'Email',
        'Module',
        'Action',
        'Resource',
        'Record',
        'Status',
        'Source',
        'IP Address',
        'Device',
      ]

      const rows = logs.map((l) => [
        l.createdAt.toISOString(),
        companyLabel(req, l.companyId).name,
        l.user?.name || 'System',
        l.user?.email || '',
        l.module || '',
        l.action,
        l.resource,
        l.resourceLabel || l.resourceId || '',
        l.status,
        l.source || '',
        l.ipAddress || '',
        l.device || '',
      ])

      const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n')

      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="group-activity-${Date.now()}.csv"`
      )
      res.send(csv)
    } catch (err) {
      next(err)
    }
  }
)

/*
|--------------------------------------------------------------------------
| GET /api/group/companies/:id
|--------------------------------------------------------------------------
| Drill-down on one child company: its profile, headline numbers and most
| recent activity, without the parent having to switch tenants.
*/
router.get('/companies/:id', async (req, res, next) => {
  try {
    const scope = narrowScope(req, req.params.id)
    if (!scope) {
      return res.status(403).json({ message: 'That company is not in your group.' })
    }

    const id = String(req.params.id)

    const [company, leads, employees, projects, tickets, pipeline, expenses, recent] =
      await Promise.all([
        Company.findByPk(id, {
          include: [{ model: Company, as: 'parent', attributes: ['id', 'name'] }],
        }),
        countByCompany(Lead, scope),
        countByCompany(Employee, scope, { status: 'active' }),
        countByCompany(Project, scope, { status: 'active' }),
        countByCompany(Ticket, scope, {
          status: { [Op.in]: ['Open', 'In Progress', 'Pending'] },
        }),
        sumByCompany(Opportunity, 'value', scope, {
          stage: { [Op.notIn]: ['Closed Won', 'Closed Lost'] },
        }),
        sumByCompany(Expense, 'amount', scope, { status: 'pending' }),
        AuditLog.findAll({
          where: { companyId: id },
          include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
          order: [['createdAt', 'DESC']],
          limit: 25,
        }),
      ])

    if (!company) return res.status(404).json({ message: 'Company not found' })

    res.json({
      company,
      stats: {
        leads: leads[id] || 0,
        employees: employees[id] || 0,
        projectsActive: projects[id] || 0,
        ticketsOpen: tickets[id] || 0,
        pipelineValue: pipeline[id] || 0,
        expensePending: expenses[id] || 0,
      },
      recentActivity: recent.map((log) => shapeActivity(req, log)),
    })
  } catch (err) {
    next(err)
  }
})

export default router
