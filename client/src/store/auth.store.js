import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { normalizePermissions, checkPermission } from '@/lib/permissions'

/*
|--------------------------------------------------------------------------
| Auth store
|--------------------------------------------------------------------------
|
| Two problems the audit found here:
|
|  1. Permissions were a snapshot frozen at login. authAPI.getProfile()
|     existed but was never called, so changing a role had no effect on
|     the UI until the user logged out and back in. The backend picked
|     the change up immediately, so the menu and the API disagreed —
|     a link would still be visible but 403 when clicked.
|
|  2. The whole user object, including `role`, sits in localStorage and
|     was trusted for UI decisions. Editing localStorage still changes
|     what the UI *draws* — that is unavoidable for a SPA — but every
|     route and action is now enforced server-side as well, so a tampered
|     store buys an attacker nothing but a broken-looking screen.
|
| `permissions` is stored as a plain array (localStorage cannot hold a
| Set) and rehydrated into a Set on read.
*/

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      activeCompany: null,
      companies: [],
      permissions: [], // array of "module.action" strings
      isBootstrapping: true,

      setAuth: ({ user, token, companies }) => {
        const permissionSet = normalizePermissions(
          user?.permissions ?? user?.roleInfo?.permissions
        )

        set({
          user,
          token,
          companies: companies || [],
          permissions: [...permissionSet],
          // Prefer the user's home company; fall back to the first one
          // they belong to. Previously this always took companies[0],
          // which could silently drop somebody into the wrong tenant.
          activeCompany:
            companies?.find((c) => c.id === user?.companyId)?.id ||
            companies?.[0]?.id ||
            null,
          isBootstrapping: false,
        })
      },

      /**
       * Refreshes the session from GET /auth/me without disturbing the
       * token or the selected company. Call this on app mount and on
       * window focus so permission changes appear without a re-login.
       */
      refreshSession: ({ user, companies }) => {
        const permissionSet = normalizePermissions(
          user?.permissions ?? user?.roleInfo?.permissions
        )

        set((state) => ({
          user,
          permissions: [...permissionSet],
          companies: companies || state.companies,
          activeCompany:
            companies?.find((c) => c.id === state.activeCompany)?.id ||
            companies?.find((c) => c.id === user?.companyId)?.id ||
            companies?.[0]?.id ||
            state.activeCompany,
          isBootstrapping: false,
        }))
      },

      setBootstrapped: () => set({ isBootstrapping: false }),

      refreshCompanies: (companies) => {
        set((state) => ({
          companies,
          activeCompany:
            companies.find((c) => c.id === state.activeCompany)?.id ||
            companies[0]?.id ||
            null,
        }))
      },

      setActiveCompany: (companyId) => set({ activeCompany: companyId }),

      logout: () =>
        set({
          user: null,
          token: null,
          activeCompany: null,
          companies: [],
          permissions: [],
          isBootstrapping: false,
        }),

      isAuthenticated: () => !!get().token,

      hasRole: (roles) => {
        const user = get().user
        if (!user) return false
        return Array.isArray(roles) ? roles.includes(user.role) : user.role === roles
      },

      /**
       * The single permission check for the whole frontend.
       * Accepts 'leads.delete' or the bare module 'leads' (read as .view).
       */
      hasPermission: (permission) => {
        const { user, permissions } = get()
        if (!user) return false
        if (user.role === 'super_admin') return true
        return checkPermission(new Set(permissions), permission)
      },

      hasAnyPermission: (list = []) => {
        const { user, permissions } = get()
        if (!user) return false
        if (user.role === 'super_admin') return true
        const set_ = new Set(permissions)
        return list.some((p) => checkPermission(set_, p))
      },

      hasAllPermissions: (list = []) => {
        const { user, permissions } = get()
        if (!user) return false
        if (user.role === 'super_admin') return true
        const set_ = new Set(permissions)
        return list.every((p) => checkPermission(set_, p))
      },
    }),
    {
      name: 'crm-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        activeCompany: state.activeCompany,
        companies: state.companies,
        permissions: state.permissions,
      }),
    }
  )
)