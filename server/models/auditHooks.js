import { sequelize } from '../config/db.js'
import { getContext } from '../middleware/requestContext.js'

/*
|--------------------------------------------------------------------------
| Automatic audit trail
|--------------------------------------------------------------------------
|
| Before this file existed, only 9 of the 28 route files wrote anything to
| audit_logs — settings, auth, roles, employees, performance, email and
| googleAuth. Everything that actually runs a child company day to day
| (leads, opportunities, expenses, projects, tasks, tickets, purchase
| orders, payroll, attendance, leave, inventory) left no trace at all.
|
| So the parent company could not have known what its child companies
| were doing: there was nothing to look at.
|
| These global Sequelize hooks fix that at the source. Every create,
| update and delete on a business model writes one audit row carrying:
|
|   companyId  which child company the record belongs to
|   userId     who did it (from the AsyncLocalStorage request context)
|   resource   the model name, e.g. 'Lead'
|   resourceId the row's primary key
|   changes    { field: { before, after } } — only what actually changed
|
| Design rules:
|   - NEVER throw. A failed audit write must not fail a customer's save.
|   - NEVER recurse. AuditLog itself is excluded, or writing an audit row
|     would trigger another audit row, forever.
|   - NEVER store secrets. Password hashes, MFA secrets and OAuth tokens
|     are recorded as "changed" without their values.
|   - NEVER duplicate. Routes that already write a richer, human-worded
|     audit row wrap their write in withoutAutoAudit().
*/

/*
| Models that must not be audited.
|
| AuditLog          — recursion.
| OTP / tokens      — short-lived secrets, high churn, zero oversight value.
| Notification      — the app generates thousands; they are already a feed.
| Email*            — sync jobs rewrite these constantly; email.routes.js
|                     audits the actions that actually matter (send, delete).
| Attendance        — see below; punch-ins are audited as a single event by
|                     the attendance route, not per-column update.
*/
const EXCLUDED_MODELS = new Set([
  'AuditLog',
  'OTP',
  'PasswordResetToken',
  'Notification',
  'NotificationPreference',
  'EmailEvent',
  'EmailThread',
  'Email',
  'EmailAttachment',
  'EmailFolder',
  'EmailLabel',
])

/** Never written to the audit trail in cleartext. */
const SENSITIVE_FIELDS = new Set([
  'password',
  'mfaSecret',
  'token',
  'refreshToken',
  'accessToken',
  'accessTokenEnc',
  'refreshTokenEnc',
  'clientSecret',
  'smtpPassword',
  'imapPassword',
])

/**
 * Columns whose change carries no oversight value. Auditing them turns
 * the group activity feed into noise — every login rewrites lastLogin,
 * every save rewrites updatedAt.
 */
const IGNORED_FIELDS = new Set([
  'updatedAt',
  'createdAt',
  'lastLogin',
  'lastSyncAt',
  'syncedAt',
  'failedLoginAttempts',
  'lockedUntil',

  /*
   * Session bookkeeping, not a business change.
   *
   * Half a dozen endpoints bump tokenVersion purely to sign the user's
   * other devices out — role assignment, status change, password reset,
   * bulk role assignment. Auditing it produced a second, contentless
   * "user updated" row beside the route's own well-worded entry every
   * single time, which is exactly the noise that makes an oversight feed
   * unreadable. The meaningful event is already logged by the route.
   */
  'tokenVersion',
  'passwordChangedAt',
])

/**
 * Which functional area each model belongs to. Drives the module filter
 * and the breakdown chart on the Group Console and the Audit Log tab.
 */
