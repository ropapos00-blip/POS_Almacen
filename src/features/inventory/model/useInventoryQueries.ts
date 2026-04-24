import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  adjustStock,
  createInventoryItem,
  deleteInventoryItem,
  listInventoryStock,
  mapStockToItems,
  updateInventoryItem,
} from '../services/inventoryService'
import type { InventoryItemInput, StockAdjustmentInput } from './inventory.types'

const STOCK_KEY = (storeId?: string) => ['inventory', 'stock', storeId] as const

export function useInventoryStockQuery(storeId?: string) {
  return useQuery({
    queryKey: STOCK_KEY(storeId),
    queryFn: () => listInventoryStock(storeId as string),
    enabled: Boolean(storeId),
  })
}

/** Items planos derivados del stock (para la tabla de inventario) */
export function useInventoryItemsQuery(storeId?: string) {
  return useQuery({
    queryKey: STOCK_KEY(storeId),
    queryFn: async () => {
      const rows = await listInventoryStock(storeId as string)
      return mapStockToItems(rows)
    },
    enabled: Boolean(storeId),
  })
}

export function useCreateInventoryItemMutation(storeId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: InventoryItemInput) =>
      createInventoryItem(storeId as string, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: STOCK_KEY(storeId) })
    },
  })
}

export function useUpdateInventoryItemMutation(storeId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (
      input: InventoryItemInput & {
        productId: string
        variantId: string
        stockId: string
      },
    ) => updateInventoryItem(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: STOCK_KEY(storeId) })
    },
  })
}

export function useDeleteInventoryItemMutation(storeId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      productId,
      variantId,
      stockId,
    }: {
      productId: string
      variantId: string
      stockId: string
    }) => deleteInventoryItem(productId, variantId, stockId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: STOCK_KEY(storeId) })
    },
  })
}

export function useAdjustStockMutation(storeId?: string, userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: StockAdjustmentInput) =>
      adjustStock(storeId as string, userId as string, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: STOCK_KEY(storeId) })
    },
  })
}

