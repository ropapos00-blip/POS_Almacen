type PaymentKpiTotals = { day: number; month: number; year: number }

type PaymentMethodKpiKey =
  | 'cash'
  | 'addi'
  | 'credilondon'
  | 'dataphone'
  | 'bancolombia'
  | 'daviplata'
  | 'nequi'
  | 'rapirecarga'

type ManualInvoicePaymentKpis = {
  cash: PaymentKpiTotals
  addi: PaymentKpiTotals
  credilondon: PaymentKpiTotals
  dataphone: PaymentKpiTotals
  bancolombia: PaymentKpiTotals
  daviplata: PaymentKpiTotals
  nequi: PaymentKpiTotals
  rapirecarga: PaymentKpiTotals
  exchangeOverageCollected: PaymentKpiTotals
}

// KPIs agrupados por método de pago para cierre de caja
export async function listManualInvoicePaymentKpis(
  storeId: string,
  filterDate?: string,
): Promise<ManualInvoicePaymentKpis> {
  const todayIso = getTodayIsoDateColombia();
  const selectedIso = filterDate ?? todayIso;
  const yearStartIso = `${selectedIso.slice(0, 4)}-01-01`;
  const { data, error } = await supabase
    .from('manual_invoices')
    .select('grand_total, credit_applied_total, created_at, payment_method, payment_reference')
    .eq('store_id', storeId)
    .eq('source', 'provisional')
    .eq('is_active', true)
    .gte('created_at', toUtcIsoStartOfColombiaDay(yearStartIso))
    .limit(10000);

  if (error) {
    throw new Error(error.message);
  }

  const selectedMonth = selectedIso.slice(0, 7);
  const paymentMethods: PaymentMethodKpiKey[] = [
    'cash',
    'addi',
    'credilondon',
    'dataphone',
    'bancolombia',
    'daviplata',
    'nequi',
    'rapirecarga',
  ];

  // Estructura: { [method]: { day: number, month: number, year: number } }
  const result = {} as Record<PaymentMethodKpiKey, PaymentKpiTotals>
  const exchangeOverageCollected = { day: 0, month: 0, year: 0 };
  for (const method of paymentMethods) {
    result[method] = { day: 0, month: 0, year: 0 };
  }

  function addToResult(method: PaymentMethodKpiKey, amount: number, dateIso: string) {
    result[method].year += amount;
    if (dateIso.slice(0, 7) === selectedMonth) result[method].month += amount;
    if (dateIso === selectedIso) result[method].day += amount;
  }

  (data ?? []).forEach((row) => {
    const createdIsoDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(String(row.created_at)));

    const creditApplied = Math.max(0, Number(row.credit_applied_total ?? 0));
    const amountDue = Math.max(0, Number(row.grand_total ?? 0) - creditApplied);
    if (creditApplied > 0 && amountDue > 0) {
      exchangeOverageCollected.year += amountDue;
      if (createdIsoDate.slice(0, 7) === selectedMonth) exchangeOverageCollected.month += amountDue;
      if (createdIsoDate === selectedIso) exchangeOverageCollected.day += amountDue;
    }

    const method = row.payment_method as string;

    if (method === 'mixed') {
      // payment_reference format: "method1:amount1:method2:amount2"
      const ref = row.payment_reference as string | null;
      if (!ref) return;
      const parts = ref.split(':');
      if (parts.length >= 4) {
        const m1 = parts[0];
        const a1 = Math.max(0, Number(parts[1]) || 0);
        const m2 = parts[2];
        const a2 = Math.max(0, Number(parts[3]) || 0);
        if (paymentMethods.includes(m1 as PaymentMethodKpiKey)) {
          addToResult(m1 as PaymentMethodKpiKey, a1, createdIsoDate);
        }
        if (paymentMethods.includes(m2 as PaymentMethodKpiKey)) {
          addToResult(m2 as PaymentMethodKpiKey, a2, createdIsoDate);
        }
      }
      return;
    }

    const amount = Math.max(0, Number(row.grand_total ?? 0) - Number(row.credit_applied_total ?? 0));
    if (paymentMethods.includes(method as PaymentMethodKpiKey)) {
      addToResult(method as PaymentMethodKpiKey, amount, createdIsoDate);
    }
  });

  return {
    ...result,
    exchangeOverageCollected,
  };
}
import { supabase } from '../../../integrations/supabase/client/supabaseClient'
import { getTodayIsoDateColombia, toUtcIsoStartOfColombiaDay } from '../../../shared/utils/dateTime'
import type {
  DeleteManualExpenseInput,
  CreateManualExpenseInput,
  CreateManualInvoiceInput,
  CreateManualInvoiceExchangeInput,
  CreateManualInvoiceReturnInput,
  ManualExpenseKpis,
  ManualExpenseRow,
  ManualInvoiceKpis,
  ManualInvoiceRow,
  UpdateManualExpenseInput,
  UpdateManualInvoiceHeaderInput,
  VoidManualInvoiceInput,
} from '../model/manualInvoices.types'

