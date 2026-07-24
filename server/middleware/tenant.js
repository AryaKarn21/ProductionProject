import { validate as isUuid } from 'uuid'
import { Company } from '../models/index.js'
import { resolveRolePermissions } from './auth.js'

/**
 * resolveCompany
 * ----------------
 * Decides which company's data this request is allowed to touch, and
 * then resolves the permissions the user holds *in that company*.
 *
 * Sets:
 *   req.companyId       string|null   trusted tenant scope (null = all, super admin only)
 *   req.isCrossCompany  boolean
 *   req.permissionSet   Set<string>   effective permissions for this company
 *   req.roleIdInUse     string|null   which role produced those permissions
 *
 * SECURITY NOTE — what changed and why:
 *
 * The previous version contained a fallback that let any user whose
 * `companyId` was null choose their own tenant by sending an
 * X-Company-ID header. Because POST /api/auth/register created exactly
 * that kind of user (role 'employee', companyId null), a stranger could
 * register, verify their own email, read the company list, and then
 * point the header at any company on the platform.
 *
 * That fallback is gone. A user with no company assignment is now
 * blocked with a clear message, which is what the code's own error
 * string already said should happen.
 */
export const resolveCompany = async (req, res, next) => {
  try {
    const requestedId = req.headers['x-company-id']

    // ── Super admin: may work across companies ────────────────────
    if (req.user.role === 'super_admin') {
      if (!requestedId) {
        req.companyId = null // null = no filter = view across all companies
        req.isCrossCompany = true
        return applyCompanyRole(req, null, next)
      }
      if (!isUuid(requestedId)) {
        return res.status(400).json({ message: 'Invalid company id' })
      }
      const exists = await Company.findByPk(requestedId)
      if (!exists) return res.status(404).json({ message: 'Department not found' })

      req.companyId = requestedId
      req.isCrossCompany = false
      return applyCompanyRole(req, requestedId, next)
    }

    // ── Everyone else ─────────────────────────────────────────────
    // A user may only ever operate inside a company they are actually
    // a member of. We accept the header only as a *selection* among
    // their own memberships — never as a way to reach a new company.
    const memberships = req.memberships || []
    const memberCompanyIds = new Set(
      memberships.map((m) => String(m.companyId)).filter(Boolean)
    )
    if (req.user.companyId) memberCompanyIds.add(String(req.user.companyId))

    if (memberCompanyIds.size === 0) {
      return res.status(403).json({
        message:
          'Your account is not assigned to a company yet. Contact an administrator.',
      })
    }

    if (requestedId) {
      if (!isUuid(requestedId)) {
        return res.status(400).json({ message: 'Invalid company id' })
      }
      // The check that closes the hole: the requested company must be
      // one this user already belongs to.
      if (!memberCompanyIds.has(String(requestedId))) {
        return res.status(403).json({
          message: 'You do not have access to this company.',
        })
      }
      req.companyId = String(requestedId)
      req.isCrossCompany = false
      return applyCompanyRole(req, req.companyId, next)
    }

    // No header: fall back to the user's home company, or their first
    // membership if the home company was never set.
    req.companyId = req.user.companyId
      ? String(req.user.companyId)
      : String(memberships[0].companyId)
    req.isCrossCompany = false
    return applyCompanyRole(req, req.companyId, next)
  } catch (err) {
    next(err)
  }
}

/**
 * Swaps in the role the user holds inside the active company.
 *
 * A user who belongs to three companies can now hold a different role
 * in each one (user_companies.roleId). When no per-company role is set
 * the user's home role (users.roleId) is used, so existing accounts
 * behave exactly as they did before.
 */
async function applyCompanyRole(req, companyId, next) {
  try {
    if (!companyId) return next() // super admin viewing everything

    const membership = (req.memberships || []).find(
      (m) => String(m.companyId) === String(companyId)
    )

    const effectiveRoleId = membership?.roleId || req.user.roleId

    if (effectiveRoleId && String(effectiveRoleId) !== String(req.roleIdInUse)) {
      req.permissionSet = await resolveRolePermissions(effectiveRoleId)
      req.roleIdInUse = effectiveRoleId
    }

    return next()
  } catch (err) {
    return next(err)
  }
}

/**
 * requireCompanyAdmin
 * ----------------
 * Previously checked for the role 'department_head', which does not
 * exist in the User.role ENUM, so the check could never pass. Now it
 * accepts the roles that actually exist and also honours the RBAC
 * 'company.update' permission.
 */
export const requireCompanyAdmin = (req, res, next) => {
  if (req.user.role === 'super_admin' || req.user.role === 'admin') return next()
  if (req.permissionSet?.has('company.update')) return next()
  return res.status(403).json({ message: 'Company administrator access required' })
}