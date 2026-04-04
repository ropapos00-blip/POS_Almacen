import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createPosSale, listPosVariants } from '../services/posService'
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
