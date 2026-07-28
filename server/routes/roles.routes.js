import express from 'express'
import { Op } from 'sequelize'
import { Role, User, UserCompany } from '../models/index.js'
import { authorize, authorizePermission, invalidateRoleCache } from '../middleware/auth.js'
import { validate, rules, validateUuidParam, parsePagination } from '../middleware/validate.js'
import { logFromRequest, diffChanges } from '../utils/audit.js'
import { ALL_PERMISSION_KEYS, normalizePermissions } from '../config/permissions.js'
import { getRoleScopeIds } from '../utils/companyTree.js'

const router = express.Router()

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

// Only these fields may be written from a request body. The old code did
// `Role.create({ ...req.body })` and `role.update(req.body)`, which let a
// caller set `id`, flip `isDeleted`, or move a role into another
// company's tenant by sending a different companyId.
const ROLE_WRITABLE_FIELDS = ['name', 'description', 'permissions', 'parentRoleId', 'level']

const pick = (source, allowed) =>
  allowed.reduce((acc, key) => {
    if (source[key] !== undefined) acc[key] = source[key]
    return acc
  }, {})

/**
 * Every bulk and single-record query goes through this so a role in
 * another company can never be reached, even if its UUID is known.
 *
 * The bulk endpoints previously had no company filter at all — an admin
 * of one company could deactivate or trash every role in another.
 */
const scopeWhere = (req, extra = {}) => {
  const where = { ...extra }
  if (req.companyId) where.companyId = req.companyId
  return where
}

/*
| readScopeWhere — the same thing, widened to INHERITED roles.
|
| Roles are defined once by the group parent (OS Group owns
| Administrator, Manager, Accountant and Employee) and held by users
| across every company beneath it — 12 of 17 users on this deployment
| hold a role owned by a company other than their own.
|
| With the strict scope above, those roles were invisible from any
| child company: the Roles screen listed only locally-owned roles, so
| an admin could not see, let alone reassign, the role most of their
| users actually held.
|
| Inheritance is strictly UPWARD — own company plus ancestors, never a
| sibling — and this is used ONLY on read paths. Every mutating path
| (update, delete, activate, restore, clone-source, bulk, name
| uniqueness) deliberately keeps using scopeWhere(), so a subsidiary
| can USE the group's roles but can never edit or delete them.
*/
const readScopeWhere = async (req, extra = {}) => {
  const where = { ...extra }
  if (req.companyId) {
    where.companyId = { [Op.in]: await getRoleScopeIds(req.companyId) }
  }
  return where
}

/**
 * Strips anything that is not a known permission key.
 *
 * The roles API used to store whatever JSON you sent it, so a caller
 * could inject arbitrary keys into the permission blob. Now only keys
 * from config/permissions.js survive.
 */
const sanitizePermissions = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}

  const clean = {}
  const valid = new Set(ALL_PERMISSION_KEYS)

  for (const [key, value] of Object.entries(input)) {
    // react-hook-form turns a field named "permissions.leads.view" into
    // a NESTED object { leads: { view: true } }. Flatten that first,
    // otherwise the whole branch is skipped as a non-boolean and the
    // role saves with no permissions at all.
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [action, allowed] of Object.entries(value)) {
        if (typeof allowed !== 'boolean') continue
        const full = `${key}.${action}`
        if (valid.has(full)) clean[full] = allowed
      }
      continue
    }

    if (typeof value !== 'boolean') continue

    if (valid.has(key)) {
      clean[key] = value
      continue
    }

    // Accept the legacy flat form ({ leads: true }) by expanding it, so
    // the existing permission matrix UI keeps working until the
    // frontend is updated in the next batch.
    const expanded = ALL_PERMISSION_KEYS.filter((k) => k.startsWith(`${key}.`))
    if (expanded.length) {
      expanded.forEach((k) => {
        clean[k] = value
      })
    }
  }

  return clean
}

/**
 * Privilege-escalation guard: you cannot create or edit a role that
 * grants more than you hold yourself, and you cannot raise a role above
 * your own level. Super admin is exempt.
 */
const assertNoEscalation = (req, permissions, level) => {
  if (req.user.role === 'super_admin') return null

  const myLevel = req.user.roleInfo?.level ?? 0
  if (level !== undefined && Number(level) > myLevel) {
    return 'You cannot create a role with more authority than your own.'
  }

  const mine = req.permissionSet || new Set()
  const requested = normalizePermissions(permissions)

  const excess = [...requested].filter((key) => !mine.has(key))
  if (excess.length) {
    return `You cannot grant permissions you do not hold yourself: ${excess.slice(0, 5).join(', ')}${
      excess.length > 5 ? ` and ${excess.length - 5} more` : ''
    }`
  }

  return null
}

