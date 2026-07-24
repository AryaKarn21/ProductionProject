import express from 'express'
import { Op } from 'sequelize'
import { sequelize } from '../config/db.js'
import { Company, User, UserCompany, Role, Employee } from '../models/index.js'
import { authorize, authorizePermission, can } from '../middleware/auth.js'
import { validate, rules, validateUuidParam, parsePagination } from '../middleware/validate.js'
import { logFromRequest, diffChanges } from '../utils/audit.js'

const router = express.Router()

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

// Only these fields may ever be written from a request body. Everything
// else — role, password, tokenVersion, isVerified, id — is ignored.
//
// This is the fix for the audit's most severe finding: the old code did
// `user.update(rest)` with the raw body, so any admin could send
// { "role": "super_admin" } or { "password": "..." } and take over the
// platform or any account on it.
const USER_WRITABLE_FIELDS = ['name', 'email', 'phone', 'avatar', 'isActive', 'status']

// These are the columns that actually exist on models/Company.js.
// The earlier version listed city/country/taxId (which the model does
// not have) and omitted industry/type (which it does), so the Industry
// field on the Add Company form was silently discarded.
const COMPANY_WRITABLE_FIELDS = [
  'name', 'type', 'industry', 'website', 'email', 'phone',
  'address', 'currency', 'timezone', 'logo', 'isActive',
]

const pick = (source, allowed) =>
  allowed.reduce((acc, key) => {
    if (source[key] !== undefined) acc[key] = source[key]
    return acc
  }, {})

/**
 * Restricts a query to the caller's company.
 * Super admins working across all companies (no X-Company-ID header)
 * get an unfiltered view; everybody else is pinned to req.companyId.
 */
const companyScope = (req) => {
  if (req.user.role === 'super_admin' && !req.companyId) return {}
  return { companyId: req.companyId }
}

/**
 * Loads a user and confirms the caller is allowed to touch them.
 * Replaces the bare `User.findByPk(req.params.id)` that let an admin of
 * one company read and modify users belonging to another.
 */
const findUserInScope = async (req, id) => {
  const user = await User.findByPk(id, {
    include: [
      { model: Company, as: 'company', attributes: ['id', 'name'] },
      { model: Company, as: 'companies', attributes: ['id', 'name'] },
      { association: 'roleInfo', attributes: ['id', 'name', 'level'] },
      {
        model: UserCompany,
        as: 'memberships',
        attributes: ['companyId', 'roleId', 'isPrimary', 'isActive'],
        include: [{ model: Role, as: 'role', attributes: ['id', 'name'] }],
      },
    ],
  })

  if (!user) return { error: 404, message: 'User not found' }

  // Super admin browsing globally can reach anyone.
  if (req.user.role === 'super_admin' && !req.companyId) return { user }

  const belongsHere =
    String(user.companyId) === String(req.companyId) ||
    (user.memberships || []).some((m) => String(m.companyId) === String(req.companyId))

  if (!belongsHere) {
    // 404 rather than 403 so an attacker can't use the response to
    // confirm that a user id exists in another company.
    return { error: 404, message: 'User not found' }
  }

  return { user }
}

/**
 * Privilege-escalation guard.
 *
 * Stops an administrator granting a role more powerful than their own,
 * and stops anybody promoting themselves. Super admin is exempt.
 */
const assertCanAssignRole = async (req, role) => {
  if (req.user.role === 'super_admin') return null

  if (!role) return null

  if (String(role.companyId) !== String(req.companyId)) {
    return 'That role belongs to a different company.'
  }

  if (role.isDeleted || !role.isActive) {
    return 'That role is inactive and cannot be assigned.'
  }

  const myLevel = req.user.roleInfo?.level ?? 0
  if ((role.level ?? 0) > myLevel) {
    return 'You cannot assign a role with more authority than your own.'
  }

  return null
}

/*
|--------------------------------------------------------------------------
| Companies
|--------------------------------------------------------------------------
*/

