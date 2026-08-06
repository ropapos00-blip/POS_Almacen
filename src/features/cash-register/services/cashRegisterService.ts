import { supabase } from '../../../integrations/supabase/client/supabaseClient'
import {
  getTodayIsoDateColombia,
  toUtcIsoEndOfColombiaDay,
  toUtcIsoStartOfColombiaDay,
} from '../../../shared/utils/dateTime'
import type {
  CashRegisterSession,
  CloseSessionInput,
  DaySalesSummary,
  OpenSessionInput,
} from '../model/cashRegister.types'

export async function getTodaySession(storeId: string): Promise<CashRegisterSession | null> {
  const today = getTodayIsoDateColombia()

  const { data, error } = await supabase
    .from('cash_register_sessions')
    .select('*')
    .eq('store_id', storeId)
    .eq('session_date', today)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data as CashRegisterSession | null
}

export async function getSessionsByRange(
  storeId: string,
  fromDate: string,
  toDate: string,
): Promise<CashRegisterSession[]> {
  const { data, error } = await supabase
    .from('cash_register_sessions')
    .select('*')
    .eq('store_id', storeId)
    .gte('session_date', fromDate)
    .lte('session_date', toDate)
    .order('session_date', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as CashRegisterSession[]
}

export async function openSession(input: OpenSessionInput): Promise<CashRegisterSession> {
  const sessionDate = input.sessionDate ?? getTodayIsoDateColombia()

  const { data, error } = await supabase
    .from('cash_register_sessions')
    .insert({
      store_id: input.storeId,
      session_date: sessionDate,
      opened_by: input.openedBy,
      cash_base: input.cashBase,
      notes_open: input.notesOpen || null,
      status: 'open',
    })
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as CashRegisterSession
}

/**
 * Valida que los cálculos de un resumen diario sean consistentes.
 * Detecta inconsistencias en sumas de métodos vs totales reportados.
 * NO lanza error, solo retorna validación para que UI pueda alertar.
 */
export function validateDaySalesSummary(summary: DaySalesSummary): {
  isValid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  // Validar POS
  const posByMethodSum = Object.values(summary.posByMethod).reduce((a, b) => a + b, 0)
  if (Math.abs(posByMethodSum - summary.posTotal) > 0.01) {
    errors.push(
      `Ventas POS: suma de métodos (${posByMethodSum}) ≠ total (${summary.posTotal})`,
    )
  }

  // Validar que posCash está correctamente en desglose
  const posCashFromMethod = summary.posByMethod['cash'] ?? 0
  if (Math.abs(posCashFromMethod - summary.posCash) > 0.01) {
    warnings.push(
      `Ventas POS: cash reportado (${summary.posCash}) ≠ cash en métodos (${posCashFromMethod})`,
    )
  }

  // Validar facturas
  const invoiceByMethodSum = Object.values(summary.invoiceByMethod).reduce((a, b) => a + b, 0)
  const invoiceTotalRecalc = summary.invoiceCash + invoiceByMethodSum
  if (Math.abs(invoiceTotalRecalc - summary.invoiceTotal) > 0.01) {
    errors.push(
      `Facturas: cash (${summary.invoiceCash}) + otros (${invoiceByMethodSum}) ≠ total (${summary.invoiceTotal})`,
    )
  }

  // Validar separados
  const layawayByMethodSum = Object.values(summary.layawayByMethod).reduce((a, b) => a + b, 0)
  const layawayTotalRecalc = summary.layawayCash + layawayByMethodSum
  if (Math.abs(layawayTotalRecalc - summary.layawayTotal) > 0.01) {
    errors.push(
      `Separados: cash (${summary.layawayCash}) + otros (${layawayByMethodSum}) ≠ total (${summary.layawayTotal})`,
    )
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}

export async function closeSession(input: CloseSessionInput): Promise<void> {
  const { error } = await supabase
    .from('cash_register_sessions')
    .update({
      status: 'closed',
      closed_by: input.closedBy,
      cash_counted: input.cashCounted,
      notes_close: input.notesClose || null,
      closed_at: new Date().toISOString(),
    })
    .eq('id', input.sessionId)

  if (error) {
    throw new Error(error.message)
  }
}

/**
 * Cierra caja con validaciones transaccionales y auditoría.
 * Calcula efectivo esperado en backend y detecta discrepancias.
 * Registra diferencias antes de confirmar cierre.
 */
export async function closeSessionTransactional(
  input: CloseSessionInput & { sessionDate: string },
): Promise<{
  sessionId: string
  closed: boolean
  expectedCash: number
  difference: number
  message: string
  discrepancyId?: string
}> {
  const { data, error } = await supabase.rpc('close_cash_register_transactional', {
    p_session_id: input.sessionId,
    p_closed_by: input.closedBy,
    p_cash_counted: input.cashCounted,
    p_notes_close: input.notesClose || null,
    p_session_date: input.sessionDate,
  })

  if (error) {
    throw new Error(`Error cerrando caja: ${error.message}`)
  }

  if (!data || data.length === 0) {
    throw new Error('No se recibió respuesta del servidor')
  }

  const result = data[0]
  return {
    sessionId: result.out_session_id,
    closed: result.out_closed,
    expectedCash: Number(result.out_expected_cash),
    difference: Number(result.out_difference),
    message: result.out_message,
    discrepancyId: result.out_discrepancy_id,
  }
}

export async function updateCashBase(
  sessionId: string,
  cashBase: number,
  notesOpen: string,
): Promise<void> {
  const { error } = await supabase
    .from('cash_register_sessions')
    .update({
      cash_base: cashBase,
      notes_open: notesOpen || null,
    })
    .eq('id', sessionId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function getLastSession(storeId: string): Promise<CashRegisterSession | null> {
  const today = getTodayIsoDateColombia()

  const { data, error } = await supabase
    .from('cash_register_sessions')
    .select('*')
    .eq('store_id', storeId)
    .lt('session_date', today)
    .order('session_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data as CashRegisterSession | null
}

/**
 * Devuelve la sesion actualmente abierta (status='open') de la tienda,
 * sin importar la fecha. Permite que una sesion permanezca abierta varios dias.
 */
export async function getActiveSession(storeId: string): Promise<CashRegisterSession | null> {
  const { data, error } = await supabase
    .from('cash_register_sessions')
    .select('*')
    .eq('store_id', storeId)
    .eq('status', 'open')
    .order('session_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data as CashRegisterSession | null
}

/**
 * Devuelve la sesion mas reciente (abierta o cerrada) de la tienda.
 * Util para mostrar la vista de cierre despues de cerrar una sesion multi-dia.
 */
export async function getMostRecentSession(storeId: string): Promise<CashRegisterSession | null> {
  const { data, error } = await supabase
    .from('cash_register_sessions')
    .select('*')
    .eq('store_id', storeId)
    .order('session_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data as CashRegisterSession | null
}

export async function getDaySalesSummary(
  storeId: string,
  fromDateIso: string,
  toDateIso?: string,
  /**
   * Rango exacto (timestamps ISO) para acotar ventas/facturas/separados a la
   * ventana real de la sesion (desde que se abrio hasta que se cerro o ahora).
   * Los gastos siguen acotados por dia calendario (expense_date no tiene hora).
   * Si no se provee, se usa el dia completo de fromDateIso..toDateIso (comportamiento previo).
   */
  preciseRange?: { fromIso: string; toIso: string },
): Promise<DaySalesSummary> {
  const endDate = toDateIso ?? fromDateIso
  // Ventas/facturas/separados usan el rango exacto de la sesion cuando se provee;
  // los gastos siempre usan el dia calendario porque expense_date no tiene hora.
  const startIso = preciseRange?.fromIso ?? toUtcIsoStartOfColombiaDay(fromDateIso)
  const endIso = preciseRange?.toIso ?? toUtcIsoEndOfColombiaDay(endDate)

  const [salesResult, invoicesResult, expensesResult, layawayPaymentsResult] = await Promise.all([
    supabase
      .from('sales')
      .select('grand_total, sale_payments(method, amount)')
      .eq('store_id', storeId)
      .eq('status', 'confirmed')
      .gte('sold_at', startIso)
      .lte('sold_at', endIso),

    supabase
      .from('manual_invoices')
      .select('grand_total, payment_method, payment_reference')
      .eq('store_id', storeId)
      .eq('source', 'provisional')
      .eq('is_active', true)
      .gte('created_at', startIso)
      .lte('created_at', endIso),

    supabase
      .from('manual_invoice_expenses')
      .select('amount')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .gte('expense_date', fromDateIso)
      .lte('expense_date', endDate),

    supabase
      .from('layaway_payments')
      .select('amount, payment_method, layaways!inner(store_id)')
      .eq('layaways.store_id', storeId)
      .gte('created_at', startIso)
      .lte('created_at', endIso),
  ])

  if (salesResult.error) throw new Error(salesResult.error.message)
  if (invoicesResult.error) throw new Error(invoicesResult.error.message)
  if (expensesResult.error) throw new Error(expensesResult.error.message)
  if (layawayPaymentsResult.error) throw new Error(layawayPaymentsResult.error.message)

  const posByMethod: Record<string, number> = {}
  let posTotal = 0

  for (const sale of salesResult.data ?? []) {
    posTotal += Number(sale.grand_total ?? 0)
    const payments = sale.sale_payments as Array<{ method: string; amount: number }> | null
    for (const p of payments ?? []) {
      if (!p.method) continue
      const amount = Number(p.amount ?? 0)
      posByMethod[p.method] = (posByMethod[p.method] ?? 0) + amount
    }
  }

  const posCash = posByMethod['cash'] ?? 0
  const posCard = posByMethod['card'] ?? 0
  const posTransfer = posByMethod['transfer'] ?? 0

  let invoiceCash = 0
  let invoiceTotal = 0
  const invoiceByMethod: Record<string, number> = {}

  for (const inv of invoicesResult.data ?? []) {
    const amount = Number(inv.grand_total ?? 0)
    invoiceTotal += amount
    if (inv.payment_method === 'cash') {
      invoiceCash += amount
    } else if (inv.payment_method === 'mixed' && inv.payment_reference) {
      // payment_reference format: "method1:amount1:method2:amount2"
      const parts = (inv.payment_reference as string).split(':')
      if (parts.length >= 4) {
        const m1 = parts[0]
        const a1 = Number(parts[1]) || 0
        const m2 = parts[2]
        const a2 = Number(parts[3]) || 0
        if (m1 === 'cash') invoiceCash += a1
        else if (m1) invoiceByMethod[m1] = (invoiceByMethod[m1] ?? 0) + a1
        if (m2 === 'cash') invoiceCash += a2
        else if (m2) invoiceByMethod[m2] = (invoiceByMethod[m2] ?? 0) + a2
      }
    } else if (inv.payment_method) {
      invoiceByMethod[inv.payment_method] = (invoiceByMethod[inv.payment_method] ?? 0) + amount
    }
  }

  const expensesTotal = (expensesResult.data ?? []).reduce(
    (sum, e) => sum + Number(e.amount ?? 0),
    0,
  )

  let layawayCash = 0
  let layawayTotal = 0
  const layawayByMethod: Record<string, number> = {}

  for (const p of layawayPaymentsResult.data ?? []) {
    const amount = Number(p.amount ?? 0)
    layawayTotal += amount
    if (p.payment_method === 'cash') {
      layawayCash += amount
    } else if (p.payment_method) {
      layawayByMethod[p.payment_method] = (layawayByMethod[p.payment_method] ?? 0) + amount
    }
  }

  return {
    posCash,
    posCard,
    posTransfer,
    posTotal,
    posByMethod,
    invoiceCash,
    invoiceTotal,
    invoiceByMethod,
    expensesTotal,
    layawayCash,
    layawayTotal,
    layawayByMethod,
  }
}
