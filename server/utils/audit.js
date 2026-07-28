import { AuditLog } from '../models/index.js'

/**
 * logEvent
 * ----------------
 * Writes a row to audit_logs.
 *
 * The module/device/browser/status fields this function has always
 * passed were silently discarded, because models/AuditLog.js never
 * declared those columns. That model is now fixed, so these values
 * finally land in the database and the audit dashboard works.
 *
 * Backward compatible: every field is still optional, and `resource`
 * still defaults to 'Employee' for the original Employee Timeline
 * call sites.
 */
export const logEvent = async ({
  companyId,
  userId,
  action,
  resource = 'Employee',
  resourceId,
  changes = {},
  ipAddress = null,
  module = null,
  device = null,
  browser = null,
  status = 'success',
  userAgent = null,
  sessionId = null,
  // Human-readable name of the affected record, so the Group Console
  // activity feed can show "Lead — Acme Trading" rather than a UUID that
  // may no longer resolve to anything.
  resourceLabel = null,
}) => {
  try {
    return await AuditLog.create({
      companyId: companyId || null,
      userId: userId || null,
      action,
      resource,
      resourceId: resourceId != null ? String(resourceId) : null,
      resourceLabel: resourceLabel ? String(resourceLabel).slice(0, 255) : null,
      // Marks this as a hand-written entry rather than one produced by
      // the global hooks in models/auditHooks.js.
      source: 'route',
      changes,
      ipAddress,
      module,
      device,
      browser,
      status,
      userAgent,
      sessionId,
    })
  } catch (err) {
    // Audit logging must never break the primary request.
    console.error('audit log write failed:', err.message)
    return null
  }
}

/**
 * getRequestMeta
 * ----------------
 * Pulls ipAddress/device/browser/userAgent out of an Express req.
 *
 * SECURITY NOTE: this previously read the X-Forwarded-For header
 * directly, which any client can set — so the IP address recorded in
 * the audit trail was attacker-controlled. Express only populates
 * `req.ip` from that header when `app.set('trust proxy', ...)` has been
 * configured, so we now prefer req.ip and fall back to the socket
 * address. Make sure server.js sets trust proxy to match your actual
 * deployment (1 behind a single nginx/ALB, false for direct exposure).
 */
export const getRequestMeta = (req) => {
  const ua = req.headers['user-agent'] || ''

  const ipAddress = req.ip || req.socket?.remoteAddress || null

  let device = 'Desktop'
  if (/mobile/i.test(ua)) device = 'Mobile'
  else if (/tablet|ipad/i.test(ua)) device = 'Tablet'

  let browser = 'Unknown'
  if (/edg\//i.test(ua)) browser = 'Edge'
  else if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) browser = 'Chrome'
  else if (/firefox\//i.test(ua)) browser = 'Firefox'
  else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) browser = 'Safari'

  return {
    ipAddress,
    device,
    browser,
    userAgent: ua ? String(ua).slice(0, 1000) : null,
  }
}

/**
 * logFromRequest
 * ----------------
 * The common case: log an event using the current request for actor,
 * company and device metadata. Cuts the boilerplate at call sites from
 * eight lines to one.
 *
 *   await logFromRequest(req, {
 *     action: 'user_role_assigned',
 *     resource: 'User',
 *     resourceId: user.id,
 *     module: 'settings',
 *     changes: { before, after },
 *   })
 */
export const logFromRequest = async (req, payload = {}) =>
  logEvent({
    companyId: payload.companyId ?? req.companyId ?? req.user?.companyId ?? null,
    userId: payload.userId ?? req.user?.id ?? null,
    ...getRequestMeta(req),
    ...payload,
  })

/**
 * diffChanges
 * ----------------
 * Produces a compact { field: { before, after } } object for the audit
 * `changes` column, listing only what actually changed. Sensitive
 * fields are recorded as changed without ever storing their values.
 */
const SENSITIVE_FIELDS = new Set([
  'password',
  'mfaSecret',
  'token',
  'refreshToken',
  'tokenVersion',
])

export const diffChanges = (before = {}, after = {}) => {
  const changes = {}
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})])

  for (const key of keys) {
    const b = before?.[key]
    const a = after?.[key]

    if (JSON.stringify(b) === JSON.stringify(a)) continue

    if (SENSITIVE_FIELDS.has(key)) {
      changes[key] = { before: '[redacted]', after: '[changed]' }
      continue
    }

    changes[key] = { before: b ?? null, after: a ?? null }
  }

  return changes
}

export default { logEvent, getRequestMeta, logFromRequest, diffChanges }