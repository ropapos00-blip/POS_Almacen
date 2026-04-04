import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listSales, voidSale } from '../services/salesService'
import type { SalesFilters } from './sales.types'

export function useSalesQuery(storeId: string | undefined, filters: SalesFilters) {
  return useQuery({
    queryKey: ['sales', 'list', storeId, filters],
    queryFn: () => listSales(storeId as string, filters),
    enabled: Boolean(storeId),
  })
}

export function useVoidSaleMutation(storeId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      saleId,
      actorUserId,
      reason,
    }: {
      saleId: string
      actorUserId: string
      reason: string
    }) => voidSale(saleId, actorUserId, reason),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sales', 'list'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory', 'stock', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis', storeId] }),
      ])
    },
  })
}
