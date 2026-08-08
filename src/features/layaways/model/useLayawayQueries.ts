import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addLayawayPayment,
  archiveLayaway,
  cancelLayaway,
  createLayaway,
  getLayawayKpis,
  listLayaways,
  updateLayawayCustomer,
} from '../services/layawayService'
import type { AddLayawayPaymentInput, CreateLayawayInput } from './layaway.types'

export function useLayawaysQuery(storeId?: string) {
  return useQuery({
    queryKey: ['layaways', storeId],
    queryFn: () => listLayaways(storeId!),
    enabled: Boolean(storeId),
  })
}

export function useCreateLayawayMutation(storeId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateLayawayInput) => createLayaway(input),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['layaways', storeId] }),
        qc.invalidateQueries({ queryKey: ['inventory', 'stock', storeId] }),
      ])
    },
  })
}

export function useAddLayawayPaymentMutation(storeId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AddLayawayPaymentInput) => addLayawayPayment(input),
    onSuccess: async () => {
      // First invalidate all related queries
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['layaways', storeId] }),
        // Use predicate to invalidate ALL payment-kpis queries (most aggressive approach)
        qc.invalidateQueries({ 
          predicate: (query) => {
            return (
              Array.isArray(query.queryKey) &&
              query.queryKey[0] === 'manual-invoices' &&
              query.queryKey[1] === 'payment-kpis'
            )
          },
        }),
        // Also invalidate layaway KPIs and general manual invoice KPIs
        qc.invalidateQueries({ 
          queryKey: ['layaways', 'kpis'],
          exact: false
        }),
        qc.invalidateQueries({ 
          queryKey: ['manual-invoices', 'kpis'],
          exact: false
        }),
      ])
      
      // Then refetch the payment KPIs immediately to ensure fresh data
      await qc.refetchQueries({
        predicate: (query) => {
          return (
            Array.isArray(query.queryKey) &&
            query.queryKey[0] === 'manual-invoices' &&
            query.queryKey[1] === 'payment-kpis'
          )
        },
      })
    },
  })
}

export function useCancelLayawayMutation(storeId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (layawayId: string) => cancelLayaway(layawayId),
    onSuccess: async () => {
      // Invalidate all related queries including payment-kpis
      // Canceling a layaway may have had payments, so we need to update payment totals
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['layaways', storeId] }),
        qc.invalidateQueries({ queryKey: ['inventory', 'stock', storeId] }),
        qc.invalidateQueries({ 
          predicate: (query) => {
            return (
              Array.isArray(query.queryKey) &&
              query.queryKey[0] === 'manual-invoices' &&
              query.queryKey[1] === 'payment-kpis'
            )
          },
        }),
      ])
    },
  })
}

export function useArchiveLayawayMutation(storeId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (layawayId: string) => archiveLayaway(layawayId),
    onSuccess: async () => {
      // Invalidate all related queries including payment-kpis
      // Archiving a layaway may have had payments, so we need to update payment totals
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['layaways', storeId] }),
        qc.invalidateQueries({ 
          predicate: (query) => {
            return (
              Array.isArray(query.queryKey) &&
              query.queryKey[0] === 'manual-invoices' &&
              query.queryKey[1] === 'payment-kpis'
            )
          },
        }),
      ])
    },
  })
}

export function useUpdateLayawayMutation(storeId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, customerName, customerPhone }: { id: string; customerName: string; customerPhone: string }) =>
      updateLayawayCustomer(id, customerName, customerPhone),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['layaways', storeId] })
    },
  })
}

export function useLayawayKpisQuery(storeId?: string, enabled = true) {
  return useQuery({
    queryKey: ['layaways', 'kpis', storeId],
    queryFn: () => getLayawayKpis(storeId!),
    enabled: Boolean(storeId) && enabled,
  })
}
