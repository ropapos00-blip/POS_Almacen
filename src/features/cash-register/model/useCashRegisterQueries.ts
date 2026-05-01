import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  closeSession,
  getDaySalesSummary,
  getLastSession,
  getSessionsByRange,
  getTodaySession,
  openSession,
  updateCashBase,
} from '../services/cashRegisterService'
import type { CloseSessionInput, OpenSessionInput } from './cashRegister.types'

export function useTodaySessionQuery(storeId?: string) {
  return useQuery({
    queryKey: ['cash-register', 'today', storeId],
    queryFn: () => getTodaySession(storeId as string),
    enabled: Boolean(storeId),
    refetchInterval: 60_000,
  })
}

export function useLastSessionQuery(storeId?: string) {
  return useQuery({
    queryKey: ['cash-register', 'last', storeId],
    queryFn: () => getLastSession(storeId as string),
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

export function useDaySalesSummaryQuery(storeId?: string, dateIso?: string) {
  return useQuery({
    queryKey: ['cash-register', 'summary', storeId, dateIso],
    queryFn: () => getDaySalesSummary(storeId as string, dateIso as string),
    enabled: Boolean(storeId) && Boolean(dateIso),
    refetchInterval: 30_000,
  })
}

export function useOpenSessionMutation(storeId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: OpenSessionInput) => openSession(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cash-register', 'today', storeId] })
      void queryClient.invalidateQueries({ queryKey: ['cash-register', 'history', storeId] })
    },
  })
}

export function useCloseSessionMutation(storeId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CloseSessionInput) => closeSession(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cash-register', 'today', storeId] })
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
      void queryClient.invalidateQueries({ queryKey: ['cash-register', 'today', storeId] })
    },
  })
}
