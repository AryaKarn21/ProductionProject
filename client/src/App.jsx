import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Toaster } from 'react-hot-toast'
import { router } from './routes'
import { useUIStore } from '@/store/ui.store'
import { useEffect } from 'react'
import AuthBootstrap from '@/components/shared/AuthBootstrap'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 2,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  const { theme } = useUIStore()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <QueryClientProvider client={queryClient}>
      {/*
        AuthBootstrap calls GET /auth/me on mount and whenever the tab
        regains focus, then writes the fresh permission list into the
        auth store.

        Without it, user.permissions was a snapshot frozen at login.
        The server applied a role change on the very next request, but
        the UI did not until the user signed out and back in — so a menu
        item would still be visible and then 403 when clicked, or a newly
        granted module would stay hidden.

        It must WRAP RouterProvider, not just be imported. PermissionGuard
        reads isBootstrapping from the store and shows a spinner while
        this request is in flight, so nobody gets bounced to
        /unauthorized on a stale permission list.
      */}
      <AuthBootstrap>
        <RouterProvider router={router} />
      </AuthBootstrap>

      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3500,
          style: {
            background: 'var(--surface)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: '13px',
            boxShadow: 'var(--shadow)',
          },
        }}
      />
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  )
}