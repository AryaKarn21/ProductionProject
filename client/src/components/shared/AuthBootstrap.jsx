import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/store/auth.store'
import { authAPI } from '@/api/auth.api'

/*
|--------------------------------------------------------------------------
| AuthBootstrap
|--------------------------------------------------------------------------
|
| Fixes the audit finding that permission changes required a logout.
|
| authAPI.getProfile() (GET /auth/me) existed in the codebase but had no
| call sites anywhere. That meant user.permissions in localStorage was a
| snapshot frozen at login. Change a role's permissions and:
|
|   - the SERVER applied it on the very next request  (protect re-reads
|     roleInfo every time)
|   - the CLIENT did not, until the user signed out and back in
|
| So a menu item would still be visible and then 403 when clicked, or a
| newly granted module would stay hidden. This component closes that gap
| by refreshing on mount and whenever the tab regains focus.
|
| Must WRAP RouterProvider in App.jsx — importing it is not enough.
*/
export default function AuthBootstrap({ children }) {
  const token = useAuthStore((s) => s.token)
  const refreshSession = useAuthStore((s) => s.refreshSession)
  const setBootstrapped = useAuthStore((s) => s.setBootstrapped)
  const logout = useAuthStore((s) => s.logout)

  const inFlight = useRef(false)

  const refresh = async () => {
    if (!token || inFlight.current) return
    inFlight.current = true

    try {
      const res = await authAPI.getProfile()
      refreshSession({ user: res.data.user, companies: res.data.companies })
    } catch (err) {
      // 401 means the token was revoked (logout elsewhere, password
      // change, role change, or suspension). The axios interceptor
      // already redirects; this just clears local state.
      if (err.response?.status === 401) logout()
      setBootstrapped()
    } finally {
      inFlight.current = false
    }
  }

  // On mount / whenever a token appears.
  useEffect(() => {
    if (!token) {
      setBootstrapped()
      return
    }
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // On tab focus, so a permission change made by an administrator shows
  // up as soon as the user comes back to the tab.
  useEffect(() => {
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  return children
}