export type ManualPaymentMethod = 'cash' | 'card' | 'transfer' | 'mixed'

export interface ManualInvoiceItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  line_total: number
}

export interface ManualInvoiceRow {
  id: string
  invoice_number: string
  customer_name: string | null
  customer_phone: string | null
  subtotal: number
  discount_total: number
  grand_total: number
  payment_method: ManualPaymentMethod
  payment_reference: string | null
  created_at: string
  manual_invoice_items: ManualInvoiceItem[] | null
}

export interface CreateManualInvoiceInput {
  storeId: string
  createdBy: string
  customerName: string
  customerPhone: string
  discountTotal: number
  paymentMethod: ManualPaymentMethod
  paymentReference: string
  items: Array<{
    description: string
    quantity: number
    unitPrice: number
  }>
}

export interface UpdateManualInvoiceHeaderInput {
  invoiceId: string
  actorUserId: string
  customerName: string
  customerPhone: string
  paymentMethod: ManualPaymentMethod
  paymentReference: string
}

export interface VoidManualInvoiceInput {
  invoiceId: string
  actorUserId: string
  reason?: string
}