function getRpcErrorMessage(error: { code?: string; message: string; details?: string | null; hint?: string | null }) {
  const parts = [error.message]
  if (error.code) {
    parts.unshift(`[${error.code}]`)
  }
  if (error.details) {
    parts.push(error.details)
  }
  if (error.hint) {
    parts.push(`Sugerencia: ${error.hint}`)
  }
  return parts.join(' ')
}

export async function listManualInvoices(storeId: string) {
  const { data, error } = await supabase
    .from('manual_invoices')
    .select(
      'id, invoice_number, customer_name, customer_phone, subtotal, discount_total, credit_applied_total, grand_total, payment_method, payment_reference, created_at, manual_invoice_items(id, description, quantity, unit_price, line_total)',
    )
    .eq('store_id', storeId)
    .eq('source', 'provisional')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    throw new Error(error.message)
  }

  const invoices = (data ?? []) as ManualInvoiceRow[]

  const phones = Array.from(
    new Set(
      invoices
        .map((invoice) => invoice.customer_phone?.trim())
        .filter((phone): phone is string => Boolean(phone)),
    ),
  )

  const creditBalanceByPhone = new Map<string, number>()
  if (phones.length > 0) {
    const { data: creditsData } = await supabase
      .from('manual_invoice_customer_credits')
      .select('customer_phone, balance')
      .eq('store_id', storeId)
      .in('customer_phone', phones)

    for (const row of creditsData ?? []) {
      creditBalanceByPhone.set(String(row.customer_phone), Math.max(0, Number(row.balance ?? 0)))
    }
  }

  const { data: exchangesData, error: exchangesError } = await supabase
    .from('manual_invoice_exchanges')
    .select('source_invoice_id, new_invoice_id, created_at')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(500)

  if (exchangesError || !exchangesData?.length) {
    return invoices.map((invoice) => ({
      ...invoice,
      customer_credit_balance: invoice.customer_phone
        ? creditBalanceByPhone.get(invoice.customer_phone) ?? 0
        : 0,
    }))
  }

  const sourceReplacementPairs = exchangesData.map((row) => ({
    sourceId: String(row.source_invoice_id),
    replacementId: String(row.new_invoice_id),
  }))

  const replacementIds = Array.from(new Set(sourceReplacementPairs.map((pair) => pair.replacementId)))
  const replacementMetaById = new Map<string, { invoiceNumber: string; isActive: boolean }>()

  if (replacementIds.length > 0) {
    const { data: replacementInvoicesData } = await supabase
      .from('manual_invoices')
      .select('id, invoice_number, is_active')
      .in('id', replacementIds)

    for (const row of replacementInvoicesData ?? []) {
      replacementMetaById.set(String(row.id), {
        invoiceNumber: String(row.invoice_number),
        isActive: Boolean(row.is_active),
      })
    }
  }

  const latestActiveReplacementBySource = new Map<string, string>()
  const sourceByActiveReplacement = new Map<string, string>()

  for (const pair of sourceReplacementPairs) {
    const replacementMeta = replacementMetaById.get(pair.replacementId)
    if (!replacementMeta?.isActive) {
      continue
    }

    if (!latestActiveReplacementBySource.has(pair.sourceId)) {
      latestActiveReplacementBySource.set(pair.sourceId, pair.replacementId)
    }

    if (!sourceByActiveReplacement.has(pair.replacementId)) {
      sourceByActiveReplacement.set(pair.replacementId, pair.sourceId)
    }
  }

  const invoiceNumberById = new Map<string, string>()
  for (const invoice of invoices) {
    invoiceNumberById.set(invoice.id, invoice.invoice_number)
  }

  const relatedIdsToResolve = new Set<string>()
  for (const replacementId of latestActiveReplacementBySource.values()) {
    if (!invoiceNumberById.has(replacementId)) {
      relatedIdsToResolve.add(replacementId)
    }
  }
  for (const sourceId of sourceByActiveReplacement.values()) {
    if (!invoiceNumberById.has(sourceId)) {
      relatedIdsToResolve.add(sourceId)
    }
  }

  if (relatedIdsToResolve.size > 0) {
    const { data: relatedInvoicesData } = await supabase
      .from('manual_invoices')
      .select('id, invoice_number')
      .in('id', Array.from(relatedIdsToResolve))

    for (const row of relatedInvoicesData ?? []) {
      invoiceNumberById.set(String(row.id), String(row.invoice_number))
    }
  }

  return invoices.map((invoice) => {
    const replacementId = latestActiveReplacementBySource.get(invoice.id)
    if (replacementId) {
      return {
        ...invoice,
        customer_credit_balance: invoice.customer_phone
          ? creditBalanceByPhone.get(invoice.customer_phone) ?? 0
          : 0,
        exchange_role: 'changed_original' as const,
        linked_exchange_invoice_id: replacementId,
        linked_exchange_invoice_number: invoiceNumberById.get(replacementId) ?? replacementId,
      }
    }

    const sourceId = sourceByActiveReplacement.get(invoice.id)
    if (sourceId) {
      return {
        ...invoice,
        customer_credit_balance: invoice.customer_phone
          ? creditBalanceByPhone.get(invoice.customer_phone) ?? 0
          : 0,
        exchange_role: 'replacement' as const,
        linked_exchange_invoice_id: sourceId,
        linked_exchange_invoice_number: invoiceNumberById.get(sourceId) ?? sourceId,
      }
    }

    return {
      ...invoice,
      customer_credit_balance: invoice.customer_phone
        ? creditBalanceByPhone.get(invoice.customer_phone) ?? 0
        : 0,
    }
  })
}

