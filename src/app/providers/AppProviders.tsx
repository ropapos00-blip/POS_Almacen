import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { useAuthStore } from '../../features/auth/model/useAuthStore'
import { supabase } from '../../integrations/supabase/client/supabaseClient'
import { appRouter } from '../router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
      refetchInterval: 15_000,
      refetchIntervalInBackground: true,
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

  useEffect(() => {
    let invalidateTimer: ReturnType<typeof setTimeout> | null = null

    const channel = supabase
      .channel('app-realtime-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        () => {
          // Coalesce multiple DB events emitted by a single transaction burst.
          if (invalidateTimer) {
            return
          }

          invalidateTimer = setTimeout(() => {
            invalidateTimer = null
            void queryClient.invalidateQueries()
          }, 250)
        },
      )
      .subscribe()

    return () => {
      if (invalidateTimer) {
        clearTimeout(invalidateTimer)
      }
      void supabase.removeChannel(channel)
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={appRouter} />
    </QueryClientProvider>
  )
}
