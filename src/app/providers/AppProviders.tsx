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

// Tablas de negocio con columna store_id cuyos cambios deben refrescar los
// KPIs/listados de ESA tienda. Filtrar por store_id evita que una venta en
// la tienda A dispare un refetch masivo en los navegadores de la tienda B.
// sale_payments/layaway_payments no tienen store_id propio, pero se insertan
// en la misma transaccion que sales/layaways, asi que esas ya cubren el caso.
const STORE_SCOPED_REALTIME_TABLES = [
  'sales',
  'manual_invoices',
  'manual_invoice_expenses',
  'cash_register_sessions',
  'layaways',
] as const

// Prefijos de queryKey afectados por esas tablas. Se invalidan de forma
// selectiva (no toda la cache) para no refrescar catalogo/usuarios/etc.
// sin necesidad.
const REALTIME_INVALIDATION_QUERY_KEYS: unknown[][] = [
  ['manual-invoices'],
  ['cash-register'],
  ['sales'],
  ['layaways'],
  ['dashboard'],
  ['inventory'],
]

export function AppProviders() {
  const hydrateSession = useAuthStore((state) => state.hydrateSession)
  const storeId = useAuthStore((state) => state.user?.storeId)

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
    if (!storeId) {
      return
    }

    let invalidateTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleInvalidate = () => {
      // Coalesce multiple DB events emitted by a single transaction burst.
      if (invalidateTimer) {
        return
      }

      invalidateTimer = setTimeout(() => {
        invalidateTimer = null
        for (const queryKey of REALTIME_INVALIDATION_QUERY_KEYS) {
          void queryClient.invalidateQueries({ queryKey })
        }
      }, 250)
    }

    let channel = supabase.channel(`app-realtime-db-changes-${storeId}`)
    for (const table of STORE_SCOPED_REALTIME_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `store_id=eq.${storeId}` },
        scheduleInvalidate,
      )
    }
    channel.subscribe()

    return () => {
      if (invalidateTimer) {
        clearTimeout(invalidateTimer)
      }
      void supabase.removeChannel(channel)
    }
  }, [storeId])

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={appRouter} />
    </QueryClientProvider>
  )
}