export async function getManualInvoiceById(storeId: string, invoiceId: string) {
  const { data, error } = await supabase
    .from('manual_invoices')
    .select(
      'id, invoice_number, customer_name, customer_phone, subtotal, discount_total, credit_applied_total, grand_total, payment_method, payment_reference, created_at, manual_invoice_items(id, description, quantity, unit_price, line_total)',
    )
    .eq('store_id', storeId)
    .eq('id', invoiceId)
    .eq('source', 'provisional')
    .eq('is_active', true)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as ManualInvoiceRow
}

export async function listManualInvoiceKpis(storeId: string): Promise<ManualInvoiceKpis> {
  const todayIso = getTodayIsoDateColombia()
  const yearStartIso = `${todayIso.slice(0, 4)}-01-01`

  const { data, error } = await supabase
    .from('manual_invoices')
    .select('grand_total, created_at')
    .eq('store_id', storeId)
    .eq('source', 'provisional')
    .eq('is_active', true)
    .gte('created_at', toUtcIsoStartOfColombiaDay(yearStartIso))
    .limit(10000)

  if (error) {
    throw new Error(error.message)
  }

  const todayMonth = todayIso.slice(0, 7)

  return (data ?? []).reduce<ManualInvoiceKpis>(
    (acc, row) => {
      const createdIsoDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(String(row.created_at)))

      const amount = Math.max(0, Number(row.grand_total ?? 0))

      acc.yearTotal += amount
      acc.yearCount += 1

      if (createdIsoDate.slice(0, 7) === todayMonth) {
        acc.monthTotal += amount
        acc.monthCount += 1
      }

      if (createdIsoDate === todayIso) {
        acc.dayTotal += amount
        acc.dayCount += 1
      }

      return acc
    },
    {
      dayTotal: 0,
      monthTotal: 0,
      yearTotal: 0,
      dayCount: 0,
      monthCount: 0,
      yearCount: 0,
    },
  )
}

