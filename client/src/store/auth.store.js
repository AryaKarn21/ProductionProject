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

/*
| Derives the flat "module.action" permission array to keep in state.
|
| The server's buildAuthPayload() already sends `user.permissions` as a
| FULLY RESOLVED array (role hierarchy + dependencies applied, unknown
| keys stripped, in the exact vocabulary the API enforces). We must use
| that array as-is.
|
| The bug this replaces: the store passed that array straight into
| normalizePermissions(), whose job is to parse the RAW role object
| ({ "leads.view": true } or legacy { leads: true }). That function
| explicitly rejects arrays and returns an empty Set — so every
| non-super-admin ended up with ZERO permissions in the store, their
| whole sidebar hidden and every guarded route bouncing to /unauthorized,
| even though the server had granted them correctly.
|
| The normalizePermissions() fallback is kept for any payload that still
| arrives in the raw-object shape (e.g. an older cached login).
*/
const derivePermissions = (user) => {
  if (Array.isArray(user?.permissions)) return user.permissions
  return [...normalizePermissions(user?.permissions ?? user?.roleInfo?.permissions)]
}

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
        set({
          user,
          token,
          companies: companies || [],
          permissions: derivePermissions(user),
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
        set((state) => ({
          user,
          permissions: derivePermissions(user),
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

      // Was a plain `set({ activeCompany: companyId })` — it changed
      // which company's data API calls fetched (via the X-Company-ID
      // header in api/axios.js), but never re-fetched *permissions* for
      // that company. A user can hold a different role per company
      // (server: middleware/tenant.js applyCompanyRole), so switching
      // from a company where you're a Manager to one where you're a
      // plain Employee left the frontend still showing Manager-level UI
      // (e.g. leave approve/reject buttons) until the next full login.
      //
      // The company id is set first, synchronously, so the very next API
      // call already carries the right header — then GET /auth/me is
      // re-fetched (now company-aware server-side too, see
      // server/routes/auth.routes.js buildAuthPayload) and its fresh
      // permissions are applied via refreshSession().
      setActiveCompany: async (companyId) => {
        set({ activeCompany: companyId })
        try {
          // Dynamic import: api/axios.js imports this store (for the
          // request interceptor), so a static top-level import here would
          // be a circular dependency. Deferring the import until this
          // function actually runs breaks the cycle.
          const { authAPI } = await import('@/api/auth.api')
          const { data } = await authAPI.getProfile()
          get().refreshSession({ user: data.user, companies: data.companies })
        } catch {
          // If this fails, the company id itself has already switched —
          // worst case the UI shows stale permissions until the next
          // natural refreshSession() (app focus, next mount), not a
          // broken switch. Never let a refresh hiccup block navigation.
        }
      },

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