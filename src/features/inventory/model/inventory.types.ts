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
    barcode: string
    size: string
    color: string
    cost_price: number
    sale_price: number
    suggested_price: number | null
    products: {
      id: string
      name: string
      category_id: string
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

/** Input para crear un ítem de inventario desde la UI de inventario */
export interface InventoryItemInput {
  categoryId: string
  description: string
  quantity: number
  costPrice: number
  salePrice: number
  minSalePrice: number
  reference: string
}

/** Vista plana de un ítem de inventario para la tabla */
export interface InventoryItemRow {
  stockId: string
  variantId: string
  productId: string
  categoryId: string
  description: string
  quantity: number
  costPrice: number
  salePrice: number
  minSalePrice: number | null
  reference: string
  barcode: string
}
