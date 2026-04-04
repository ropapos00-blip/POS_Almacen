export interface InventoryStockRow {
  id: string
  store_id: string
  variant_id: string
  quantity_on_hand: number
  quantity_reserved: number
  reorder_level: number
  updated_at: string
  product_variants: {
    sku: string
    size: string
    color: string
    products: {
      name: string
    } | null
  } | null
}

export interface InventoryMovement {
  id: string
  store_id: string
  variant_id: string
  type: 'in' | 'out' | 'adjustment' | 'sale' | 'return'
  quantity: number
  reason: string | null
  created_at: string
}

export interface StockAdjustmentInput {
  stockId: string
  variantId: string
  currentQuantity: number
  delta: number
  reason: string
}
