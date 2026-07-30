/*
|--------------------------------------------------------------------------
| Permission Registry — single source of truth
|--------------------------------------------------------------------------
|
| The audit found three different permission vocabularies in the project:
|
|   - Sidebar.jsx asked for keys like 'settings.view' and 'finance.view'
|   - permissionMeta.js could only grant flat keys like 'users' and 'reports'
|   - authorizePermission() threw away everything after the dot
|
| The result was eight menu entries that could never be shown to anybody
| and seven permissions that could be granted but were never read.
|
| This file fixes that by defining every module and every action ONCE.
| The server imports it directly; the client mirrors it in
| client/src/lib/permissions.js. Keep the two in step.
|
| Key format is "<module>.<action>", e.g. "leads.delete".
|
*/

// The standard action set. Not every module supports every action —
// see MODULES below for the per-module list.
export const ACTIONS = {
  VIEW: 'view',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  APPROVE: 'approve',
  EXPORT: 'export',
  IMPORT: 'import',
  MANAGE: 'manage',
}

const CRUD = ['view', 'create', 'update', 'delete']
const CRUD_IO = [...CRUD, 'export', 'import']
const CRUD_APPROVE = [...CRUD, 'approve']

/**
 * Every module in the CRM, the actions it supports, and which group it
 * belongs to in the permission matrix UI.
 *
 * `dangerous: true` marks actions that should be highlighted in red in
 * the UI and that require the granter to already hold them.
 */
export const MODULES = [
  // ── Dashboard ───────────────────────────────────────────────────
  { key: 'dashboard', label: 'Dashboard', group: 'General', actions: ['view'] },

  // ── CRM ─────────────────────────────────────────────────────────
  { key: 'leads', label: 'Leads', group: 'CRM', actions: CRUD_IO },
  { key: 'accounts', label: 'Accounts', group: 'CRM', actions: CRUD_IO },
  { key: 'contacts', label: 'Contacts', group: 'CRM', actions: CRUD_IO },
  { key: 'opportunities', label: 'Opportunities', group: 'CRM', actions: CRUD_IO },

  // ── Calendar ────────────────────────────────────────────────────
  // Was requested by the sidebar but was not grantable at all.
  { key: 'calendar', label: 'Calendar & Meetings', group: 'Productivity', actions: CRUD },

  // ── HR ──────────────────────────────────────────────────────────
  { key: 'employees', label: 'Employees', group: 'HR', actions: CRUD_IO },
  { key: 'attendance', label: 'Attendance', group: 'HR', actions: CRUD_APPROVE },
  { key: 'leave', label: 'Leave Management', group: 'HR', actions: CRUD_APPROVE },
  { key: 'payroll', label: 'Payroll', group: 'HR', actions: [...CRUD_APPROVE, 'export'] },
  { key: 'performance', label: 'Performance Reviews', group: 'HR', actions: CRUD },

  // ── Finance ─────────────────────────────────────────────────────
  { key: 'expenses', label: 'Expenses', group: 'Finance', actions: [...CRUD_APPROVE, 'export', 'import'] },
  { key: 'ledger', label: 'General Ledger', group: 'Finance', actions: [...CRUD, 'export'] },
  // Was requested by the sidebar but was not grantable at all.
  { key: 'finance', label: 'Finance Overview & Reports', group: 'Finance', actions: ['view', 'export'] },

  // ── Inventory ───────────────────────────────────────────────────
  { key: 'inventory', label: 'Stock Items', group: 'Inventory', actions: CRUD_IO },
  { key: 'warehouse', label: 'Warehouses', group: 'Inventory', actions: CRUD },
  { key: 'assets', label: 'Company Assets', group: 'Inventory', actions: CRUD },
  // Both were requested by the sidebar but were not grantable at all.
  { key: 'transfers', label: 'Stock Transfers', group: 'Inventory', actions: CRUD_APPROVE },
  { key: 'adjustments', label: 'Stock Adjustments', group: 'Inventory', actions: CRUD_APPROVE },

  // ── Procurement ─────────────────────────────────────────────────
  // Was requested by the sidebar but was not grantable at all.
  { key: 'procurement', label: 'Procurement', group: 'Operations', actions: CRUD_APPROVE },

  // ── Projects ────────────────────────────────────────────────────
  { key: 'projects', label: 'Projects', group: 'Operations', actions: CRUD },
  { key: 'tasks', label: 'Tasks', group: 'Operations', actions: CRUD },

  // ── Support ─────────────────────────────────────────────────────
  // The sidebar asked for 'support'; the matrix could only grant
  // 'tickets'. Standardised on 'support'.
  { key: 'support', label: 'Support Tickets', group: 'Operations', actions: CRUD },

  // ── Reporting ───────────────────────────────────────────────────
  // Was requested by the sidebar but was not grantable at all.
  { key: 'analytics', label: 'Reports & Analytics', group: 'Reporting', actions: ['view', 'export'] },

  // ── Communication ───────────────────────────────────────────────
  { key: 'email', label: 'Email', group: 'Communication', actions: CRUD },
  { key: 'notifications', label: 'Notifications', group: 'Communication', actions: ['view', 'update'] },

  // ── Group oversight ─────────────────────────────────────────────
  // Read-only visibility across every company BELOW the holder's own in
  // the org hierarchy (companies.parentId). Granted to OS Group staff so
  // the parent company can see what its child companies are doing
  // without anyone needing super_admin, and without granting any write
  // access to a child company's data.
  //
  // Holding group.view at a company with no children shows nothing —
  // the scope is always "my descendants", never "everyone".
  { key: 'group', label: 'Group Oversight', group: 'Group', actions: ['view', 'export'] },

  // ── Settings ────────────────────────────────────────────────────
  // 'settings' itself was requested by the sidebar but was not
  // grantable, so no non-super-admin could ever see the Settings menu
  // — including the Roles & Permissions screen.
  { key: 'settings', label: 'Settings Access', group: 'Settings', actions: ['view'] },
  { key: 'company', label: 'Company Settings', group: 'Settings', actions: CRUD },
  { key: 'users', label: 'User Management', group: 'Settings', actions: [...CRUD, 'manage'], dangerous: true },
  { key: 'roles', label: 'Roles & Permissions', group: 'Settings', actions: CRUD, dangerous: true },
  { key: 'auditlog', label: 'Audit Log', group: 'Settings', actions: ['view', 'export'] },
]

