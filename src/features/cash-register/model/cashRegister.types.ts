export interface CashRegisterSession {
  id: string
  store_id: string
  session_date: string
  opened_by: string
  closed_by: string | null
  cash_base: number
  status: 'open' | 'closed'
  notes_open: string | null
  notes_close: string | null
  cash_counted: number | null
  closed_at: string | null
  created_at: string
}

export interface DaySalesSummary {
  /** Ventas POS pagadas en efectivo */
  posCash: number
  /** Ventas POS pagadas con tarjeta (legacy) */
  posCard: number
  /** Ventas POS pagadas por transferencia (legacy) */
  posTransfer: number
  /** Total ventas POS confirmadas */
  posTotal: number
  /** Desglose de ventas POS por metodo de pago */
  posByMethod: Record<string, number>
  /** Facturas manuales pagadas en efectivo */
  invoiceCash: number
  /** Total facturas manuales activas */
  invoiceTotal: number
  /** Desglose de facturas manuales por método (excluye efectivo) */
  invoiceByMethod: Record<string, number>
  /** Total gastos del dia */
  expensesTotal: number
  /** Abonos a separados pagados en efectivo */
  layawayCash: number
  /** Total abonos a separados del dia */
  layawayTotal: number
  /** Desglose de abonos a separados por metodo de pago (excluye efectivo) */
  layawayByMethod: Record<string, number>
}

export interface OpenSessionInput {
  storeId: string
  openedBy: string
  cashBase: number
  notesOpen: string
  /** ISO date (YYYY-MM-DD) para pre-abrir una sesion futura. Por defecto: hoy. */
  sessionDate?: string
}

export interface CloseSessionInput {
  sessionId: string
  closedBy: string
  cashCounted: number
  notesClose: string
}
