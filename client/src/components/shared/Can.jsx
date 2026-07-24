import usePermission from '@/hooks/usePermission'

/*
|--------------------------------------------------------------------------
| <Can>
|--------------------------------------------------------------------------
|
| Conditionally renders buttons, menu items, tabs and table actions.
|
| Before this existed, hasPermission() was called in exactly TWO places in
| the whole frontend — both inside Sidebar.jsx's menu loop. Every Delete,
| Approve and Edit button in the application rendered for every user.
|
| Usage:
|
|   <Can permission="leads.delete">
|     <button onClick={remove}>Delete</button>
|   </Can>
|
|   <Can anyOf={['payroll.approve', 'payroll.update']}>
|     <button>Approve Run</button>
|   </Can>
|
|   <Can permission="leads.create" fallback={<Tooltip>No access</Tooltip>}>
|     <button>New Lead</button>
|   </Can>
|
| Reminder: this is a UX affordance, not a security control. The server
| enforces the same permission on the endpoint behind every one of these
| buttons — hiding a control is a courtesy, not a defence.
*/
export default function Can({
  permission,
  anyOf,
  allOf,
  roles,
  fallback = null,
  children,
}) {
  const { hasPermission, hasAny, hasAll, isSuperAdmin, role } = usePermission()

  if (isSuperAdmin) return children

  let allowed = true

  if (permission) allowed = hasPermission(permission)
  if (allowed && anyOf?.length) allowed = hasAny(anyOf)
  if (allowed && allOf?.length) allowed = hasAll(allOf)
  if (allowed && roles?.length) allowed = roles.includes(role)

  return allowed ? children : fallback
}