export async function listManualExpenses(storeId: string) {
  const { data, error } = await supabase
    .from('manual_invoice_expenses')
    .select('id, store_id, amount, expense_date, category, notes, created_by, created_at')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(400)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as ManualExpenseRow[]
}

export async function listManualExpenseKpis(storeId: string): Promise<ManualExpenseKpis> {
  const todayIso = getTodayIsoDateColombia()
  const yearStartIso = `${todayIso.slice(0, 4)}-01-01`

  const { data, error } = await supabase
    .from('manual_invoice_expenses')
    .select('amount, expense_date')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .gte('expense_date', yearStartIso)
    .limit(10000)

  if (error) {
    throw new Error(error.message)
  }

  const todayMonth = todayIso.slice(0, 7)

  return (data ?? []).reduce<ManualExpenseKpis>(
    (acc, row) => {
      const expenseDate = String(row.expense_date ?? '')
      const amount = Math.max(0, Number(row.amount ?? 0))

      acc.yearTotal += amount
      acc.yearCount += 1

      if (expenseDate.slice(0, 7) === todayMonth) {
        acc.monthTotal += amount
        acc.monthCount += 1
      }

      if (expenseDate === todayIso) {
        acc.dayTotal += amount
        acc.dayCount += 1
      }

      return acc
    },
    {
      dayTotal: 0,
      monthTotal: 0,
      yearTotal: 0,
      dayCount: 0,
      monthCount: 0,
      yearCount: 0,
    },
  )
}

export async function createManualExpense(input: CreateManualExpenseInput) {
  const { data, error } = await supabase
    .from('manual_invoice_expenses')
    .insert({
      store_id: input.storeId,
      amount: input.amount,
      expense_date: input.expenseDate,
      category: input.category.trim() || null,
      notes: input.notes.trim() || null,
      created_by: input.actorUserId,
      is_active: true,
    })
    .select('id')
    .single()

  if (error) {
    if (error.message.toLowerCase().includes('manual_invoice_expenses')) {
      throw new Error(
        'No existe la tabla manual_invoice_expenses en Supabase. Ejecuta el script 20_manual_invoice_expenses.sql y reintenta.',
      )
    }

    throw new Error(error.message)
  }

  if (!data?.id) {
    throw new Error('No se pudo registrar el gasto provisional.')
  }

  return {
    expenseId: String(data.id),
  }
}

export async function updateManualExpense(input: UpdateManualExpenseInput) {
  const { data, error } = await supabase
    .from('manual_invoice_expenses')
    .update({
      amount: input.amount,
      expense_date: input.expenseDate,
      category: input.category.trim() || null,
      notes: input.notes.trim() || null,
    })
    .eq('id', input.expenseId)
    .eq('store_id', input.storeId)
    .eq('is_active', true)
    .select('id')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  if (!data?.id) {
    throw new Error('No se pudo editar el gasto provisional.')
  }

  return {
    expenseId: String(data.id),
  }
}

export async function deleteManualExpense(input: DeleteManualExpenseInput) {
  const { data, error } = await supabase
    .from('manual_invoice_expenses')
    .update({
      is_active: false,
    })
    .eq('id', input.expenseId)
    .eq('store_id', input.storeId)
    .eq('is_active', true)
    .select('id')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  if (!data?.id) {
    throw new Error('No se pudo eliminar el gasto provisional.')
  }

  return {
    expenseId: String(data.id),
  }
}

export async function createManualInvoice(input: CreateManualInvoiceInput) {
  const { data, error } = await supabase.rpc('create_manual_invoice_transaction', {
    p_store_id: input.storeId,
    p_created_by: input.createdBy,
    p_customer_name: input.customerName.trim() || null,
    p_customer_phone: input.customerPhone.trim() || null,
    p_discount_total: input.discountTotal,
    p_apply_credit: Math.max(0, Number(input.applyCreditAmount ?? 0)),
    p_payment_method: input.paymentMethod,
    p_payment_reference: input.paymentReference.trim() || null,
    p_items: input.items.map((item) => ({
      description: item.description.trim(),
      quantity: item.quantity,
      unit_price: item.unitPrice,
      ...(item.variantId ? { variant_id: item.variantId } : {}),
    })),
  })

  if (error) {
    if (
      error.code === 'PGRST202' ||
      error.message.toLowerCase().includes('create_manual_invoice_transaction')
    ) {
      throw new Error(
        'No existe la funcion RPC create_manual_invoice_transaction en Supabase. Ejecuta el script 43_manual_invoice_returns_and_store_credit.sql y reintenta.',
      )
    }

    throw new Error(error.message)
  }

  const first = Array.isArray(data) ? data[0] : null

  if (!first?.invoice_id) {
    throw new Error('No se pudo crear la factura manual.')
  }

  return {
    invoiceId: first.invoice_id as string,
    invoiceNumber: first.invoice_number as string,
  }
}

