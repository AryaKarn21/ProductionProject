import dotenv from 'dotenv'
import { sequelize } from './config/db.js'
import { User, Company, UserCompany, Role } from './models/index.js'
import { ALL_PERMISSION_KEYS, keysForModule } from './config/permissions.js'

dotenv.config()

/*
|--------------------------------------------------------------------------
| Seed
|--------------------------------------------------------------------------
|
| The original seed created ONLY the super-admin user and no Role rows at
| all. Because super_admin bypasses RBAC, that account worked — but the
| moment you logged in as anyone else (admin / manager / employee) the
| server resolved their permissions from a role that did not exist, got
| an empty set, and the frontend bounced every page to /unauthorized.
|
| This seed now also:
|   1. Creates the standard system roles WITH real permissions, pulled
|      straight from config/permissions.js so they can never drift out of
|      sync with what the app enforces.
|   2. Gives the super-admin the Administrator role too (belt and braces —
|      the ENUM bypass still applies, but now the account keeps full
|      access even if it is ever demoted from super_admin).
|   3. BACKFILLS every existing non-super-admin user that has no roleId,
|      mapping their legacy `role` ENUM to the matching new role. This is
|      what repairs accounts that were created before roles existed.
|   4. Creates one ready-to-use NON super-admin login so RBAC can be
|      verified end to end without touching real accounts.
|
| It is idempotent: re-running refreshes the role permissions and fills
| any still-missing roleId, without duplicating anything.
*/

await sequelize.authenticate()
console.log('Connected to MySQL')
await sequelize.sync()

/* ── 1. Company ──────────────────────────────────────────────── */
let [company, created] = await Company.findOrCreate({
  where: { name: 'OS Group' },
  defaults: {
    name: 'OS Group',
    type: 'Parent Company',
    industry: 'Technology',
    email: 'contact@osgroup.com',
    phone: '+977-9804230932',
    address: 'Kathmandu, Nepal',
    currency: 'NPR',
    timezone: 'Asia/Kathmandu',
  },
})
if (!created) {
  await company.update({
    type: 'Parent Company',
    industry: 'Technology',
    email: 'contact@osgroup.com',
    phone: '+977-9804230932',
    address: 'Kathmandu, Nepal',
    currency: 'NPR',
    timezone: 'Asia/Kathmandu',
  })
}
console.log('✅ Company:', company.name, company.id)

/* ── 2. System roles (with permissions) ──────────────────────── */

// Grants every listed key. Object shape: { "leads.view": true, ... }.
const permsFor = (keys) => Object.fromEntries(keys.map((k) => [k, true]))
// Expands a list of module names into every action key they support.
const modulesToKeys = (mods) => mods.flatMap(keysForModule)

const ROLE_DEFS = [
  {
    name: 'Administrator',
    description: 'Full access to every module, including settings, users and roles.',
    level: 90,
    permissions: permsFor(ALL_PERMISSION_KEYS),
  },
  {
    name: 'Manager',
    description: 'CRM, HR, projects and operations. No system settings, users or roles.',
    level: 60,
    permissions: permsFor(
      modulesToKeys([
        'dashboard', 'leads', 'accounts', 'contacts', 'opportunities', 'calendar',
        'employees', 'attendance', 'leave', 'performance',
        'projects', 'tasks', 'support', 'inventory', 'warehouse', 'assets',
        'analytics', 'notifications', 'email',
      ])
    ),
  },
  {
    name: 'Accountant',
    description: 'Finance, expenses, ledger, payroll and reporting.',
    level: 50,
    permissions: permsFor(
      modulesToKeys([
        'dashboard', 'expenses', 'ledger', 'finance', 'payroll', 'analytics', 'notifications',
      ])
    ),
  },
  {
    name: 'Employee',
    description: 'Basic self-service: dashboard, own tasks, attendance and leave.',
    level: 10,
    permissions: permsFor([
      'dashboard.view', 'leads.view', 'calendar.view', 'calendar.create',
      'tasks.view', 'tasks.update', 'attendance.view', 'leave.view', 'leave.create',
      'notifications.view', 'email.view',
    ]),
  },
]

// name -> Role instance, so later steps can look a role up quickly.
const rolesByName = {}
for (const def of ROLE_DEFS) {
  const [role, roleCreated] = await Role.findOrCreate({
    where: { companyId: company.id, name: def.name },
    defaults: {
      companyId: company.id,
      name: def.name,
      description: def.description,
      level: def.level,
      permissions: def.permissions,
      isSystem: true,
      isActive: true,
      isDeleted: false,
    },
  })
  if (!roleCreated) {
    // Refresh permissions/metadata on re-run so the roles track the
    // registry, and undelete any that were soft-deleted.
    await role.update({
      description: def.description,
      level: def.level,
      permissions: def.permissions,
      isSystem: true,
      isActive: true,
      isDeleted: false,
      deletedAt: null,
    })
  }
  rolesByName[def.name] = role
  console.log(
    `  ${roleCreated ? '➕ created' : '♻️  updated'} role: ${def.name} ` +
      `(${Object.keys(def.permissions).length} permissions)`
  )
}

