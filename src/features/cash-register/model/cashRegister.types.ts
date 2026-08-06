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
  /** Facturas manuales ACTIVAS pagadas en efectivo */
  invoiceCash: number
  /** Total facturas manuales ACTIVAS */
  invoiceTotal: number
  /** Desglose de facturas manuales ACTIVAS por método (excluye efectivo) */
  invoiceByMethod: Record<string, number>
  /** Facturas manuales ANULADAS pagadas en efectivo */
  invoiceVoidedCash: number
  /** Total facturas manuales ANULADAS (deducción) */
  invoiceVoidedTotal: number
  /** Desglose de facturas manuales ANULADAS por método */
  invoiceVoidedByMethod: Record<string, number>
  /** Total gastos ACTIVOS del dia */
  expensesTotal: number
  /** Total gastos ANULADOS/BORRADOS del dia (deducción) */
  expensesVoidedTotal: number
  /** Abonos a separados ACTIVOS pagados en efectivo */
  layawayCash: number
  /** Total abonos a separados ACTIVOS del dia */
  layawayTotal: number
  /** Desglose de abonos a separados ACTIVOS por metodo de pago (excluye efectivo) */
  layawayByMethod: Record<string, number>
  /** Abonos a separados ANULADOS pagados en efectivo */
  layawayVoidedCash: number
  /** Total abonos a separados ANULADOS */
  layawayVoidedTotal: number
  /** Desglose de abonos a separados ANULADOS por método */
  layawayVoidedByMethod: Record<string, number>
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
  /** ISO date (YYYY-MM-DD) de la sesion. Requerido para calculos transaccionales. */
  sessionDate?: string
}
