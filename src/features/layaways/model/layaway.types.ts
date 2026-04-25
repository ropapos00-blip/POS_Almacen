export type LayawayStatus = 'active' | 'completed' | 'cancelled' | 'expired'

export interface LayawayItem {
  id: string
  layaway_id: string
  variant_id: string | null
  description: string
  quantity: number
  unit_price: number
  created_at: string
}

export interface LayawayPayment {
  id: string
  layaway_id: string
  amount: number
  payment_method: string
  notes: string | null
  created_at: string
}

export interface Layaway {
  id: string
  store_id: string
  customer_name: string
  customer_phone: string | null
  total_amount: number
  paid_amount: number
  status: LayawayStatus
  due_date: string
  notes: string | null
  created_at: string
  layaway_items: LayawayItem[]
  layaway_payments: LayawayPayment[]
}

export interface CreateLayawayInput {
  storeId: string
  customerName: string
  customerPhone: string
  notes: string | null
  createdBy: string
  items: Array<{
    variantId: string | null
    description: string
    quantity: number
    unitPrice: number
  }>
}

export interface AddLayawayPaymentInput {
  layawayId: string
  amount: number
  paymentMethod: string
  notes: string | null
  createdBy: string
}

export interface VariantLookup {
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
