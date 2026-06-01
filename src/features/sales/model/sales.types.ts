export type SaleStatus = 'confirmed' | 'void'

export interface SaleItemRow {
  id: string
  sku_snapshot: string
  name_snapshot: string
  size_snapshot: string
  color_snapshot: string
  unit_price: number
  quantity: number
  discount_amount?: number | null
  line_total: number
}

export interface SalePaymentRow {
  id: string
  method: 'cash' | 'card' | 'transfer' | 'mixed' | 'addi' | 'credilondon' | 'dataphone' | 'bancolombia' | 'daviplata' | 'nequi'
  amount: number
  reference: string | null
  paid_at: string
}

export interface SaleRow {
  id: string
  sale_number: string
  customer_name: string | null
  subtotal: number
  discount_total: number
  tax_total: number
  grand_total: number
  status: SaleStatus
  sold_at: string
  sale_items: SaleItemRow[] | null
  sale_payments: SalePaymentRow[] | null
}

export interface SalesFilters {
  search: string
  status: 'all' | SaleStatus
  fromDate: string
  toDate: string
  viewerRole?: 'super_admin' | 'admin' | 'cashier'
}
