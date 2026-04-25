import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createPosSale, listPosVariants } from '../services/posService'
import { getDiscountPinConfig, setDiscountPinConfig } from '../services/discountPinService'
import type { PosSalePayload } from './pos.types'

export function usePosVariantsQuery(storeId?: string) {
  return useQuery({
    queryKey: ['pos', 'variants', storeId],
    queryFn: () => listPosVariants(storeId as string),
    enabled: Boolean(storeId),
  })
}

export function useCreatePosSaleMutation(storeId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: PosSalePayload) => createPosSale(payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pos', 'variants', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['inventory', 'stock', storeId] }),
      ])
    },
  })
}

export function useDiscountPinConfigQuery(storeId?: string) {
  return useQuery({
    queryKey: ['discount-pin-config', storeId],
    queryFn: () => getDiscountPinConfig(storeId as string),
    enabled: Boolean(storeId),
  })
}

export function useSetDiscountPinMutation(storeId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ pin, enabled }: { pin: string | null; enabled: boolean }) =>
      setDiscountPinConfig(storeId as string, pin, enabled),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['discount-pin-config', storeId] })
    },
  })
}
