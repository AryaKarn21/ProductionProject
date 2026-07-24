import { Navigate, Outlet, useLocation } from 'react-router-dom'
import usePermission from '@/hooks/usePermission'
import { useAuthStore } from '@/store/auth.store'

/*
|--------------------------------------------------------------------------
| PermissionGuard
|--------------------------------------------------------------------------
|
| Replaces RoleGuard.jsx, which was written but NEVER IMPORTED — grep the
| old client for "RoleGuard" and it appears exactly once, in its own file.
|
| Because of that, ProtectedRoute (a bare "is there a token?" check) was
| the only guard in the entire application. Every page — Settings, Roles,
| Users, Audit Log, Payroll, Finance — was reachable by typing the URL.
| The sole authorization in the UI was hiding sidebar links.
|
| Usage as a layout route (guards everything nested under it):
|
|   <Route element={<PermissionGuard permission="payroll.view" />}>
|     <Route path="/hr/payroll" element={<Payroll />} />
|   </Route>
|
| Usage as a wrapper around one element:
|
|   <Route path="/settings" element={
|     <PermissionGuard permission="settings.view"><Settings /></PermissionGuard>
|   } />
|
| Props:
|   permission   string        a single required permission
|   anyOf        string[]      pass if ANY is held
|   allOf        string[]      pass only if ALL are held
|   roles        string[]      legacy role check, for the few screens
|                              still gated on the role ENUM
|   redirectTo   string        defaults to /unauthorized
*/
export default function PermissionGuard({
  permission,
  anyOf,
  allOf,
  roles,
  redirectTo = '/unauthorized',
  children,
}) {
  const location = useLocation()
  const { hasPermission, hasAny, hasAll, isSuperAdmin } = usePermission()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping)

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // While GET /auth/me is in flight the permission list may still be the
  // stale one from localStorage. Rendering a redirect here would bounce
  // the user off a page they are allowed to see, so wait it out.
  if (isBootstrapping || !user) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      </div>
    )
  }

  if (isSuperAdmin) return children ?? <Outlet />

  let allowed = true

  if (permission) allowed = hasPermission(permission)
  if (allowed && anyOf?.length) allowed = hasAny(anyOf)
  if (allowed && allOf?.length) allowed = hasAll(allOf)
  if (allowed && roles?.length) allowed = roles.includes(user.role)

  if (!allowed) {
    return <Navigate to={redirectTo} state={{ from: location, permission }} replace />
  }

  return children ?? <Outlet />
}