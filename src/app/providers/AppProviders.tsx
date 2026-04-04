import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { useAuthStore } from '../../features/auth/model/useAuthStore'
import { supabase } from '../../integrations/supabase/client/supabaseClient'
import { appRouter } from '../router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

export function AppProviders() {
  const hydrateSession = useAuthStore((state) => state.hydrateSession)

  useEffect(() => {
    void hydrateSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void hydrateSession()
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [hydrateSession])

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={appRouter} />
    </QueryClientProvider>
  )
}
