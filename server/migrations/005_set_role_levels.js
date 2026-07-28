import { Role } from '../models/index.js'
import { normalizePermissions } from '../config/permissions.js'

/*
|--------------------------------------------------------------------------
|  Give every role a real authority level
|--------------------------------------------------------------------------
|
|  RoleFormModel.jsx never sent a `level`, and Role.level defaults to 0,
|  so every role created through the UI ranked at the lowest possible
|  authority — including five holding 96 permissions with users.manage
|  and roles.create. assertCanAssignRole() compares levels, and `0 > 0`
|  is false, so that guard could never refuse to hand them out.
|
|  WHY THIS IS JAVASCRIPT AND NOT SQL
|
|  The permissions a role grants are NOT what sits in the JSON column.
|  normalizePermissions() accepts three stored shapes and expands them:
|
|    {"users": true}          legacy module grant -> every users.* action
|    {"leads.delete": true}   implies leads.view via dependencies
|    {"x.y": false}           an explicit deny that beats a broad grant
|
|  On this database that divergence is severe. "Manager" at Arya ltd
|  stores 22 keys and resolves to 96 permissions; "Staff" at thee stores
|  96 keys and resolves to 11. A SQL migration keyed on the raw JSON —
|  counting keys, or reading $."users.manage" — would have ranked those
|  two exactly backwards and handed the most powerful roles the lowest
|  level. Only the real resolver gets this right.
|
|  THE LADDER
|
|    can manage users AND create roles  -> 70  (administrative)
|    everything else still at 0         -> 10  (operational)
|
|  Roles that already carry a non-zero level are left untouched: those
|  were set deliberately by the seed (90/60/50/10) and are correct.
|
|  Every move is UPWARD from 0, which is the safe direction — a higher
|  level makes a role HARDER to assign, never easier.
|
|  Idempotent: only rows still at level 0 are considered, so a second
|  run finds nothing to do.
*/
export default async function setRoleLevels() {
  const roles = await Role.findAll({ where: { isDeleted: false } })

  const notes = []
  let changed = 0

  for (const role of roles) {
    if ((role.level ?? 0) > 0) continue // already ranked, leave alone

    const granted = normalizePermissions(role.permissions)
    if (granted.size === 0) continue // an empty role ranks nowhere

    const administrative =
      granted.has('users.manage') && granted.has('roles.create')

    const level = administrative ? 70 : 10

    await role.update({ level })
    changed++
    notes.push(
      `${role.name} — ${granted.size} permissions -> level ${level}` +
        (administrative ? ' (administrative)' : '')
    )
  }

  notes.push(changed ? `${changed} role(s) ranked` : 'all roles already ranked')
  return notes
}