/**
 * Enforces unique role names per company at the application level.
 *
 * A database UNIQUE (companyId, name) index cannot be used here because
 * roles are soft-deleted, and MySQL has no partial indexes — a trashed
 * role would reserve its name permanently. Checking only non-deleted
 * rows gives the same guarantee without that trap.
 */
const nameTaken = async (req, name, excludeId = null) => {
  const where = scopeWhere(req, { name, isDeleted: false })
  if (excludeId) where.id = { [Op.ne]: excludeId }
  const existing = await Role.findOne({ where })
  return !!existing
}

/*
|--------------------------------------------------------------------------
| List / stats / read
|--------------------------------------------------------------------------
*/

router.get('/', authorizePermission('roles.view'), async (req, res, next) => {
  try {
    const { search = '', status, includeDeleted } = req.query
    const { page, limit, offset } = parsePagination(req)

    const where = await readScopeWhere(req)
    if (!includeDeleted || includeDeleted === 'false') where.isDeleted = false
    if (status === 'active') where.isActive = true
    if (status === 'inactive') where.isActive = false
    if (search) where.name = { [Op.like]: `%${search}%` }

    const { rows, count } = await Role.findAndCountAll({
      where,
      include: [{ model: Role, as: 'parent', attributes: ['id', 'name'], required: false }],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    })

    // Live user count per role.
    const roleIds = rows.map((r) => r.id)
    let countMap = {}

    if (roleIds.length) {
      const counts = await User.findAll({
        where: { roleId: { [Op.in]: roleIds } },
        attributes: ['roleId', [User.sequelize.fn('COUNT', User.sequelize.col('id')), 'count']],
        group: ['roleId'],
        raw: true,
      })
      countMap = Object.fromEntries(counts.map((c) => [c.roleId, Number(c.count)]))
    }

    const roles = rows.map((r) => ({ ...r.toJSON(), userCount: countMap[r.id] || 0 }))

    res.json({ roles, total: count, page, limit })
  } catch (err) {
    next(err)
  }
})