const MODEL_MODULE = {
  Lead: 'crm',
  LeadNote: 'crm',
  Account: 'crm',
  Contact: 'crm',
  Opportunity: 'crm',

  Employee: 'hr',
  EmployeeDocument: 'hr',
  Attendance: 'hr',
  Shift: 'hr',
  Leave: 'hr',
  LeaveType: 'hr',
  Holiday: 'hr',
  PerformanceReview: 'hr',
  DailyReport: 'hr',
  PayrollRun: 'hr',
  Payslip: 'hr',

  Expense: 'finance',
  LedgerEntry: 'finance',

  Warehouse: 'inventory',
  InventoryItem: 'inventory',
  Asset: 'inventory',
  StockTransfer: 'inventory',
  StockAdjustment: 'inventory',

  Vendor: 'procurement',
  PurchaseOrder: 'procurement',
  PurchaseOrderItem: 'procurement',

  Project: 'projects',
  ProjectMember: 'projects',
  Task: 'projects',

  Ticket: 'support',
  TicketReply: 'support',

  Meeting: 'calendar',
  MeetingAttendee: 'calendar',

  Company: 'settings',
  User: 'settings',
  UserCompany: 'settings',
  Role: 'settings',
}

/**
 * A short, human-readable label for the record, so the activity feed can
 * say "Lead — Acme Trading" instead of showing a bare UUID.
 */
const LABEL_FIELDS = [
  'name',
  'title',
  'subject',
  'firstName',
  'companyName',
  'itemName',
  'code',
  'poNumber',
  'reference',
  'description',
  'email',
]

const describe = (instance) => {
  for (const field of LABEL_FIELDS) {
    const value = instance?.dataValues?.[field]
    if (typeof value === 'string' && value.trim()) {
      // Employees are stored as firstName + lastName; join them so the
      // feed reads "Employee — Sita Sharma", not "Employee — Sita".
      if (field === 'firstName' && instance.dataValues.lastName) {
        return `${value} ${instance.dataValues.lastName}`.slice(0, 160)
      }
      return value.slice(0, 160)
    }
  }
  return null
}

/**
 * Which company owns this row.
 *
 * Almost every business model carries companyId. Models that do not
 * (join tables such as PurchaseOrderItem) fall back to the tenant the
 * request was acting in, which is the same company by construction.
 */
const resolveCompanyId = (instance, ctx) =>
  instance?.dataValues?.companyId || ctx?.companyId || null

/** Builds the { field: { before, after } } diff for an update. */
const buildUpdateDiff = (instance) => {
  const changes = {}

  for (const field of instance.changed() || []) {
    if (IGNORED_FIELDS.has(field)) continue

    if (SENSITIVE_FIELDS.has(field)) {
      changes[field] = { before: '[redacted]', after: '[changed]' }
      continue
    }

    const before = instance.previous(field)
    const after = instance.dataValues[field]

    // Sequelize marks JSON/BLOB columns dirty even when the value is
    // identical, which produced "changed" rows with no actual change.
    if (JSON.stringify(before) === JSON.stringify(after)) continue

    changes[field] = { before: before ?? null, after: after ?? null }
  }

  return changes
}

/** Snapshot of a created/destroyed row, with secrets stripped. */
const snapshot = (instance) => {
  const out = {}
  for (const [key, value] of Object.entries(instance?.dataValues || {})) {
    if (IGNORED_FIELDS.has(key)) continue
    if (SENSITIVE_FIELDS.has(key)) {
      out[key] = '[redacted]'
      continue
    }
    // Keep the row compact — the feed shows a summary, and the full
    // record is one click away in its own module.
    if (typeof value === 'string' && value.length > 500) {
      out[key] = `${value.slice(0, 500)}…`
      continue
    }
    out[key] = value ?? null
  }
  return out
}

/**
 * The single write path for all three hooks.
 *
 * `AuditLog` is imported lazily: models/index.js imports this file while
 * it is still building the model registry, so a top-level import would
 * be a circular dependency that resolves to undefined.
 */
