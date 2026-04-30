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
  const today = getTodayIsoDateColombia()

  const { data, error } = await supabase
    .from('cash_register_sessions')
    .insert({
      store_id: input.storeId,
      session_date: today,
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

export async function getDaySalesSummary(
  storeId: string,
  dateIso: string,
): Promise<DaySalesSummary> {
  const startIso = toUtcIsoStartOfColombiaDay(dateIso)
  const endIso = toUtcIsoEndOfColombiaDay(dateIso)

  const [salesResult, invoicesResult, expensesResult] = await Promise.all([
    supabase
      .from('sales')
      .select('grand_total, sale_payments(method, amount)')
      .eq('store_id', storeId)
      .eq('status', 'confirmed')
      .gte('sold_at', startIso)
      .lte('sold_at', endIso),

    supabase
      .from('manual_invoices')
      .select('grand_total, payment_method')
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
      .eq('expense_date', dateIso),
  ])

  if (salesResult.error) throw new Error(salesResult.error.message)
  if (invoicesResult.error) throw new Error(invoicesResult.error.message)
  if (expensesResult.error) throw new Error(expensesResult.error.message)

  let posCash = 0
  let posCard = 0
  let posTransfer = 0
  let posTotal = 0

  for (const sale of salesResult.data ?? []) {
    posTotal += Number(sale.grand_total ?? 0)
    const payments = sale.sale_payments as Array<{ method: string; amount: number }> | null
    for (const p of payments ?? []) {
      const amount = Number(p.amount ?? 0)
      if (p.method === 'cash') posCash += amount
      else if (p.method === 'card') posCard += amount
      else if (p.method === 'transfer') posTransfer += amount
    }
  }

  let invoiceCash = 0
  let invoiceTotal = 0

  for (const inv of invoicesResult.data ?? []) {
    const amount = Number(inv.grand_total ?? 0)
    invoiceTotal += amount
    if (inv.payment_method === 'cash') invoiceCash += amount
  }

  const expensesTotal = (expensesResult.data ?? []).reduce(
    (sum, e) => sum + Number(e.amount ?? 0),
    0,
  )

  return {
    posCash,
    posCard,
    posTransfer,
    posTotal,
    invoiceCash,
    invoiceTotal,
    expensesTotal,
  }
}
