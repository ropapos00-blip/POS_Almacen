export interface PriceCheckVariant {
  id: string
  sku: string
  barcode: string
  size: string
  color: string
  sale_price: number
  products: Array<{ name: string }> | null
  inventory_stock: Array<{ quantity_on_hand: number }> | null
}
