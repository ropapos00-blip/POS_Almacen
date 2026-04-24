// KPIs agrupados por método de pago para cierre de caja
export async function listManualInvoicePaymentKpis(storeId: string) {
  const todayIso = getTodayIsoDateColombia();
  const yearStartIso = `${todayIso.slice(0, 4)}-01-01`;
  const { data, error } = await supabase
    .from('manual_invoices')
    .select('grand_total, created_at, payment_method')
    .eq('store_id', storeId)
    .eq('source', 'provisional')
    .eq('is_active', true)
    .gte('created_at', toUtcIsoStartOfColombiaDay(yearStartIso))
    .limit(10000);

  if (error) {
    throw new Error(error.message);
  }

  const todayMonth = todayIso.slice(0, 7);
  const paymentMethods = [
    'cash',
    'addi',
    'credilondon',
    'dataphone',
    'bancolombia',
    'daviplata',
    'nequi',
  ];

  // Estructura: { [method]: { day: number, month: number, year: number } }
  const result = {} as Record<string, { day: number; month: number; year: number }>;
  for (const method of paymentMethods) {
    result[method] = { day: 0, month: 0, year: 0 };
  }

  (data ?? []).forEach((row) => {
    const createdIsoDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(String(row.created_at)));
    const amount = Math.max(0, Number(row.grand_total ?? 0));
    const method = row.payment_method;
    if (!result[method]) return;
    result[method].year += amount;
    if (createdIsoDate.slice(0, 7) === todayMonth) {
      result[method].month += amount;
    }
    if (createdIsoDate === todayIso) {
      result[method].day += amount;
    }
  });

  return result;
}
import { supabase } from '../../../integrations/supabase/client/supabaseClient'
import { getTodayIsoDateColombia, toUtcIsoStartOfColombiaDay } from '../../../shared/utils/dateTime'
import type {
  DeleteManualExpenseInput,
  CreateManualExpenseInput,
  CreateManualInvoiceInput,
  ManualExpenseKpis,
  ManualExpenseRow,
  ManualInvoiceKpis,
  ManualInvoiceRow,
  UpdateManualExpenseInput,
  UpdateManualInvoiceHeaderInput,
  VoidManualInvoiceInput,
} from '../model/manualInvoices.types'

export async function listManualInvoices(storeId: string) {
  const { data, error } = await supabase
    .from('manual_invoices')
    .select(
      'id, invoice_number, customer_name, customer_phone, subtotal, discount_total, grand_total, payment_method, payment_reference, created_at, manual_invoice_items(id, description, quantity, unit_price, line_total)',
    )
    .eq('store_id', storeId)
    .eq('source', 'provisional')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as ManualInvoiceRow[]
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
        'No existe la funcion RPC create_manual_invoice_transaction en Supabase. Ejecuta el script 10_store_receipt_and_manual_invoice.sql y reintenta.',
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
