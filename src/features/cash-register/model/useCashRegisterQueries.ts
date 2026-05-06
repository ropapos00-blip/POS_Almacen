import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  closeSession,
  getActiveSession,
  getDaySalesSummary,
  getMostRecentSession,
  getSessionsByRange,
  openSession,
  updateCashBase,
} from '../services/cashRegisterService'
import type { CloseSessionInput, OpenSessionInput } from './cashRegister.types'

/**
 * Sesion actualmente ABIERTA de la tienda, sin importar la fecha de apertura.
 * Permite que la caja permanezca abierta varios dias hasta que el admin la cierre.
 */
export function useActiveSessionQuery(storeId?: string) {
  return useQuery({
    queryKey: ['cash-register', 'active', storeId],
    queryFn: () => getActiveSession(storeId as string),
    enabled: Boolean(storeId),
    refetchInterval: 60_000,
  })
}

/**
 * Sesion mas reciente (abierta o cerrada). Usada para mostrar el resultado
 * del cierre despues de que el admin cierra una sesion multi-dia.
 */
export function useMostRecentSessionQuery(storeId?: string) {
  return useQuery({
    queryKey: ['cash-register', 'recent', storeId],
    queryFn: () => getMostRecentSession(storeId as string),
    enabled: Boolean(storeId),
    staleTime: 5 * 60_000,
  })
}

export function useSessionsByRangeQuery(storeId?: string, fromDate?: string, toDate?: string) {
  return useQuery({
    queryKey: ['cash-register', 'history', storeId, fromDate, toDate],
    queryFn: () => getSessionsByRange(storeId as string, fromDate as string, toDate as string),
    enabled: Boolean(storeId) && Boolean(fromDate) && Boolean(toDate),
  })
}

/**
 * Resumen de ventas/gastos para un periodo.
 * Si toDateIso es distinto de fromDateIso, acumula datos de multiples dias.
 */
export function useDaySalesSummaryQuery(storeId?: string, fromDateIso?: string, toDateIso?: string) {
  return useQuery({
    queryKey: ['cash-register', 'summary', storeId, fromDateIso, toDateIso],
    queryFn: () => getDaySalesSummary(storeId as string, fromDateIso as string, toDateIso),
    enabled: Boolean(storeId) && Boolean(fromDateIso),
    refetchInterval: 30_000,
  })
}

export function useOpenSessionMutation(storeId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: OpenSessionInput) => openSession(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cash-register', 'active', storeId] })
      void queryClient.invalidateQueries({ queryKey: ['cash-register', 'recent', storeId] })
      void queryClient.invalidateQueries({ queryKey: ['cash-register', 'history', storeId] })
    },
  })
}

export function useCloseSessionMutation(storeId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CloseSessionInput) => closeSession(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cash-register', 'active', storeId] })
      void queryClient.invalidateQueries({ queryKey: ['cash-register', 'recent', storeId] })
      void queryClient.invalidateQueries({ queryKey: ['cash-register', 'history', storeId] })
    },
  })
}

export function useUpdateCashBaseMutation(storeId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      sessionId,
      cashBase,
      notesOpen,
    }: {
      sessionId: string
      cashBase: number
      notesOpen: string
    }) => updateCashBase(sessionId, cashBase, notesOpen),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cash-register', 'active', storeId] })
      void queryClient.invalidateQueries({ queryKey: ['cash-register', 'recent', storeId] })
    },
  })
}
