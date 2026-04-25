import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addLayawayPayment,
  cancelLayaway,
  createLayaway,
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
      await qc.invalidateQueries({ queryKey: ['layaways', storeId] })
    },
  })
}

export function useCancelLayawayMutation(storeId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (layawayId: string) => cancelLayaway(layawayId),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['layaways', storeId] }),
        qc.invalidateQueries({ queryKey: ['inventory', 'stock', storeId] }),
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
