import { MODULE_GROUPS } from '@/lib/permissions'

/*
| Maps raw permission keys (stored on Role.permissions as
| { key: true/false }) to human-readable module + label pairs, for the
| role editor's checkbox matrix.
|
| WHY THIS IS NOW DERIVED
| ------------------------
| This file used to hand-maintain its own list of modules — a THIRD
| permission vocabulary alongside server/config/permissions.js and
| client/src/lib/permissions.js. It had drifted badly:
|
|   MISSING entirely, so they could never be granted from the UI however
|   the role was configured — calendar, performance, transfers,
|   adjustments, procurement, analytics, email, notifications, finance,
|   settings, and group (the new Group Oversight permission).
|
|   DEAD KEYS the server does not recognise, so ticking the box wrote
|   JSON that normalizePermissions() silently discarded — 'tickets'
|   (the server calls it 'support') and 'reports' (it calls it
|   'finance'). Both checkboxes appeared to work and granted nothing.
|
| Deriving from lib/permissions.js — which mirrors the server registry —
| means the editor can now grant exactly what the API enforces, and the
| three lists can never drift apart again.
|
| No stored role data changes: this only affects which checkboxes are
| DRAWN. Every existing grant keeps the value it already had.
*/

/*
| Which icon each group borrows from RoleFormModel's MODULE_ICONS.
|
| Several groups deliberately share an icon (Productivity and Operations
| are both project-ish; Group and Settings are both administrative).
| That is why this is SEPARATE from the React key below — using the icon
| name as the key would give two sibling elements the same key, which
| React resolves by reusing the wrong component instance.
*/
const GROUP_ICON = {
  General: 'dashboard',
  CRM: 'crm',
  Productivity: 'projects',
  HR: 'hr',
  Finance: 'finance',
  Inventory: 'inventory',
  Operations: 'projects',
  Reporting: 'finance',
  Communication: 'support',
  Group: 'settings',
  Settings: 'settings',
}

export const PERMISSION_MODULES = Object.entries(MODULE_GROUPS).map(
  ([title, modules]) => ({
    // Unique per group — group titles are unique, icon names are not.
    key: title.toLowerCase().replace(/\s+/g, '-'),
    iconKey: GROUP_ICON[title] || null,
    title,
    // The matrix is MODULE-level: one checkbox grants a whole module,
    // which the server's normalizePermissions() expands to every action
    // on it. That is the existing behaviour and is preserved here.
    permissions: modules.map((m) => ({ key: m.key, label: m.label })),
  })
)

export const ALL_PERMISSION_KEYS = PERMISSION_MODULES.flatMap((m) => m.permissions.map((p) => p.key))

/**
 * Returns [{ key, title, total, granted }] — used for the module-summary
 * pills on each role card and for the coverage graph in the drawer.
 * Defensive: role.permissions may be null/undefined/malformed (e.g. an
 * array instead of an object, if old data ever slipped through) — this
 * never throws regardless of input shape.
 */
/**
 * flattenPermissions
 * ------------------
 * The server stores ACTION-level keys — { "leads.view": true,
 * "leads.create": true } — but this file's matrix is MODULE-level
 * ({ leads: true }), one checkbox per module.
 *
 * Without this conversion every reader here looked up `permissions.leads`,
 * found nothing, and reported 0 granted — which is why a role with real
 * permissions still showed "No permissions assigned" and 0/4 coverage.
 *
 * A module counts as granted when any of its actions are granted.
 * Handles all three stored shapes:
 *
 *   { "leads.view": true }        -> { leads: true }
 *   { leads: true }               -> { leads: true }   (legacy, unchanged)
 *   { leads: { view: true } }     -> { leads: true }   (nested)
 */
export function flattenPermissions(permissions) {
  const flat = {}

  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
    return flat
  }

  for (const [key, value] of Object.entries(permissions)) {
    const moduleKey = key.split('.')[0]

    if (value === true) {
      flat[moduleKey] = true
      continue
    }

    // Nested: { leads: { view: true, delete: false } }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (Object.values(value).some((v) => v === true)) flat[moduleKey] = true
    }
  }

  return flat
}

export function summarizeByModule(permissions) {
  const safePermissions = flattenPermissions(permissions)

  return PERMISSION_MODULES.map((mod) => {
    const total = mod.permissions.length
    const granted = mod.permissions.filter((p) => !!safePermissions[p.key]).length
    return { key: mod.key, title: mod.title, total, granted }
  }).filter((m) => m.total > 0)
}

export function totalGrantedCount(permissions) {
  const safePermissions = flattenPermissions(permissions)
  return ALL_PERMISSION_KEYS.filter((k) => !!safePermissions[k]).length
}