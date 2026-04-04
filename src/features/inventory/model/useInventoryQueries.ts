import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adjustStock, listInventoryStock } from '../services/inventoryService'
import type { StockAdjustmentInput } from './inventory.types'

export function useInventoryStockQuery(storeId?: string) {
  return useQuery({
    queryKey: ['inventory', 'stock', storeId],
    queryFn: () => listInventoryStock(storeId as string),
    enabled: Boolean(storeId),
  })
}

export function useAdjustStockMutation(storeId?: string, userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: StockAdjustmentInput) =>
      adjustStock(storeId as string, userId as string, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['inventory', 'stock', storeId],
      })
    },
  })
}
