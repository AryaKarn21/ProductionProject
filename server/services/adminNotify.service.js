import { Op } from "sequelize"
import { User, UserCompany, Company } from "../models/index.js"
import { notifyUsers } from "./notification.service.js"

const ADMIN_ROLES = ["super_admin", "admin"]

export const resolveAdminRecipients = async ({
  companyId,
  excludeUserId = null,
  includeAncestors = false,
}) => {
  if (!companyId) return []

  const companyIds = [String(companyId)]

  if (includeAncestors) {
    const company = await Company.findByPk(companyId, { attributes: ["parentId"] })
    if (company?.parentId) companyIds.push(String(company.parentId))
  }

  const memberships = await UserCompany.findAll({
    where: { companyId: { [Op.in]: companyIds }, isActive: true },
    attributes: ["userId"],
    raw: true,
  })

  const memberIds = memberships.map((m) => String(m.userId))

  const admins = await User.findAll({
    where: {
      isActive: true,
      role: { [Op.in]: ADMIN_ROLES },
      [Op.or]: [
        { companyId: { [Op.in]: companyIds } },
        ...(memberIds.length ? [{ id: { [Op.in]: memberIds } }] : []),
      ],
    },
    attributes: ["id"],
    raw: true,
  })

  const ids = [...new Set(admins.map((u) => String(u.id)))]

  return excludeUserId ? ids.filter((id) => id !== String(excludeUserId)) : ids
}

const dispatch = async ({
  companyId,
  senderId,
  includeAncestors = false,
  type,
  title,
  message,
  priority = "medium",
  actionUrl = null,
  metadata = {},
}) => {
  try {
    const userIds = await resolveAdminRecipients({
      companyId,
      excludeUserId: senderId,
      includeAncestors,
    })

    if (!userIds.length) return 0

    await notifyUsers({
      companyId,
      userIds,
      senderId,
      module: "settings",
      type,
      title,
      message,
      priority,
      actionUrl,
      metadata,
    })

    return userIds.length
  } catch (err) {
    console.error("adminNotify(" + type + ") failed:", err.message)
    return 0
  }
}

export const notifyCompanyCreated = async ({ company, actorId, actorName, parentName }) => {
  const homeCompanyId = company.parentId || company.id

  return dispatch({
    companyId: homeCompanyId,
    senderId: actorId,
    type: "company_created",
    title: "New company added",
    message: parentName
      ? (actorName || "An administrator") + " created " + company.name + " under " + parentName + "."
      : (actorName || "An administrator") + " created " + company.name + ".",
    priority: "high",
    actionUrl: "/settings?tab=company",
    metadata: {
      companyId: company.id,
      companyName: company.name,
      parentId: company.parentId || null,
    },
  })
}

export const notifyUserCreated = async ({
  user,
  companyId,
  actorId,
  actorName,
  roleName = null,
  linkedExisting = false,
}) => {
  const what = linkedExisting
    ? user.name + " was given access to this company"
    : (actorName || "An administrator") + " created an account for " + user.name

  return dispatch({
    companyId,
    senderId: actorId,
    type: linkedExisting ? "user_access_granted" : "user_created",
    title: linkedExisting ? "User granted company access" : "New user created",
    message: roleName ? what + " with the " + roleName + " role." : what + ".",
    priority: "high",
    actionUrl: "/settings/users/" + user.id,
    metadata: {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      roleName,
      linkedExisting,
    },
  })
}

export const notifyRoleCreated = async ({ role, companyId, actorId, actorName }) => {
  const grantedCount = Object.values(role.permissions || {}).filter(Boolean).length

  return dispatch({
    companyId,
    senderId: actorId,
    type: "role_created",
    title: "New role created",
    message:
      (actorName || "An administrator") +
      ' created the role "' + role.name + '"' +
      (grantedCount
        ? " with " + grantedCount + " permission" + (grantedCount === 1 ? "" : "s")
        : "") +
      ".",
    priority: "medium",
    actionUrl: "/settings?tab=roles",
    metadata: {
      roleId: role.id,
      roleName: role.name,
      permissionCount: grantedCount,
    },
  })
}

export default {
  resolveAdminRecipients,
  notifyCompanyCreated,
  notifyUserCreated,
  notifyRoleCreated,
}
