import { getCompanyMap, getDescendantIds } from "../utils/companyTree.js"

export const resolveCompanyRank = async (req, res, next) => {
  req.activeCompanyId = null
  req.isParentCompany = false
  req.isParentSuperAdmin = false
  req.isPlatformScope = false

  try {
    if (!req.user) return next()

    const isSuperAdmin = req.user.role === "super_admin"
    const companyId = req.companyId || req.user.companyId || null

    if (!companyId) {
      req.isPlatformScope = isSuperAdmin
      req.isParentCompany = isSuperAdmin
      req.isParentSuperAdmin = isSuperAdmin
      return next()
    }

    req.activeCompanyId = String(companyId)

    const map = await getCompanyMap()
    const company = map.get(String(companyId))

    req.isParentCompany = !!company && !company.parentId
    req.isParentSuperAdmin = isSuperAdmin && req.isParentCompany

    return next()
  } catch (err) {
    console.error("resolveCompanyRank failed:", err.message)
    return next()
  }
}

const logDenial = async (req, reason) => {
  try {
    const { logEvent, getRequestMeta } = await import("../utils/audit.js")
    await logEvent({
      companyId: req.activeCompanyId || req.user?.companyId || null,
      userId: req.user?.id || null,
      action: "company_scope_denied",
      resource: "Authorization",
      resourceId: reason,
      module: "security",
      status: "failed",
      changes: {
        reason,
        path: req.originalUrl,
        method: req.method,
        isParentCompany: req.isParentCompany,
        role: req.user?.role || null,
      },
      ...getRequestMeta(req),
    })
  } catch {
    // Never let audit logging break the response.
  }
}

export const requireParentCompany = async (req, res, next) => {
  if (req.isParentCompany) return next()
  await logDenial(req, "parent_company_required")
  return res.status(403).json({
    message: "This section is only available to the parent company.",
  })
}

export const requireParentSuperAdmin = async (req, res, next) => {
  if (req.isParentSuperAdmin) return next()
  await logDenial(
    req,
    req.isParentCompany ? "super_admin_required" : "parent_company_required"
  )
  return res.status(403).json({
    message: req.isParentCompany
      ? "Only a super admin can perform this action."
      : "This section is only available to the parent company.",
  })
}

export const isCompanyInScope = async (req, targetCompanyId) => {
  if (!targetCompanyId) return false
  if (req.isPlatformScope) return true
  if (!req.activeCompanyId) return false

  const target = String(targetCompanyId)
  if (target === req.activeCompanyId) return true

  const descendants = await getDescendantIds(req.activeCompanyId)
  return descendants.includes(target)
}

export default {
  resolveCompanyRank,
  requireParentCompany,
  requireParentSuperAdmin,
  isCompanyInScope,
}