/** Human-readable labels for each action, used by the matrix UI. */
export const ACTION_LABELS = {
  view: 'View',
  create: 'Create',
  update: 'Edit',
  delete: 'Delete',
  approve: 'Approve',
  export: 'Export',
  import: 'Import',
  manage: 'Manage',
}

/**
 * Permission dependencies. Granting the key on the left implies the key
 * on the right — you cannot edit a record you cannot see. Enforced
 * server-side in normalizePermissions() and mirrored in the UI so the
 * checkboxes tick themselves.
 */
export const PERMISSION_DEPENDENCIES = MODULES.reduce((acc, mod) => {
  mod.actions
    .filter((a) => a !== 'view')
    .forEach((action) => {
      acc[`${mod.key}.${action}`] = `${mod.key}.view`
    })
  return acc
}, {})

/** Flat list of every legal permission key, e.g. ['leads.view', ...]. */
export const ALL_PERMISSION_KEYS = MODULES.flatMap((m) =>
  m.actions.map((a) => `${m.key}.${a}`)
)

const ALL_KEYS_SET = new Set(ALL_PERMISSION_KEYS)
const MODULE_KEYS = new Set(MODULES.map((m) => m.key))

/** Groups modules for the permission matrix UI. */
export const MODULE_GROUPS = MODULES.reduce((acc, mod) => {
  ;(acc[mod.group] = acc[mod.group] || []).push(mod)
  return acc
}, {})