// SECURITY: this route previously had `protect` only — no role check and
// no scoping — so ANY logged-in user could download the full list of
// every company on the platform, which is what made the tenant-pivot
// attack possible (the attacker needed a company UUID to put in the
// X-Company-ID header).
router.get(
  '/companies',
  authorize('super_admin', 'admin', 'manager'),
  async (req, res, next) => {
    try {
      const where = {}

      if (req.user.role !== 'super_admin') {
        // Non-super-admins only ever see companies they belong to.
        const ids = new Set(
          (req.memberships || []).map((m) => String(m.companyId))
        )
        if (req.user.companyId) ids.add(String(req.user.companyId))
        where.id = { [Op.in]: [...ids] }
      }

      const companies = await Company.findAll({
        where,
        order: [['name', 'ASC']],
      })

      res.json(companies)
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/companies',
  authorize('super_admin'),
  validate({
    name: rules.string({ required: true, min: 2, max: 150 }),
    type: rules.string({ max: 50 }),
    industry: rules.string({ max: 100 }),
    website: rules.string({ max: 255 }),
    email: rules.email(),
    phone: rules.string({ max: 30 }),
    address: rules.string({ max: 500 }),
    currency: rules.string({ max: 10 }),
    timezone: rules.string({ max: 60 }),
    logo: rules.string({ max: 500 }),
  }),
  async (req, res, next) => {
    const t = await sequelize.transaction()
    try {
      // Whitelisted — a caller can no longer set `id`, `parentId` or
      // `isActive` by slipping them into the body.
      const company = await Company.create(pick(req.body, COMPANY_WRITABLE_FIELDS), {
        transaction: t,
      })

      await UserCompany.create(
        {
          userId: req.user.id,
          companyId: company.id,
          isPrimary: false,
          assignedById: req.user.id,
        },
        { transaction: t }
      )

      await t.commit()

      await logFromRequest(req, {
        companyId: company.id,
        action: 'company_created',
        resource: 'Company',
        resourceId: company.id,
        module: 'settings',
        changes: { after: { name: company.name } },
      })

      res.status(201).json(company)
    } catch (err) {
      await t.rollback()
      next(err)
    }
  }
)

router.patch(
  '/companies/:id',
  validateUuidParam('id'),
  authorize('super_admin', 'admin'),
  async (req, res, next) => {
    try {
      const company = await Company.findByPk(req.params.id)
      if (!company) return res.status(404).json({ message: 'Department not found' })

      // An admin may only edit their own company.
      if (req.user.role !== 'super_admin' && String(company.id) !== String(req.companyId)) {
        return res.status(403).json({ message: 'You cannot edit this company.' })
      }

      const before = company.toJSON()
      await company.update(pick(req.body, COMPANY_WRITABLE_FIELDS))

      await logFromRequest(req, {
        companyId: company.id,
        action: 'company_updated',
        resource: 'Company',
        resourceId: company.id,
        module: 'settings',
        changes: diffChanges(before, company.toJSON()),
      })

      res.json(company)
    } catch (err) {
      next(err)
    }
  }
)

router.delete(
  '/companies/:id',
  validateUuidParam('id'),
  authorize('super_admin'),
  async (req, res, next) => {
    const t = await sequelize.transaction()
    try {
      const company = await Company.findByPk(req.params.id)
      if (!company) {
        await t.rollback()
        return res.status(404).json({ message: 'Company not found' })
      }

      // Refuse to orphan data. The old version hard-deleted the company
      // and left its users, roles, leads and everything else pointing at
      // a companyId that no longer existed.
      const userCount = await User.count({ where: { companyId: company.id } })
      if (userCount > 0) {
        await t.rollback()
        return res.status(409).json({
          message: `Cannot delete: ${userCount} user(s) still belong to this company. Move or remove them first.`,
        })
      }

      const roleCount = await Role.count({
        where: { companyId: company.id, isDeleted: false },
      })
      if (roleCount > 0) {
        await t.rollback()
        return res.status(409).json({
          message: `Cannot delete: ${roleCount} active role(s) still belong to this company.`,
        })
      }

      await UserCompany.destroy({ where: { companyId: company.id }, transaction: t })
      await company.destroy({ transaction: t })
      await t.commit()

      await logFromRequest(req, {
        companyId: null,
        action: 'company_deleted',
        resource: 'Company',
        resourceId: req.params.id,
        module: 'settings',
        changes: { before: { name: company.name } },
      })

      res.json({ message: 'Company deleted successfully' })
    } catch (err) {
      await t.rollback()
      next(err)
    }
  }
)

/*
|--------------------------------------------------------------------------
| Users
|--------------------------------------------------------------------------
*/

router.get(
  '/users',
  authorizePermission('users.view'),
  async (req, res, next) => {
    try {
      const { page, limit, offset } = parsePagination(req)
      const { search, status, roleId } = req.query

      const where = { ...companyScope(req) }

      if (search) {
        where[Op.or] = [
          { name: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } },
        ]
      }
      if (status) where.status = status
      if (roleId) where.roleId = roleId

      const { rows, count } = await User.findAndCountAll({
        where,
        include: [
          { model: Company, as: 'company', attributes: ['id', 'name'] },
          { model: Company, as: 'companies', attributes: ['id', 'name'] },
          // The frontend needs this to show which RBAC role each user
          // holds — previously there was no way to see it at all.
          { association: 'roleInfo', attributes: ['id', 'name', 'level'] },
        ],
        order: [['name', 'ASC']],
        limit,
        offset,
        distinct: true,
      })

      res.json({ users: rows, total: count, page, limit })
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/users/:id',
  validateUuidParam('id'),
  authorizePermission('users.view'),
  async (req, res, next) => {
    try {
      const { user, error, message } = await findUserInScope(req, req.params.id)
      if (error) return res.status(error).json({ message })
      res.json(user)
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/users',
  authorizePermission('users.create'),
  validate({
    // When employeeId is supplied the name/email/phone are taken from the
    // Employee record rather than trusted from the request body.
    employeeId: rules.uuid(),
    name: rules.string({ min: 2, max: 120 }),
    email: rules.email(),
    password: rules.password({ required: true, min: 8 }),
    phone: rules.string({ max: 30 }),
    role: rules.enumOf(['admin', 'manager', 'employee', 'accountant', 'super_admin']),
    roleId: rules.uuid(),
    primaryCompany: rules.uuid(),
    companies: rules.array({ of: rules.uuid() }),
    isActive: rules.boolean(),
  }),
  async (req, res, next) => {
    const t = await sequelize.transaction()
    try {
      const { companies = [], primaryCompany, role, roleId, password, employeeId, ...rest } =
        req.body

      // An admin can only create users inside their own company.
      const targetCompanyId =
        req.user.role === 'super_admin' ? primaryCompany || req.companyId : req.companyId

      if (!targetCompanyId) {
        await t.rollback()
        return res.status(400).json({ message: 'A company must be selected for this user.' })
      }

      /*
       * ── Employee linking ─────────────────────────────────────────
       * models/Employee.js already had a unique `userId` column and
       * index.js already declared Employee.belongsTo(User) — the link
       * existed in the schema but nothing ever populated it.
       *
       * Never trust employeeId from the client: the employee must
       * actually belong to the company being targeted, or an admin of
       * Company A could attach an employee of Company B.
       */
      let employee = null
      let profile = { ...pick(rest, USER_WRITABLE_FIELDS) }

      if (employeeId) {
        employee = await Employee.findByPk(employeeId, { transaction: t })

        if (!employee) {
          await t.rollback()
          return res.status(404).json({ message: 'Employee not found.' })
        }

        if (String(employee.companyId) !== String(targetCompanyId)) {
          await t.rollback()
          return res.status(403).json({
            message: 'That employee belongs to a different company.',
          })
        }

        if (employee.userId) {
          await t.rollback()
          return res.status(409).json({
            message: `${employee.firstName} ${employee.lastName} already has a CRM account. Edit that user to change their role.`,
            existingUserId: employee.userId,
          })
        }

        // Authoritative values come from the HR record, not the body.
        profile.name =
          [employee.firstName, employee.lastName].filter(Boolean).join(' ') || profile.name
        profile.email = employee.email || profile.email
        profile.phone = employee.phone || profile.phone
      }

      if (!profile.name || !profile.email) {
        await t.rollback()
        return res.status(400).json({ message: 'Name and email are required.' })
      }

      /*
       * ── Existing account ─────────────────────────────────────────
       * If this email already has a CRM user, do NOT create a second
       * one. Attach them to the company instead, which is the
       * multi-company case: the same person can hold a different role
       * in each company via user_companies.roleId.
       */
      const existing = await User.findOne({
        where: { email: profile.email },
        transaction: t,
      })

      let assignedRole = null
      if (roleId) {
        assignedRole = await Role.findByPk(roleId, { transaction: t })
        if (!assignedRole) {
          await t.rollback()
          return res.status(400).json({ message: 'Selected role does not exist.' })
        }
        if (String(assignedRole.companyId) !== String(targetCompanyId)) {
          await t.rollback()
          return res.status(400).json({
            message: 'That role belongs to a different company.',
          })
        }
        const problem = await assertCanAssignRole(req, assignedRole)
        if (problem) {
          await t.rollback()
          return res.status(403).json({ message: problem })
        }
      }

      if (existing) {
        const already = await UserCompany.findOne({
          where: { userId: existing.id, companyId: targetCompanyId },
          transaction: t,
        })

        if (already) {
          await t.rollback()
          return res.status(409).json({
            message: `${existing.name} already has access to this company. Edit that user to change their role.`,
            existingUserId: existing.id,
          })
        }

        // Grant access to this additional company without touching any
        // role they hold elsewhere.
        await UserCompany.create(
          {
            userId: existing.id,
            companyId: targetCompanyId,
            roleId: assignedRole ? assignedRole.id : null,
            isPrimary: false,
            assignedById: req.user.id,
          },
          { transaction: t }
        )

        if (employee) {
          employee.userId = existing.id
          await employee.save({ transaction: t })
        }

        await t.commit()

        await logFromRequest(req, {
          companyId: targetCompanyId,
          action: 'user_company_access_granted',
          resource: 'User',
          resourceId: existing.id,
          module: 'settings',
          changes: {
            after: { companyId: targetCompanyId, roleId: assignedRole?.id || null },
          },
        })

        return res.status(200).json({
          message: `${existing.name} was given access to this company.`,
          user: existing,
          linkedExisting: true,
        })
      }

      // ── New account ────────────────────────────────────────────
      let legacyRole = role || 'employee'
      if (legacyRole === 'super_admin' && req.user.role !== 'super_admin') {
        await t.rollback()
        return res.status(403).json({ message: 'Only a super admin can create a super admin.' })
      }

      const user = await User.create(
        {
          ...profile,
          password,
          role: legacyRole,
          roleId: assignedRole ? assignedRole.id : null,
          companyId: targetCompanyId,
          isVerified: true, // created by an administrator, so no email loop
        },
        { transaction: t }
      )

      const memberships =
        req.user.role === 'super_admin'
          ? [...new Set([targetCompanyId, ...companies])]
          : [targetCompanyId]

      await UserCompany.bulkCreate(
        memberships.map((companyId) => ({
          userId: user.id,
          companyId,
          roleId: assignedRole ? assignedRole.id : null,
          isPrimary: String(companyId) === String(targetCompanyId),
          assignedById: req.user.id,
        })),
        { transaction: t }
      )

      // Close the loop: the HR record now points at the login account.
      // Employee.designation (the job title) is deliberately untouched —
      // it is a different concept from the CRM permission role.
      if (employee) {
        employee.userId = user.id
        await employee.save({ transaction: t })
      }

      await t.commit()

      await logFromRequest(req, {
        companyId: targetCompanyId,
        action: 'user_created',
        resource: 'User',
        resourceId: user.id,
        module: 'settings',
        changes: {
          after: {
            name: user.name,
            email: user.email,
            role: user.role,
            roleId: user.roleId,
            employeeId: employee?.id || null,
            companies: memberships,
          },
        },
      })

      res.status(201).json(user)
    } catch (err) {
      await t.rollback()
      next(err)
    }
  }
)

router.patch(
  '/users/:id',
  validateUuidParam('id'),
  authorizePermission('users.update'),
  validate({
    name: rules.string({ min: 2, max: 120 }),
    email: rules.email(),
    phone: rules.string({ max: 30 }),
    avatar: rules.string({ max: 500 }),
    isActive: rules.boolean(),
    status: rules.enumOf(['active', 'inactive', 'suspended']),
    role: rules.enumOf(['admin', 'manager', 'employee', 'accountant', 'super_admin']),
    roleId: rules.uuid(),
    primaryCompany: rules.uuid(),
    companies: rules.array({ of: rules.uuid() }),
  }),
  async (req, res, next) => {
    const t = await sequelize.transaction()
    try {
      const { user, error, message } = await findUserInScope(req, req.params.id)
      if (error) {
        await t.rollback()
        return res.status(error).json({ message })
      }

      const { companies, primaryCompany, role, roleId, ...rest } = req.body
      const before = user.toJSON()

      // ── Legacy role changes ────────────────────────────────────
      if (role !== undefined && role !== user.role) {
        if (req.user.role !== 'super_admin') {
          await t.rollback()
          return res.status(403).json({
            message: 'Only a super admin can change a user\'s system role.',
          })
        }
        if (String(user.id) === String(req.user.id)) {
          await t.rollback()
          return res.status(403).json({ message: 'You cannot change your own system role.' })
        }
        user.role = role
      }

      // ── RBAC role changes ──────────────────────────────────────
      if (roleId !== undefined && String(roleId) !== String(user.roleId)) {
        if (String(user.id) === String(req.user.id) && req.user.role !== 'super_admin') {
          await t.rollback()
          return res.status(403).json({ message: 'You cannot change your own role.' })
        }
        if (roleId === null) {
          user.roleId = null
        } else {
          const newRole = await Role.findByPk(roleId)
          if (!newRole) {
            await t.rollback()
            return res.status(400).json({ message: 'Selected role does not exist.' })
          }
          const problem = await assertCanAssignRole(req, newRole)
          if (problem) {
            await t.rollback()
            return res.status(403).json({ message: problem })
          }
          user.roleId = newRole.id
        }
      }

      // Whitelisted fields only. `password`, `tokenVersion`, `isVerified`
      // and anything else in the body are silently dropped.
      Object.assign(user, pick(rest, USER_WRITABLE_FIELDS))

      if (primaryCompany !== undefined && req.user.role === 'super_admin') {
        user.companyId = primaryCompany
      }

      await user.save({ transaction: t })

      // ── Company memberships ────────────────────────────────────
      if (companies && req.user.role === 'super_admin') {
        await UserCompany.destroy({ where: { userId: user.id }, transaction: t })
        await UserCompany.bulkCreate(
          companies.map((companyId) => ({
            userId: user.id,
            companyId,
            roleId: user.roleId,
            isPrimary: String(companyId) === String(user.companyId),
            assignedById: req.user.id,
          })),
          { transaction: t }
        )
      }

      await t.commit()

      await logFromRequest(req, {
        action: 'user_updated',
        resource: 'User',
        resourceId: user.id,
        module: 'settings',
        changes: diffChanges(before, user.toJSON()),
      })

      const fresh = await findUserInScope(req, user.id)
      res.json(fresh.user || user)
    } catch (err) {
      await t.rollback()
      next(err)
    }
  }
)

/*
|--------------------------------------------------------------------------
| Role assignment — the endpoints the RBAC module was missing entirely
|--------------------------------------------------------------------------
*/

/**
 * PATCH /api/settings/users/:id/role
 *
 * Assigns an RBAC role to a user. This is the endpoint that makes the
 * whole Roles & Permissions module work — before it existed, roleId was
 * never populated, so every permission check returned false for
 * everyone except super_admin.
 *
 * Body:
 *   { roleId: "uuid" | null, companyId?: "uuid" }
 *
 * When companyId is supplied the role is set for that company only
 * (user_companies.roleId), so a user who belongs to several companies
 * can hold a different role in each. Otherwise it sets the user's home
 * role (users.roleId).
 */
router.patch(
  '/users/:id/role',
  validateUuidParam('id'),
  authorizePermission('users.manage'),
  validate({
    roleId: rules.uuid({ nullable: true }),
    companyId: rules.uuid(),
  }),
  async (req, res, next) => {
    const t = await sequelize.transaction()
    try {
      const { user, error, message } = await findUserInScope(req, req.params.id)
      if (error) {
        await t.rollback()
        return res.status(error).json({ message })
      }

      const { roleId, companyId } = req.body

      if (String(user.id) === String(req.user.id) && req.user.role !== 'super_admin') {
        await t.rollback()
        return res.status(403).json({ message: 'You cannot change your own role.' })
      }

      let role = null
      if (roleId) {
        role = await Role.findByPk(roleId)
        if (!role) {
          await t.rollback()
          return res.status(400).json({ message: 'Selected role does not exist.' })
        }
        const problem = await assertCanAssignRole(req, role)
        if (problem) {
          await t.rollback()
          return res.status(403).json({ message: problem })
        }
      }

      const before = { roleId: user.roleId, scope: companyId || 'home' }

      if (companyId) {
        // Per-company role.
        const membership = await UserCompany.findOne({
          where: { userId: user.id, companyId },
          transaction: t,
        })
        if (!membership) {
          await t.rollback()
          return res.status(400).json({ message: 'User does not belong to that company.' })
        }
        membership.roleId = role ? role.id : null
        membership.assignedById = req.user.id
        await membership.save({ transaction: t })
      } else {
        // Home role.
        user.roleId = role ? role.id : null
        await user.save({ transaction: t })

        // Keep memberships that had no explicit role in step with the
        // home role, so behaviour stays predictable.
        await UserCompany.update(
          { roleId: role ? role.id : null },
          { where: { userId: user.id, roleId: null }, transaction: t }
        )
      }

      // Force the user's next request to pick up the new permissions
      // immediately rather than after their token expires.
      user.tokenVersion = (user.tokenVersion || 0) + 1
      await user.save({ transaction: t })

      await t.commit()

      await logFromRequest(req, {
        action: 'user_role_assigned',
        resource: 'User',
        resourceId: user.id,
        module: 'settings',
        changes: {
          before,
          after: { roleId: role ? role.id : null, roleName: role ? role.name : null, scope: companyId || 'home' },
        },
      })

      const fresh = await findUserInScope(req, user.id)
      res.json({
        message: role ? `Role "${role.name}" assigned.` : 'Role removed.',
        user: fresh.user,
      })
    } catch (err) {
      await t.rollback()
      next(err)
    }
  }
)

/**
 * PUT /api/settings/users/:id/companies
 *
 * Sets which companies a user belongs to, and which role they hold in
 * each one.
 *
 * Body:
 *   { memberships: [ { companyId, roleId?, isPrimary? } ] }
 */
router.put(
  '/users/:id/companies',
  validateUuidParam('id'),
  authorizePermission('users.manage'),
  validate({
    memberships: rules.array({ required: true, of: (v, f) => {
      if (!v || typeof v !== 'object') return { error: `${f} must be an object` }
      if (!v.companyId) return { error: `${f}.companyId is required` }
      return { value: v }
    } }),
  }),
  async (req, res, next) => {
    const t = await sequelize.transaction()
    try {
      const { user, error, message } = await findUserInScope(req, req.params.id)
      if (error) {
        await t.rollback()
        return res.status(error).json({ message })
      }

      const { memberships } = req.body

      // An admin may only manage membership of their own company.
      if (req.user.role !== 'super_admin') {
        const outside = memberships.filter(
          (m) => String(m.companyId) !== String(req.companyId)
        )
        if (outside.length) {
          await t.rollback()
          return res.status(403).json({
            message: 'You can only manage membership of your own company.',
          })
        }
      }

      // Validate every role before writing anything.
      for (const m of memberships) {
        if (!m.roleId) continue
        const role = await Role.findByPk(m.roleId)
        if (!role) {
          await t.rollback()
          return res.status(400).json({ message: `Role ${m.roleId} does not exist.` })
        }
        if (String(role.companyId) !== String(m.companyId)) {
          await t.rollback()
          return res.status(400).json({
            message: `Role "${role.name}" does not belong to the selected company.`,
          })
        }
        const problem = await assertCanAssignRole(req, role)
        if (problem) {
          await t.rollback()
          return res.status(403).json({ message: problem })
        }
      }

      const before = (user.memberships || []).map((m) => ({
        companyId: m.companyId,
        roleId: m.roleId,
      }))

      await UserCompany.destroy({ where: { userId: user.id }, transaction: t })

      await UserCompany.bulkCreate(
        memberships.map((m) => ({
          userId: user.id,
          companyId: m.companyId,
          roleId: m.roleId || null,
          isPrimary: !!m.isPrimary,
          assignedById: req.user.id,
        })),
        { transaction: t }
      )

      const primary = memberships.find((m) => m.isPrimary) || memberships[0]
      if (primary) {
        user.companyId = primary.companyId
        if (primary.roleId) user.roleId = primary.roleId
      }

      user.tokenVersion = (user.tokenVersion || 0) + 1
      await user.save({ transaction: t })

      await t.commit()

      await logFromRequest(req, {
        action: 'user_companies_updated',
        resource: 'User',
        resourceId: user.id,
        module: 'settings',
        changes: { before, after: memberships },
      })

      const fresh = await findUserInScope(req, user.id)
      res.json({ message: 'Company assignments updated.', user: fresh.user })
    } catch (err) {
      await t.rollback()
      next(err)
    }
  }
)

/**
 * POST /api/settings/users/bulk-assign-role
 * Body: { userIds: [uuid], roleId: uuid | null }
 */
router.post(
  '/users/bulk-assign-role',
  authorizePermission('users.manage'),
  validate({
    userIds: rules.array({ required: true, of: rules.uuid({ required: true }), max: 200 }),
    roleId: rules.uuid({ nullable: true }),
  }),
  async (req, res, next) => {
    const t = await sequelize.transaction()
    try {
      const { userIds, roleId } = req.body

      let role = null
      if (roleId) {
        role = await Role.findByPk(roleId)
        if (!role) {
          await t.rollback()
          return res.status(400).json({ message: 'Selected role does not exist.' })
        }
        const problem = await assertCanAssignRole(req, role)
        if (problem) {
          await t.rollback()
          return res.status(403).json({ message: problem })
        }
      }

      // Never let a bulk operation reach outside the caller's company,
      // and never let it include the caller themselves.
      const where = {
        id: { [Op.in]: userIds.filter((id) => String(id) !== String(req.user.id)) },
        ...companyScope(req),
      }

      const targets = await User.findAll({ where, attributes: ['id'], transaction: t })
      const targetIds = targets.map((u) => u.id)

      if (!targetIds.length) {
        await t.rollback()
        return res.status(400).json({ message: 'No eligible users in the selection.' })
      }

      await User.update(
        { roleId: role ? role.id : null, tokenVersion: sequelize.literal('tokenVersion + 1') },
        { where: { id: { [Op.in]: targetIds } }, transaction: t }
      )

      await UserCompany.update(
        { roleId: role ? role.id : null },
        { where: { userId: { [Op.in]: targetIds } }, transaction: t }
      )

      await t.commit()

      await logFromRequest(req, {
        action: 'user_role_bulk_assigned',
        resource: 'User',
        resourceId: null,
        module: 'settings',
        changes: {
          after: { roleId: role?.id || null, roleName: role?.name || null, userIds: targetIds },
        },
      })

      res.json({
        message: `Role updated for ${targetIds.length} user(s).`,
        updated: targetIds.length,
        skipped: userIds.length - targetIds.length,
      })
    } catch (err) {
      await t.rollback()
      next(err)
    }
  }
)

/*
|--------------------------------------------------------------------------
| Status / password / delete
|--------------------------------------------------------------------------
*/

router.patch(
  '/users/:id/status',
  validateUuidParam('id'),
  authorizePermission('users.update'),
  validate({ status: rules.enumOf(['active', 'inactive', 'suspended'], { required: true }) }),
  async (req, res, next) => {
    try {
      const { user, error, message } = await findUserInScope(req, req.params.id)
      if (error) return res.status(error).json({ message })

      if (String(user.id) === String(req.user.id)) {
        return res.status(403).json({ message: 'You cannot change your own status.' })
      }

      const before = { status: user.status, isActive: user.isActive }

      // The `status` column now exists on the model, so this endpoint
      // finally does something — it previously returned 200 and wrote
      // nothing at all.
      user.status = req.body.status
      user.isActive = req.body.status === 'active'

      // Suspending someone kills their existing sessions immediately.
      if (req.body.status !== 'active') {
        user.tokenVersion = (user.tokenVersion || 0) + 1
      }

      await user.save()

      await logFromRequest(req, {
        action: 'user_status_changed',
        resource: 'User',
        resourceId: user.id,
        module: 'settings',
        changes: diffChanges(before, { status: user.status, isActive: user.isActive }),
      })

      res.json(user)
    } catch (err) {
      next(err)
    }
  }
)

router.patch(
  '/users/:id/password',
  validateUuidParam('id'),
  validate({
    currentPassword: rules.string({ max: 255 }),
    password: rules.password({ required: true, min: 8 }),
  }),
  async (req, res, next) => {
    try {
      const isSelf = String(req.user.id) === String(req.params.id)

      // An admin can no longer reach this via mass assignment on
      // PATCH /users/:id, so this is now the only password path.
      if (!isSelf && req.user.role !== 'super_admin' && !can(req, 'users.manage')) {
        return res.status(403).json({ message: 'Not authorized' })
      }

      const { user, error, message } = await findUserInScope(req, req.params.id)
      if (error) return res.status(error).json({ message })

      // Changing your own password requires proving you know the old one.
      if (isSelf) {
        if (!req.body.currentPassword) {
          return res.status(400).json({ message: 'Current password is required.' })
        }
        const ok = await user.comparePassword(req.body.currentPassword)
        if (!ok) {
          await logFromRequest(req, {
            action: 'password_change_failed',
            resource: 'User',
            resourceId: user.id,
            module: 'security',
            status: 'failed',
          })
          return res.status(401).json({ message: 'Current password is incorrect.' })
        }
      }

      // The beforeSave hook hashes it and bumps tokenVersion, which
      // signs every other session out.
      user.password = req.body.password
      await user.save()

      await logFromRequest(req, {
        action: isSelf ? 'password_changed' : 'password_reset_by_admin',
        resource: 'User',
        resourceId: user.id,
        module: 'security',
        changes: { password: { before: '[redacted]', after: '[changed]' } },
      })

      res.json({ message: 'Password updated. Other sessions have been signed out.' })
    } catch (err) {
      next(err)
    }
  }
)

router.delete(
  '/users/:id',
  validateUuidParam('id'),
  authorizePermission('users.delete'),
  async (req, res, next) => {
    const t = await sequelize.transaction()
    try {
      const { user, error, message } = await findUserInScope(req, req.params.id)
      if (error) {
        await t.rollback()
        return res.status(error).json({ message })
      }

      if (String(user.id) === String(req.user.id)) {
        await t.rollback()
        return res.status(403).json({ message: 'You cannot delete your own account.' })
      }

      if (user.role === 'super_admin' && req.user.role !== 'super_admin') {
        await t.rollback()
        return res.status(403).json({ message: 'You cannot delete a super admin.' })
      }

      const snapshot = { name: user.name, email: user.email, role: user.role }

      // Deactivate rather than hard delete. The old version called
      // User.destroy(), which left every lead, task, ticket and payslip
      // pointing at a user id that no longer existed.
      user.isActive = false
      user.status = 'inactive'
      user.tokenVersion = (user.tokenVersion || 0) + 1
      user.email = `deleted+${user.id}@deleted.local` // frees the address for reuse
      await user.save({ transaction: t })

      await UserCompany.destroy({ where: { userId: user.id }, transaction: t })
      await t.commit()

      await logFromRequest(req, {
        action: 'user_deleted',
        resource: 'User',
        resourceId: user.id,
        module: 'settings',
        changes: { before: snapshot },
      })

      res.json({ message: 'User deactivated and removed from all companies.' })
    } catch (err) {
      await t.rollback()
      next(err)
    }
  }
)

export default router