import jwt from "jsonwebtoken";
import { User, Role, UserCompany } from "../models/index.js";
import {
  normalizePermissions,
  checkPermission,
  mergePermissionSets,
} from "../config/permissions.js";

/*
|--------------------------------------------------------------------------
| Role permission cache
|--------------------------------------------------------------------------
| protect() runs on every single request, and resolving a role's
| permissions means walking its parent chain. Roles change rarely, so we
| cache the resolved Set for a short window. Any write in
| roles.routes.js calls invalidateRoleCache() so changes still take
| effect immediately — the behaviour the original code got right and
| that we must not lose.
*/
const roleCache = new Map();
const ROLE_CACHE_TTL_MS = 60 * 1000;

export const invalidateRoleCache = (roleId = null) => {
  if (roleId) roleCache.delete(String(roleId));
  else roleCache.clear();
};

/**
 * Resolves a role's effective permissions, including everything
 * inherited from its parent roles.
 */
const resolveRolePermissions = async (roleId, depth = 0) => {
  if (!roleId || depth > 5) return new Set();

  const cacheKey = String(roleId);
  const cached = roleCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.permissions;

  const role = await Role.findByPk(roleId, {
    attributes: ["id", "permissions", "parentRoleId", "isActive", "isDeleted"],
  });

  if (!role || !role.isActive || role.isDeleted) return new Set();

  const own = normalizePermissions(role.permissions);
  const inherited = role.parentRoleId
    ? await resolveRolePermissions(role.parentRoleId, depth + 1)
    : new Set();

  const merged = mergePermissionSets([inherited, own]);

  roleCache.set(cacheKey, {
    permissions: merged,
    expires: Date.now() + ROLE_CACHE_TTL_MS,
  });

  return merged;
};

export { resolveRolePermissions };

/*
|--------------------------------------------------------------------------
| protect — authentication
|--------------------------------------------------------------------------
*/
export const protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization;

    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = header.split(" ")[1];

    // Pin the algorithm. Without this an attacker could try to get the
    // token verified under a different scheme.
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ["password", "mfaSecret"] },
      include: [
        {
          association: "roleInfo",
          attributes: [
            "id",
            "name",
            "permissions",
            "parentRoleId",
            "level",
            "isActive",
            "isDeleted",
          ],
        },
        {
          model: UserCompany,
          as: "memberships",
          attributes: ["companyId", "roleId", "isPrimary", "isActive"],
          required: false,
        },
      ],
    });

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (!user.isActive || user.status === "suspended") {
      return res.status(401).json({ message: "Account deactivated" });
    }

    // Session invalidation. Bumping users.tokenVersion (on password
    // change, role change, or forced logout) kills every token already
    // issued for this account. Tokens minted before this field existed
    // carry no `tv` claim and are treated as version 0.
    const tokenVersion = decoded.tv ?? 0;
    if (tokenVersion !== (user.tokenVersion || 0)) {
      return res.status(401).json({
        message: "Session expired. Please sign in again.",
        code: "TOKEN_REVOKED",
      });
    }

    if (user.roleInfo && (!user.roleInfo.isActive || user.roleInfo.isDeleted)) {
      return res.status(403).json({ message: "Assigned role is inactive." });
    }

    req.user = user;

    // Every company this user belongs to, and the role they hold there.
    req.memberships = (user.memberships || []).filter((m) => m.isActive !== false);

    // Default to the home role. resolveCompany() runs next and swaps in
    // the per-company role once the active company is known.
    req.permissionSet = await resolveRolePermissions(user.roleId);
    req.roleIdInUse = user.roleId;

    // Kept for backwards compatibility with any code still reading
    // req.permissions as a plain object.
    req.permissions = user.roleInfo?.permissions || {};

    req.context = {
      userId: user.id,
      // SECURITY: this used to read `req.headers["x-company-id"] || user.companyId`,
      // which let any caller pick their own tenant. The header is now
      // validated exclusively by resolveCompany(), which writes the
      // trusted value to req.companyId.
      companyId: user.companyId,
      role: user.role,
      roleId: user.roleId,
      email: user.email,
      name: user.name,
    };

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res
        .status(401)
        .json({ message: "Session expired. Please sign in again.", code: "TOKEN_EXPIRED" });
    }
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

/*
|--------------------------------------------------------------------------
| authorize — legacy coarse role check
|--------------------------------------------------------------------------
| Kept because roles/settings/audit/employees/performance routes still
| use it. New routes should prefer authorizePermission().
|
| This also removes the duplicate copy that lived in
| middleware/authorize.js, which was imported by nothing.
*/
export const authorize =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }
    next();
  };

/*
|--------------------------------------------------------------------------
| authorizePermission — action-level RBAC
|--------------------------------------------------------------------------
| Previously this granted an entire module if permissions[module] was
| true, so "leads.view" and "leads.delete" were the same thing. It now
| checks the exact "module.action" key.
|
| Legacy roles stored as { leads: true } still work — normalizePermissions()
| expands them to every action on that module — so nothing that works
| today stops working.
*/
export const authorizePermission =
  (permission) =>
  async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Super admin bypass. Still a bypass, but now it is recorded.
      if (req.user.role === "super_admin") {
        req.usedSuperAdminOverride = true;
        return next();
      }

      const granted = req.permissionSet || new Set();

      if (checkPermission(granted, permission)) return next();

      // Record the denial. Import is done lazily to avoid a circular
      // dependency between middleware and utils.
      try {
        const { logEvent, getRequestMeta } = await import("../utils/audit.js");
        await logEvent({
          companyId: req.companyId || req.user.companyId,
          userId: req.user.id,
          action: "permission_denied",
          resource: "Authorization",
          resourceId: permission,
          module: "security",
          status: "failed",
          changes: { permission, path: req.originalUrl, method: req.method },
          ...getRequestMeta(req),
        });
      } catch {
        // Never let audit logging break the response.
      }

      return res.status(403).json({
        message: "You do not have permission to perform this action.",
        required: permission,
      });
    } catch (err) {
      next(err);
    }
  };

/** Passes when the user holds ANY one of the listed permissions. */
export const authorizeAny =
  (...permissions) =>
  (req, res, next) => {
    if (req.user?.role === "super_admin") return next();

    const granted = req.permissionSet || new Set();
    if (permissions.some((p) => checkPermission(granted, p))) return next();

    return res.status(403).json({
      message: "You do not have permission to perform this action.",
      required: permissions,
    });
  };

/** Passes only when the user holds EVERY listed permission. */
export const authorizeAll =
  (...permissions) =>
  (req, res, next) => {
    if (req.user?.role === "super_admin") return next();

    const granted = req.permissionSet || new Set();
    if (permissions.every((p) => checkPermission(granted, p))) return next();

    return res.status(403).json({
      message: "You do not have permission to perform this action.",
      required: permissions,
    });
  };

/**
 * Convenience helper for use *inside* a route handler, where you need
 * to branch on a permission rather than reject the whole request.
 *
 *   if (can(req, 'leads.delete')) { ... }
 */
export const can = (req, permission) => {
  if (req.user?.role === "super_admin") return true;
  return checkPermission(req.permissionSet || new Set(), permission);
};