/** Is this a permission key the system actually knows about? */
export const isValidPermissionKey = (key) => ALL_KEYS_SET.has(key)

/** Every action key belonging to one module. */
export const keysForModule = (moduleKey) => {
  const mod = MODULES.find((m) => m.key === moduleKey)
  return mod ? mod.actions.map((a) => `${moduleKey}.${a}`) : []
}

/*
|--------------------------------------------------------------------------
| normalizePermissions
|--------------------------------------------------------------------------
|
| Turns whatever is stored on Role.permissions into a predictable Set of
| granted "module.action" strings. It accepts three shapes so nothing
| in your existing database breaks:
|
|   1. New format   { "leads.view": true, "leads.delete": false }
|   2. Legacy flat  { "leads": true }          -> expands to all leads actions
|   3. Nested       { "leads": { "view": true } }
|
| Rules:
|   - An explicit `false` on an exact key is a DENY and always wins,
|     even against a legacy module-wide grant. This gives you
|     "everything in Leads except delete" without a schema change.
|   - Dependencies are applied automatically: granting 'leads.delete'
|     also grants 'leads.view'.
|   - Unknown keys are ignored rather than trusted (permission injection
|     protection — the roles API used to store any JSON you sent it).
|
| Returns a Set<string>.
|
*/
export function normalizePermissions(raw) {
  const granted = new Set()
  const denied = new Set()

  if (!raw) return granted

  let source = raw
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source)
    } catch {
      return granted
    }
  }
  if (typeof source !== 'object' || Array.isArray(source)) return granted

  for (const [key, value] of Object.entries(source)) {
    // ── Shape 3: nested object { leads: { view: true } } ──
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!MODULE_KEYS.has(key)) continue
      for (const [action, allowed] of Object.entries(value)) {
        const full = `${key}.${action}`
        if (!ALL_KEYS_SET.has(full)) continue
        if (allowed === true) granted.add(full)
        else if (allowed === false) denied.add(full)
      }
      continue
    }

    // ── Shape 2: legacy flat module grant { leads: true } ──
    if (MODULE_KEYS.has(key) && !key.includes('.')) {
      if (value === true) keysForModule(key).forEach((k) => granted.add(k))
      else if (value === false) keysForModule(key).forEach((k) => denied.add(k))
      continue
    }

    // ── Shape 1: exact key { "leads.view": true } ──
    if (ALL_KEYS_SET.has(key)) {
      if (value === true) granted.add(key)
      else if (value === false) denied.add(key)
    }
    // Anything else is an unrecognised key and is deliberately ignored.
  }

  // Apply dependencies: any granted action implies its module's view.
  for (const key of [...granted]) {
    const dep = PERMISSION_DEPENDENCIES[key]
    if (dep) granted.add(dep)
  }

  // Deny always beats allow.
  for (const key of denied) granted.delete(key)

  return granted
}

/**
 * Checks one permission against a normalised Set.
 *
 * Also accepts a bare module name ('leads') and reads it as
 * '<module>.view', so older call sites keep working.
 */
export function checkPermission(grantedSet, permission) {
  if (!permission) return false
  if (!grantedSet || typeof grantedSet.has !== 'function') return false

  const key = permission.includes('.') ? permission : `${permission}.view`
  return grantedSet.has(key)
}

/**
 * Merges a role chain (child first, then parents) into one Set.
 * Child grants win; a deny anywhere in the chain is respected because
 * each level is normalised before merging.
 */
export function mergePermissionSets(sets) {
  const merged = new Set()
  for (const set of sets) {
    if (!set) continue
    for (const key of set) merged.add(key)
  }
  return merged
}

export default {
  ACTIONS,
  ACTION_LABELS,
  MODULES,
  MODULE_GROUPS,
  ALL_PERMISSION_KEYS,
  PERMISSION_DEPENDENCIES,
  isValidPermissionKey,
  keysForModule,
  normalizePermissions,
  checkPermission,
  mergePermissionSets,
}