export async function getManualCustomerCreditBalance(storeId: string, customerPhone: string) {
  const phone = customerPhone.trim()
  if (!phone) {
    return 0
  }

  const { data, error } = await supabase.rpc('get_manual_invoice_customer_credit_balance', {
    p_store_id: storeId,
    p_customer_phone: phone,
  })

  if (error) {
    if (
      error.code === 'PGRST202' ||
      error.message.toLowerCase().includes('get_manual_invoice_customer_credit_balance')
    ) {
      throw new Error(
        'No existe la funcion RPC get_manual_invoice_customer_credit_balance en Supabase. Ejecuta el script 43_manual_invoice_returns_and_store_credit.sql y reintenta.',
      )
    }

    throw new Error(error.message)
  }

  const first = Array.isArray(data) ? data[0] : null
  return Math.max(0, Number(first?.balance ?? 0))
}

export async function createManualInvoiceReturn(input: CreateManualInvoiceReturnInput) {
  const { data, error } = await supabase.rpc('create_manual_invoice_return_transaction', {
    p_invoice_id: input.invoiceId,
    p_actor_user_id: input.actorUserId,
    p_reason: input.reason?.trim() || null,
    p_return_items: input.items.map((item) => ({
      manual_invoice_item_id: item.manualInvoiceItemId,
      quantity: item.quantity,
    })),
  })

  if (error) {
    if (
      error.code === 'PGRST202' ||
      error.message.toLowerCase().includes('create_manual_invoice_return_transaction')
    ) {
      throw new Error(
        'No existe la funcion RPC create_manual_invoice_return_transaction en Supabase. Ejecuta el script 43_manual_invoice_returns_and_store_credit.sql y reintenta.',
      )
    }

    throw new Error(getRpcErrorMessage(error))
  }

  const first = Array.isArray(data) ? data[0] : null

  if (!first?.return_id) {
    throw new Error('No se pudo registrar la devolucion manual.')
  }

  return {
    returnId: first.return_id as string,
    returnNumber: first.return_number as string,
    creditAmount: Number(first.credit_amount ?? 0),
    customerPhone: (first.customer_phone ?? first.returned_customer_phone) as string,
  }
}

