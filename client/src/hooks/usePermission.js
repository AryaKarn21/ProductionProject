import { useMemo, useCallback } from "react";
import { useAuthStore } from "@/store/auth.store";
import { checkPermission } from "@/lib/permissions";

/*
|--------------------------------------------------------------------------
| usePermission
|--------------------------------------------------------------------------
|
| The single permission hook used by PermissionGuard, <Can>, the Sidebar
| and the Settings screens.
|
| This used to read the RAW permission object off the user
| (`user.permissions['leads'] === true`) — the OLD flat format. The rest
| of the app had already moved to the "module.action" model
| (config/permissions.js on the server, lib/permissions.js on the client,
| and the normalised array kept in auth.store.js), so this hook was the
| last file still speaking the dead vocabulary. Two things broke because
| of it:
|
|   1. For every NON super-admin, `permissions['leads']` was `undefined`
|      under the new format, so hasPermission() returned false for
|      everything. Result: guarded pages redirected to /unauthorized and
|      every sidebar link was hidden.
|
|   2. It never returned hasAny() / hasAll(), yet PermissionGuard.jsx and
|      Can.jsx both destructure them. The moment a route or a <Can> used
|      `anyOf` / `allOf`, the render threw "hasAny is not a function".
|
| It now reads the SAME normalised permission array the store maintains
| (already expanded, dependency-resolved, and deny-aware) and checks it
| with the SAME checkPermission() helper the store and the server use, so
| the menu, the route guard and the API can no longer disagree.
|
| It subscribes to `user` and `permissions` slices, so when
| refreshSession() pulls an updated role from GET /auth/me the components
| using this hook re-render immediately — no re-login required.
*/
export default function usePermission() {
  // Subscribe to just the slices we need so a permission refresh
  // re-renders consumers, without re-rendering on unrelated store writes.
  const user = useAuthStore((s) => s.user);
  const permissions = useAuthStore((s) => s.permissions);

  const role = user?.role;
  const isSuperAdmin = role === "super_admin";
  const isAdmin = role === "super_admin" || role === "admin";

  // Rehydrate the plain array from localStorage/state back into a Set
  // for O(1) lookups. Memoised so the identity is stable between renders.
  const grantedSet = useMemo(
    () => new Set(Array.isArray(permissions) ? permissions : []),
    [permissions]
  );

  // Accepts "leads.delete" or the bare module "leads" (read as ".view").
  const hasPermission = useCallback(
    (permission) => {
      if (!user) return false;
      if (isSuperAdmin) return true;
      return checkPermission(grantedSet, permission);
    },
    [user, isSuperAdmin, grantedSet]
  );

  // Passes when the user holds ANY one of the listed permissions.
  const hasAny = useCallback(
    (list = []) => {
      if (!user) return false;
      if (isSuperAdmin) return true;
      return list.some((p) => checkPermission(grantedSet, p));
    },
    [user, isSuperAdmin, grantedSet]
  );

  // Passes only when the user holds EVERY listed permission.
  const hasAll = useCallback(
    (list = []) => {
      if (!user) return false;
      if (isSuperAdmin) return true;
      return list.every((p) => checkPermission(grantedSet, p));
    },
    [user, isSuperAdmin, grantedSet]
  );

  return {
    role,
    permissions, // the normalised "module.action" array
    isSuperAdmin,
    isAdmin,

    hasPermission,
    hasAny,
    hasAll,

    // Long-form aliases, so code written against the store's names also
    // works when it reaches for the hook.
    hasAnyPermission: hasAny,
    hasAllPermissions: hasAll,
  };
}