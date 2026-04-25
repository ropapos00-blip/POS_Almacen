export interface PosVariant {
  id: string
  sku: string
  barcode: string
  size: string
  color: string
  cost_price: number
  sale_price: number
  suggested_price: number | null
  products: { name: string } | null
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
  minSalePrice: number
  stockAvailable: number
  quantity: number
  discount: number
}

export type PosPaymentMethod =
  | 'cash'
  | 'addi'
  | 'credilondon'
  | 'dataphone'
  | 'bancolombia'
  | 'daviplata'
  | 'nequi'

export type PaymentMethod = PosPaymentMethod | 'mixed'

export interface PosSalePayload {
  storeId: string
  soldBy: string
  discountTotal: number
  customerName?: string
  paymentMethod: PaymentMethod
  paymentReference?: string
  /** For mixed payment: first method */
  mixedFirstMethod?: PosPaymentMethod
  /** For mixed payment: amount for first method */
  mixedFirstAmount?: number
  /** For mixed payment: second method */
  mixedSecondMethod?: PosPaymentMethod
  /** For mixed payment: amount for second method */
  mixedSecondAmount?: number
  items: Array<{ variant_id: string; quantity: number }>
}

export interface DiscountAuthorizationResult {
  authorized: boolean
  adminUserId: string
  adminName: string
  adminRoleCode: 'super_admin' | 'admin'
}