// Maps the legacy User.role ENUM to one of the new roles.
const roleForLegacy = (legacy) =>
  ({
    admin: rolesByName['Administrator'],
    manager: rolesByName['Manager'],
    accountant: rolesByName['Accountant'],
    employee: rolesByName['Employee'],
  }[legacy] || rolesByName['Employee'])

/* ── 3. Super admin ──────────────────────────────────────────── */
let admin = await User.findOne({ where: { email: 'admin@osgroup.com' } })
if (!admin) {
  admin = await User.create({
    name: 'Super Admin',
    email: 'admin@osgroup.com',
    password: 'Admin@1234', // hashed automatically by the User beforeSave hook
    role: 'super_admin',
    roleId: rolesByName['Administrator'].id,
    companyId: company.id,
    isActive: true,
    isVerified: true,
  })
  await UserCompany.findOrCreate({
    where: { userId: admin.id, companyId: company.id },
    defaults: {
      userId: admin.id,
      companyId: company.id,
      roleId: rolesByName['Administrator'].id,
      isPrimary: true,
    },
  })
  console.log('✅ Super admin created: admin@osgroup.com / Admin@1234')
} else {
  // Make sure the existing super admin also carries the Administrator
  // role (setting only roleId — no password change, so no session is
  // invalidated).
  if (!admin.roleId) {
    admin.roleId = rolesByName['Administrator'].id
    await admin.save()
  }
  await UserCompany.findOrCreate({
    where: { userId: admin.id, companyId: company.id },
    defaults: {
      userId: admin.id,
      companyId: company.id,
      roleId: rolesByName['Administrator'].id,
      isPrimary: true,
    },
  })
  console.log('ℹ️  Super admin already exists (ensured Administrator role)')
}

/* ── 4. Backfill existing users missing a roleId ─────────────── */
// THIS is the step that repairs whatever account you are currently
// stuck on: any non-super-admin with roleId = NULL is given the role
// that matches their legacy ENUM, so they finally have permissions.
const orphans = await User.findAll({
  where: { roleId: null },
})
let fixed = 0
for (const u of orphans) {
  if (u.role === 'super_admin') continue // handled above
  const role = roleForLegacy(u.role)
  u.roleId = role.id // no password change => existing session stays valid
  await u.save()
  // Keep any membership rows without a role in step with the home role.
  await UserCompany.update(
    { roleId: role.id },
    { where: { userId: u.id, roleId: null } }
  )
  fixed++
  console.log(`  🔧 ${u.email}: role '${u.role}' -> ${role.name}`)
}
console.log(`✅ Backfilled ${fixed} user(s) that had no role assigned.`)

/* ── 5. A guaranteed-working NON super-admin login ───────────── */
// Log in as this to confirm RBAC works without super_admin's bypass.
// Safe to delete once you have verified things.
let demo = await User.findOne({ where: { email: 'administrator@osgroup.com' } })
if (!demo) {
  demo = await User.create({
    name: 'Administrator (Demo)',
    email: 'administrator@osgroup.com',
    password: 'Admin@1234',
    role: 'admin', // NOT super_admin — so RBAC actually applies
    roleId: rolesByName['Administrator'].id,
    companyId: company.id,
    isActive: true,
    isVerified: true,
  })
  await UserCompany.findOrCreate({
    where: { userId: demo.id, companyId: company.id },
    defaults: {
      userId: demo.id,
      companyId: company.id,
      roleId: rolesByName['Administrator'].id,
      isPrimary: true,
    },
  })
  console.log('✅ Demo admin created: administrator@osgroup.com / Admin@1234 (role: admin)')
} else {
  if (!demo.roleId) {
    demo.roleId = rolesByName['Administrator'].id
    await demo.save()
  }
  console.log('ℹ️  Demo admin already exists (administrator@osgroup.com)')
}

console.log('\n🎉 Seed complete.')
console.log('   Super admin (bypasses RBAC): admin@osgroup.com / Admin@1234')
console.log('   Demo admin  (uses RBAC):     administrator@osgroup.com / Admin@1234')
console.log('   Assign roles to other users under Settings → Users.')

await sequelize.close()
process.exit(0)