router.get('/stats', authorizePermission('roles.view'), async (req, res, next) => {
  try {
    const where = await readScopeWhere(req)

    const [total, active, inactive, deleted] = await Promise.all([
      Role.count({ where: { ...where, isDeleted: false } }),
      Role.count({ where: { ...where, isDeleted: false, isActive: true } }),
      Role.count({ where: { ...where, isDeleted: false, isActive: false } }),
      Role.count({ where: { ...where, isDeleted: true } }),
    ])

    // These two counts were global — they reported user totals across
    // every company on the platform regardless of who was asking.
    const userWhere = req.companyId ? { companyId: req.companyId } : {}

    const [usersWithRole, usersWithoutRole] = await Promise.all([
      User.count({ where: { ...userWhere, roleId: { [Op.ne]: null } } }),
      User.count({ where: { ...userWhere, roleId: null } }),
    ])

    res.json({ total, active, inactive, deleted, usersWithRole, usersWithoutRole })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/roles/permission-catalog
 *
 * Returns the permission registry so the matrix UI renders from the
 * same source of truth the server enforces against, instead of a
 * hardcoded frontend list that had drifted out of step.
 */
router.get('/permission-catalog', authorizePermission('roles.view'), async (req, res, next) => {
  try {
    const { MODULES, MODULE_GROUPS, ACTION_LABELS, PERMISSION_DEPENDENCIES } = await import(
      '../config/permissions.js'
    )
    res.json({
      modules: MODULES,
      groups: MODULE_GROUPS,
      actionLabels: ACTION_LABELS,
      dependencies: PERMISSION_DEPENDENCIES,
      allKeys: ALL_PERMISSION_KEYS,
    })
  } catch (err) {
    next(err)
  }
})

router.get('/:id', validateUuidParam('id'), authorizePermission('roles.view'), async (req, res, next) => {
  try {
    const role = await Role.findOne({
      where: await readScopeWhere(req, { id: req.params.id }),
      include: [{ model: Role, as: 'parent', attributes: ['id', 'name'], required: false }],
    })
    if (!role) return res.status(404).json({ message: 'Role not found' })

    const userCount = await User.count({ where: { roleId: role.id } })

    res.json({ ...role.toJSON(), userCount })
  } catch (err) {
    next(err)
  }
})

/*
|--------------------------------------------------------------------------
| Create / update
|--------------------------------------------------------------------------
*/

router.post(
  '/',
  authorizePermission('roles.create'),
  validate({
    name: rules.string({ required: true, min: 2, max: 100 }),
    description: rules.string({ max: 1000 }),
    permissions: rules.object(),
    parentRoleId: rules.uuid(),
    level: rules.integer({ min: 0, max: 100 }),
  }),
  async (req, res, next) => {
    try {
      const companyId = req.companyId || req.user.companyId
      if (!companyId) {
        return res.status(400).json({ message: 'Select a company before creating a role.' })
      }

      if (await nameTaken(req, req.body.name)) {
        return res.status(409).json({ message: `A role named "${req.body.name}" already exists.` })
      }

      const permissions = sanitizePermissions(req.body.permissions)

      const problem = assertNoEscalation(req, permissions, req.body.level)
      if (problem) return res.status(403).json({ message: problem })

      if (req.body.parentRoleId) {
        const parent = await Role.findOne({
          where: scopeWhere(req, { id: req.body.parentRoleId, isDeleted: false }),
        })
        if (!parent) return res.status(400).json({ message: 'Parent role not found.' })
      }

      const role = await Role.create({
        ...pick(req.body, ROLE_WRITABLE_FIELDS),
        permissions,
        companyId, // always from the server, never from the body
        isSystem: false,
        createdById: req.user.id,
        updatedById: req.user.id,
      })

      await logFromRequest(req, {
        action: 'role_created',
        resource: 'Role',
        resourceId: role.id,
        module: 'settings',
        changes: { after: { name: role.name, permissions: role.permissions } },
      })

      res.status(201).json(role)
    } catch (err) {
      next(err)
    }
  }
)

router.patch(
  '/:id',
  validateUuidParam('id'),
  authorizePermission('roles.update'),
  validate({
    name: rules.string({ min: 2, max: 100 }),
    description: rules.string({ max: 1000 }),
    permissions: rules.object(),
    parentRoleId: rules.uuid({ nullable: true }),
    level: rules.integer({ min: 0, max: 100 }),
  }),
  async (req, res, next) => {
    try {
      const role = await Role.findOne({ where: scopeWhere(req, { id: req.params.id }) })
      if (!role) return res.status(404).json({ message: 'Role not found' })

      if (role.isSystem && req.user.role !== 'super_admin') {
        return res.status(403).json({ message: 'System roles cannot be modified.' })
      }

      if (req.body.name && (await nameTaken(req, req.body.name, role.id))) {
        return res.status(409).json({ message: `A role named "${req.body.name}" already exists.` })
      }

      // A role cannot be its own parent, and cannot inherit from a role
      // outside its company.
      if (req.body.parentRoleId) {
        if (String(req.body.parentRoleId) === String(role.id)) {
          return res.status(400).json({ message: 'A role cannot inherit from itself.' })
        }
        const parent = await Role.findOne({
          where: scopeWhere(req, { id: req.body.parentRoleId, isDeleted: false }),
        })
        if (!parent) return res.status(400).json({ message: 'Parent role not found.' })
        if (String(parent.parentRoleId) === String(role.id)) {
          return res.status(400).json({ message: 'That would create a circular inheritance chain.' })
        }
      }

      const updates = pick(req.body, ROLE_WRITABLE_FIELDS)

      if (updates.permissions !== undefined) {
        updates.permissions = sanitizePermissions(updates.permissions)
        const problem = assertNoEscalation(req, updates.permissions, updates.level)
        if (problem) return res.status(403).json({ message: problem })
      }

      const before = { name: role.name, permissions: role.permissions, level: role.level }

      await role.update({ ...updates, updatedById: req.user.id })

      // Permission changes must take effect on the very next request.
      invalidateRoleCache(role.id)

      // Sign out everyone holding this role so their frontend reloads
      // with the new permission set rather than a stale menu.
      await User.update(
        { tokenVersion: User.sequelize.literal('tokenVersion + 1') },
        { where: { roleId: role.id } }
      )

      await logFromRequest(req, {
        action: 'role_updated',
        resource: 'Role',
        resourceId: role.id,
        module: 'settings',
        changes: diffChanges(before, {
          name: role.name,
          permissions: role.permissions,
          level: role.level,
        }),
      })

      res.json(role)
    } catch (err) {
      next(err)
    }
  }
)

/*
|--------------------------------------------------------------------------
| Clone
|--------------------------------------------------------------------------
*/

router.post(
  '/:id/clone',
  validateUuidParam('id'),
  authorizePermission('roles.create'),
  async (req, res, next) => {
    try {
      const source = await Role.findOne({ where: scopeWhere(req, { id: req.params.id }) })
      if (!source) return res.status(404).json({ message: 'Role not found' })

      // Find a free name rather than failing on the duplicate.
      let name = `${source.name} (Copy)`
      let n = 2
      while (await nameTaken(req, name)) {
        name = `${source.name} (Copy ${n++})`
        if (n > 50) break
      }

      const clone = await Role.create({
        companyId: source.companyId,
        name,
        description: source.description,
        permissions: source.permissions,
        parentRoleId: source.parentRoleId,
        level: source.level,
        isSystem: false,
        createdById: req.user.id,
        updatedById: req.user.id,
      })

      await logFromRequest(req, {
        action: 'role_cloned',
        resource: 'Role',
        resourceId: clone.id,
        module: 'settings',
        changes: { clonedFrom: source.id, clonedFromName: source.name, name: clone.name },
      })

      res.status(201).json(clone)
    } catch (err) {
      next(err)
    }
  }
)

/*
|--------------------------------------------------------------------------
| Activate / deactivate / delete / restore
|--------------------------------------------------------------------------
*/

const setActive = (isActive) => async (req, res, next) => {
  try {
    const role = await Role.findOne({ where: scopeWhere(req, { id: req.params.id }) })
    if (!role) return res.status(404).json({ message: 'Role not found' })

    if (role.isSystem && !isActive) {
      return res.status(403).json({ message: 'System roles cannot be deactivated.' })
    }

    // Deactivating a role blocks every user holding it on their next
    // request (protect() rejects inactive roles), so warn about scope.
    if (!isActive) {
      const affected = await User.count({ where: { roleId: role.id } })
      if (affected > 0 && req.query.confirm !== 'true') {
        return res.status(409).json({
          message: `${affected} user(s) hold this role and will lose access immediately.`,
          requiresConfirmation: true,
          affectedUsers: affected,
        })
      }
    }

    await role.update({ isActive, updatedById: req.user.id })
    invalidateRoleCache(role.id)

    await logFromRequest(req, {
      action: isActive ? 'role_activated' : 'role_deactivated',
      resource: 'Role',
      resourceId: role.id,
      module: 'settings',
      changes: { name: role.name },
    })

    res.json(role)
  } catch (err) {
    next(err)
  }
}

router.patch('/:id/activate', validateUuidParam('id'), authorizePermission('roles.update'), setActive(true))
router.patch('/:id/deactivate', validateUuidParam('id'), authorizePermission('roles.update'), setActive(false))

router.delete('/:id', validateUuidParam('id'), authorizePermission('roles.delete'), async (req, res, next) => {
  try {
    const role = await Role.findOne({ where: scopeWhere(req, { id: req.params.id }) })
    if (!role) return res.status(404).json({ message: 'Role not found' })

    if (role.isSystem) {
      return res.status(403).json({ message: 'System roles cannot be deleted.' })
    }

    const assigned = await User.count({ where: { roleId: role.id } })
    if (assigned > 0) {
      return res.status(409).json({
        message: `Cannot delete: ${assigned} user(s) are assigned to this role. Reassign them first.`,
        assignedUsers: assigned,
      })
    }

    const children = await Role.count({ where: { parentRoleId: role.id, isDeleted: false } })
    if (children > 0) {
      return res.status(409).json({
        message: `Cannot delete: ${children} role(s) inherit from this one.`,
      })
    }

    await role.update({ isDeleted: true, deletedAt: new Date(), updatedById: req.user.id })
    invalidateRoleCache(role.id)

    await logFromRequest(req, {
      action: 'role_deleted',
      resource: 'Role',
      resourceId: role.id,
      module: 'settings',
      changes: { before: { name: role.name } },
    })

    res.json({ message: 'Role moved to trash' })
  } catch (err) {
    next(err)
  }
})

router.patch('/:id/restore', validateUuidParam('id'), authorizePermission('roles.update'), async (req, res, next) => {
  try {
    const role = await Role.findOne({ where: scopeWhere(req, { id: req.params.id }) })
    if (!role) return res.status(404).json({ message: 'Role not found' })

    // Restoring must not resurrect a name that has since been reused.
    if (await nameTaken(req, role.name, role.id)) {
      return res.status(409).json({
        message: `A role named "${role.name}" already exists. Rename it before restoring.`,
      })
    }

    await role.update({ isDeleted: false, deletedAt: null, updatedById: req.user.id })
    invalidateRoleCache(role.id)

    await logFromRequest(req, {
      action: 'role_restored',
      resource: 'Role',
      resourceId: role.id,
      module: 'settings',
      changes: { name: role.name },
    })

    res.json(role)
  } catch (err) {
    next(err)
  }
})

router.delete('/:id/permanent', validateUuidParam('id'), authorize('super_admin'), async (req, res, next) => {
  try {
    const role = await Role.findOne({ where: { id: req.params.id } })
    if (!role) return res.status(404).json({ message: 'Role not found' })

    if (role.isSystem) {
      return res.status(403).json({ message: 'System roles cannot be deleted.' })
    }

    if (!role.isDeleted) {
      return res
        .status(400)
        .json({ message: 'Role must be soft-deleted before it can be permanently removed.' })
    }

    const assignedCount = await User.count({ where: { roleId: role.id } })
    if (assignedCount > 0) {
      return res.status(400).json({
        message: `Cannot permanently delete: ${assignedCount} user(s) are still assigned to this role.`,
      })
    }

    // Per-company assignments also point at this role.
    await UserCompany.update({ roleId: null }, { where: { roleId: role.id } })
    await Role.update({ parentRoleId: null }, { where: { parentRoleId: role.id } })

    await logFromRequest(req, {
      companyId: role.companyId,
      action: 'role_permanently_deleted',
      resource: 'Role',
      resourceId: role.id,
      module: 'settings',
      changes: { before: { name: role.name, permissions: role.permissions } },
    })

    await role.destroy()
    invalidateRoleCache(role.id)

    res.json({ message: 'Role permanently deleted' })
  } catch (err) {
    next(err)
  }
})

/*
|--------------------------------------------------------------------------
| Bulk actions
|--------------------------------------------------------------------------
|
| All three previously ran `Role.update(..., { where: { id: ids } })`
| with NO company filter and NO audit logging, so an admin of one
| company could deactivate or trash every role in another simply by
| posting their UUIDs — and nothing would be recorded.
*/

const bulkAction = (action) => async (req, res, next) => {
  try {
    const { ids = [] } = req.body

    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ message: 'No role IDs provided' })
    }
    if (ids.length > 200) {
      return res.status(400).json({ message: 'Too many roles in one request (max 200).' })
    }

    // Resolve first, so we only ever touch roles inside our own tenant.
    const roles = await Role.findAll({
      where: scopeWhere(req, { id: { [Op.in]: ids } }),
      attributes: ['id', 'name', 'isSystem'],
    })

    const editable = roles.filter((r) => !r.isSystem)
    const editableIds = editable.map((r) => r.id)

    if (!editableIds.length) {
      return res.status(400).json({ message: 'No eligible roles in the selection.' })
    }

    if (action === 'delete') {
      const assigned = await User.count({ where: { roleId: { [Op.in]: editableIds } } })
      if (assigned > 0) {
        return res.status(409).json({
          message: `Cannot delete: ${assigned} user(s) are assigned to the selected role(s).`,
        })
      }
    }

    const payload =
      action === 'activate'
        ? { isActive: true }
        : action === 'deactivate'
          ? { isActive: false }
          : { isDeleted: true, deletedAt: new Date() }

    await Role.update(
      { ...payload, updatedById: req.user.id },
      { where: { id: { [Op.in]: editableIds } } }
    )

    editableIds.forEach((id) => invalidateRoleCache(id))

    await logFromRequest(req, {
      action: `role_bulk_${action}`,
      resource: 'Role',
      resourceId: null,
      module: 'settings',
      changes: {
        roleIds: editableIds,
        roleNames: editable.map((r) => r.name),
        skipped: ids.length - editableIds.length,
      },
    })

    const verb =
      action === 'activate' ? 'activated' : action === 'deactivate' ? 'deactivated' : 'moved to trash'

    res.json({
      message: `${editableIds.length} role(s) ${verb}`,
      updated: editableIds.length,
      skipped: ids.length - editableIds.length,
    })
  } catch (err) {
    next(err)
  }
}

router.post('/bulk-activate', authorizePermission('roles.update'), bulkAction('activate'))
router.post('/bulk-deactivate', authorizePermission('roles.update'), bulkAction('deactivate'))
router.post('/bulk-delete', authorizePermission('roles.delete'), bulkAction('delete'))

export default router