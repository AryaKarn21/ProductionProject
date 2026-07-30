import { AsyncLocalStorage } from 'node:async_hooks'

/*
|--------------------------------------------------------------------------
| Request context
|--------------------------------------------------------------------------
|
| The auto-audit hooks in models/auditHooks.js run deep inside Sequelize,
| where there is no `req` to read. AsyncLocalStorage carries the actor
| (who), the tenant (which company) and the request metadata (ip, device)
| down through every await in the same request, so a hook fired by
| `lead.save()` in a route handler can still say WHO changed it.
|
| This is the piece that makes "the parent company can see everything its
| child companies did" possible without editing all 28 route files: the
| context is established once, in one middleware.
|
| Reading the store is always optional — anything running outside a
| request (the scheduler, seed.js, a CLI script) simply gets null and the
| audit row is written with a null actor, which renders as "System".
*/

const storage = new AsyncLocalStorage()

/**
 * Express middleware. Mount AFTER protect + resolveCompany so the trusted
 * companyId is available; mounting it earlier still works but the audit
 * rows fall back to the user's home company instead of the active one.
 */
export const requestContext = (req, res, next) => {
  const ua = req.headers['user-agent'] || ''

  let device = 'Desktop'
  if (/mobile/i.test(ua)) device = 'Mobile'
  else if (/tablet|ipad/i.test(ua)) device = 'Tablet'

  let browser = 'Unknown'
  if (/edg\//i.test(ua)) browser = 'Edge'
  else if (/chrome\//i.test(ua)) browser = 'Chrome'
  else if (/firefox\//i.test(ua)) browser = 'Firefox'
  else if (/safari\//i.test(ua)) browser = 'Safari'

  const context = {
    userId: req.user?.id || null,
    userName: req.user?.name || null,
    // The tenant the request is acting in. resolveCompany() has already
    // proved the caller is allowed to touch it, so it is safe to stamp
    // onto audit rows.
    companyId: req.companyId || req.user?.companyId || null,
    ipAddress: req.ip || req.socket?.remoteAddress || null,
    device,
    browser,
    userAgent: ua ? String(ua).slice(0, 1000) : null,
    method: req.method,
    path: req.originalUrl,
    // Set to true by a route that has already written its own, richer
    // audit row, so the generic hook does not write a duplicate.
    suppressAutoAudit: false,
  }

  storage.run(context, () => next())
}

/** Current request's context, or null outside a request. */
export const getContext = () => storage.getStore() || null

/**
 * Runs `fn` with auto-audit turned off for the current request.
 *
 * Use this around writes that a route already audits by hand (the
 * settings, auth, roles and employees routes all do), so the activity
 * feed shows one well-described entry instead of two.
 */
export const withoutAutoAudit = async (fn) => {
  const ctx = getContext()
  if (!ctx) return fn()

  const previous = ctx.suppressAutoAudit
  ctx.suppressAutoAudit = true
  try {
    return await fn()
  } finally {
    ctx.suppressAutoAudit = previous
  }
}

export default { requestContext, getContext, withoutAutoAudit }