const record = async (instance, options, action) => {
  try {
    const modelName = instance?.constructor?.name
    if (!modelName || EXCLUDED_MODELS.has(modelName)) return

    const ctx = getContext()

    // The route already wrote its own, better-worded audit row.
    if (ctx?.suppressAutoAudit) return

    let changes
    if (action === 'updated') {
      changes = buildUpdateDiff(instance)
      // Nothing meaningful changed — an updatedAt-only touch.
      if (Object.keys(changes).length === 0) return
    } else if (action === 'created') {
      changes = { after: snapshot(instance) }
    } else {
      changes = { before: snapshot(instance) }
    }

    const { default: AuditLog } = await import('./AuditLog.js')

    await AuditLog.create(
      {
        companyId: resolveCompanyId(instance, ctx),
        userId: ctx?.userId || null,
        action: `${modelName.toLowerCase()}_${action}`,
        resource: modelName,
        resourceId: instance?.dataValues?.id != null ? String(instance.dataValues.id) : null,
        resourceLabel: describe(instance),
        module: MODEL_MODULE[modelName] || 'other',
        status: 'success',
        source: 'auto',
        changes,
        ipAddress: ctx?.ipAddress || null,
        device: ctx?.device || null,
        browser: ctx?.browser || null,
        userAgent: ctx?.userAgent || null,
      },
      // Join the caller's transaction when there is one.
      //
      // Two reasons this matters. Correctness: several routes wrap
      // multi-row writes in sequelize.transaction(), and writing the
      // audit row outside it would leave a permanent record of a change
      // that was rolled back and never happened. Safety: an independent
      // connection writing while the transaction still holds row locks
      // is a deadlock waiting to happen under load.
      { transaction: options?.transaction }
    )
  } catch (err) {
    // An audit failure must never surface to the user or roll back their
    // work. Log it and move on.
    console.error(`auto-audit (${action}) failed:`, err.message)
  }
}

/**
 * Registers the hooks. Called once from models/index.js after every
 * model and association has been defined.
 */
export const registerAuditHooks = () => {
  sequelize.addHook('afterCreate', (instance, options) =>
    record(instance, options, 'created')
  )
  sequelize.addHook('afterUpdate', (instance, options) =>
    record(instance, options, 'updated')
  )
  sequelize.addHook('afterDestroy', (instance, options) =>
    record(instance, options, 'deleted')
  )

  /*
   * Model.update()/destroy() called on a WHERE clause skip the per-row
   * hooks above unless individualHooks is set — which is how bulk role
   * assignment and payroll generation write. Rather than force
   * individualHooks everywhere (slow), record one summary row.
   */
  sequelize.addHook('afterBulkUpdate', (options) =>
    recordBulk(options, 'bulk_updated')
  )
  sequelize.addHook('afterBulkDestroy', (options) =>
    recordBulk(options, 'bulk_deleted')
  )
}

const recordBulk = async (options, action) => {
  try {
    const modelName = options?.model?.name
    if (!modelName || EXCLUDED_MODELS.has(modelName)) return
    if (options?.individualHooks) return // already recorded row by row

    const ctx = getContext()
    if (ctx?.suppressAutoAudit) return

    const fields = Object.keys(options?.attributes || {}).filter(
      (f) => !IGNORED_FIELDS.has(f)
    )
    if (action === 'bulk_updated' && fields.length === 0) return

    const { default: AuditLog } = await import('./AuditLog.js')

    await AuditLog.create(
      {
        // A bulk where clause can carry an operator object rather than a
        // plain id (e.g. { [Op.in]: [...] }), which is not a valid UUID
        // and would fail the insert. Only take it when it is a string.
        companyId:
          typeof options?.where?.companyId === 'string'
            ? options.where.companyId
            : ctx?.companyId || null,
        userId: ctx?.userId || null,
        action: `${modelName.toLowerCase()}_${action}`,
        resource: modelName,
        resourceId: null,
        resourceLabel: null,
        module: MODEL_MODULE[modelName] || 'other',
        status: 'success',
        source: 'auto',
        changes: {
          bulk: true,
          fields,
          // The raw where clause can contain Sequelize operator symbols,
          // which JSON.stringify silently drops. Stringify defensively.
          scope: safeStringify(options?.where),
        },
        ipAddress: ctx?.ipAddress || null,
        device: ctx?.device || null,
        browser: ctx?.browser || null,
        userAgent: ctx?.userAgent || null,
      },
      // Same reasoning as the per-row hook: join the caller's
      // transaction so a rolled-back bulk update leaves no audit row.
      { transaction: options?.transaction }
    )
  } catch (err) {
    console.error(`auto-audit (${action}) failed:`, err.message)
  }
}

const safeStringify = (value) => {
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === 'symbol' ? String(v) : v))?.slice(
      0,
      1000
    )
  } catch {
    return null
  }
}

export default { registerAuditHooks }