export async function createManualInvoiceExchange(input: CreateManualInvoiceExchangeInput) {
  const basePayload = {
    p_source_invoice_id: input.sourceInvoiceId,
    p_actor_user_id: input.actorUserId,
    p_reason: input.reason?.trim() || null,
    p_discount_total: Math.max(0, Number(input.discountTotal ?? 0)),
    p_payment_method: input.paymentMethod,
    p_payment_reference: input.paymentReference?.trim() || null,
    p_customer_name: input.customerName?.trim() || null,
    p_customer_phone: input.customerPhone?.trim() || null,
    p_apply_return_credit: input.applyReturnCredit == null ? null : Math.max(0, Number(input.applyReturnCredit)),
    p_return_items: input.returnItems.map((item) => ({
      manual_invoice_item_id: item.manualInvoiceItemId,
      quantity: item.quantity,
    })),
    p_new_items: input.newItems.map((item) => ({
      description: item.description.trim(),
      quantity: item.quantity,
      unit_price: item.unitPrice,
      ...(item.variantId ? { variant_id: item.variantId } : {}),
    })),
  }

  const { data, error } = await supabase.rpc('create_manual_invoice_exchange_transaction', basePayload)

  // Compatibilidad: algunos entornos pueden tener una version antigua del RPC sin p_apply_return_credit.
  const shouldRetryWithoutApplyCredit =
    !!error &&
    error.code === 'PGRST202' &&
    error.message.toLowerCase().includes('p_apply_return_credit')

  let finalData = data
  let finalError = error

  if (shouldRetryWithoutApplyCredit) {
    const { p_apply_return_credit: _omitApplyCredit, ...legacyPayload } = basePayload
    const retry = await supabase.rpc('create_manual_invoice_exchange_transaction', legacyPayload)
    finalData = retry.data
    finalError = retry.error
  }

  if (finalError) {
    if (finalError.code === '42702' && finalError.message.toLowerCase().includes('customer_phone')) {
      throw new Error(
        '[42702] La base tiene una version antigua/inconsistente del RPC de cambios. Ejecuta en Supabase (en este orden): 43_manual_invoice_returns_and_store_credit.sql y luego 44_manual_invoice_exchange_transaction.sql. Después recarga la app.',
      )
    }

    if (
      finalError.code === 'PGRST202' ||
      finalError.message.toLowerCase().includes('create_manual_invoice_exchange_transaction')
    ) {
      throw new Error(
        'No existe la funcion RPC create_manual_invoice_exchange_transaction en Supabase. Ejecuta el script 44_manual_invoice_exchange_transaction.sql y reintenta.',
      )
    }

    throw new Error(getRpcErrorMessage(finalError))
  }

  const first = Array.isArray(finalData) ? finalData[0] : null

  if (!first?.exchange_id) {
    throw new Error('No se pudo registrar el cambio de factura.')
  }

  return {
    exchangeId: first.exchange_id as string,
    returnId: first.return_id as string,
    returnNumber: first.return_number as string,
    newInvoiceId: first.new_invoice_id as string,
    newInvoiceNumber: first.new_invoice_number as string,
    creditGenerated: Number(first.credit_generated ?? 0),
    creditApplied: Number(first.credit_applied ?? 0),
    additionalPayment: Number(first.additional_payment ?? 0),
    remainingCredit: Number(first.remaining_credit ?? 0),
  }
}

export async function updateManualInvoiceHeader(input: UpdateManualInvoiceHeaderInput) {
  const { data, error } = await supabase.rpc('update_manual_invoice_header', {
    p_invoice_id: input.invoiceId,
    p_actor_user_id: input.actorUserId,
    p_customer_name: input.customerName.trim() || null,
    p_customer_phone: input.customerPhone.trim() || null,
    p_payment_method: input.paymentMethod,
    p_payment_reference: input.paymentReference.trim() || null,
  })

  if (error) {
    if (error.code === 'PGRST202' || error.message.toLowerCase().includes('update_manual_invoice_header')) {
      throw new Error(
        'No existe la funcion RPC update_manual_invoice_header en Supabase. Ejecuta el script 13_manual_invoice_admin_actions.sql y reintenta.',
      )
    }

    throw new Error(error.message)
  }

  const first = Array.isArray(data) ? data[0] : null

  if (!first?.invoice_id) {
    throw new Error('No se pudo editar la factura manual.')
  }

  return {
    invoiceId: first.invoice_id as string,
    invoiceNumber: first.invoice_number as string,
  }
}

export async function voidManualInvoice(input: VoidManualInvoiceInput) {
  const { data, error } = await supabase.rpc('void_manual_invoice_transaction', {
    p_invoice_id: input.invoiceId,
    p_actor_user_id: input.actorUserId,
    p_reason: input.reason?.trim() || null,
  })

  if (error) {
    if (
      error.code === 'PGRST202' ||
      error.message.toLowerCase().includes('void_manual_invoice_transaction')
    ) {
      throw new Error(
        'No existe la funcion RPC void_manual_invoice_transaction en Supabase. Ejecuta el script 13_manual_invoice_admin_actions.sql y reintenta.',
      )
    }

    throw new Error(error.message)
  }

  const first = Array.isArray(data) ? data[0] : null

  if (!first?.invoice_id) {
    throw new Error('No se pudo eliminar la factura manual.')
  }

  return {
    invoiceId: first.invoice_id as string,
    invoiceNumber: first.invoice_number as string,
  }
}
