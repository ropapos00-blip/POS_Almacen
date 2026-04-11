export type WholesalePaymentMethod = 'cash' | 'card' | 'transfer' | 'mixed' | 'credit'

export type WholesalePaymentChannel = 'cash' | 'card' | 'transfer' | 'mixed'

export type WholesaleInvoiceStatus = 'issued' | 'partial' | 'paid' | 'overdue' | 'void'

export interface WholesaleInvoiceItem {
  id: string
  wholesale_reference_id?: string | null
  variant_id: string | null
  reference: string
  description: string
  quantity: number
  unit_price: number
  line_total: number
}

export interface WholesaleReferenceOption {
  variantId: string
  reference: string
  productName: string
  unitPrice: number
  quantityOnHand: number
}

export interface WholesaleInventoryRow {
  variantId: string
  reference: string
  productName: string
  unitPrice: number
  quantityOnHand: number
}

export interface AdjustWholesaleInventoryInput {
  variantId: string
  currentQuantity: number
  delta: number
  reason: string
}

export interface CreateWholesaleReferenceInput {
  reference: string
  unitPrice: number
  quantityOnHand: number
}

export interface UpdateWholesaleReferenceInput {
  referenceId: string
  reference: string
  unitPrice: number
  quantityOnHand: number
}

export interface WholesalePaymentRow {
  id: string
  paid_at: string
  amount: number
  payment_method: WholesalePaymentChannel
  payment_reference: string | null
  notes: string | null
}

export interface WholesaleInvoiceRow {
  id: string
  invoice_number: string
  customer_name: string | null
  customer_phone: string | null
  issued_at: string
  due_date: string | null
  subtotal: number
  discount_total: number
  grand_total: number
  paid_total: number
  balance_due: number
  is_credit: boolean
  status: WholesaleInvoiceStatus
  payment_method: WholesalePaymentMethod
  payment_reference: string | null
  notes: string | null
  wholesale_invoice_items: WholesaleInvoiceItem[] | null
  wholesale_payments: WholesalePaymentRow[] | null
}

export interface CreateWholesaleInvoiceInput {
  storeId: string
  createdBy: string
  customerName: string
  customerPhone: string
  discountTotal: number
  paymentMethod: WholesalePaymentMethod
  isCredit: boolean
  dueDate: string | null
  items: Array<{
    variantId: string
    quantity: number
  }>
}

export interface UpdateWholesaleInvoiceHeaderInput {
  invoiceId: string
  customerName: string
  customerPhone: string
}

export interface RegisterWholesalePaymentInput {
  invoiceId: string
  actorUserId: string
  amount: number
  paymentMethod: WholesalePaymentChannel
  paymentReference: string
  notes: string
}