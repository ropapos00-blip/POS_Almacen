export interface PosVariant {
  id: string
  sku: string
  barcode: string
  size: string
  color: string
  cost_price: number
  sale_price: number
  products: Array<{ name: string }> | null
  inventory_stock: Array<{ quantity_on_hand: number }> | null
}

export interface PosCartItem {
  variantId: string
  sku: string
  name: string
  size: string
  color: string
  costPrice: number
  unitPrice: number
  stockAvailable: number
  quantity: number
}

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'mixed'

export interface PosSalePayload {
  storeId: string
  soldBy: string
  discountTotal: number
  customerName?: string
  paymentMethod: PaymentMethod
  paymentReference?: string
  items: Array<{ variant_id: string; quantity: number }>
}

export interface DiscountAuthorizationResult {
  authorized: boolean
  adminUserId: string
  adminName: string
  adminRoleCode: 'super_admin' | 'admin'
}
