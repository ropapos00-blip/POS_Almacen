import { supabase } from '../../../integrations/supabase/client/supabaseClient'
import type {
  CreateWholesaleInvoiceInput,
  RegisterWholesalePaymentInput,
  WholesaleInvoiceRow,
} from '../model/wholesale.types'

export async function listWholesaleInvoices(storeId: string) {
  await supabase.rpc('sync_wholesale_overdue_by_store', {
    p_store_id: storeId,
  })

  const { data, error } = await supabase
    .from('wholesale_invoices')
    .select(
      'id, invoice_number, customer_name, customer_phone, issued_at, due_date, subtotal, discount_total, grand_total, paid_total, balance_due, is_credit, status, payment_method, payment_reference, notes, wholesale_invoice_items(id, description, quantity, unit_price, line_total), wholesale_payments(id, paid_at, amount, payment_method, payment_reference, notes)',
    )
    .eq('store_id', storeId)
    .order('issued_at', { ascending: false })
    .limit(200)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as WholesaleInvoiceRow[]
}

export async function createWholesaleInvoice(input: CreateWholesaleInvoiceInput) {
  const { data, error } = await supabase.rpc('create_wholesale_invoice_transaction', {
    p_store_id: input.storeId,
    p_created_by: input.createdBy,
    p_customer_name: input.customerName.trim() || null,
    p_customer_phone: input.customerPhone.trim() || null,
    p_discount_total: input.discountTotal,
    p_is_credit: input.isCredit,
    p_due_date: input.isCredit && input.dueDate ? input.dueDate : null,
    p_payment_method: input.isCredit ? 'credit' : input.paymentMethod,
    p_payment_reference: input.paymentReference.trim() || null,
    p_notes: input.notes.trim() || null,
    p_items: input.items.map((item) => ({
      description: item.description.trim(),
      quantity: item.quantity,
      unit_price: item.unitPrice,
    })),
  })

  if (error) {
    if (
      error.code === 'PGRST202' ||
      error.message.toLowerCase().includes('create_wholesale_invoice_transaction')
    ) {
      throw new Error(
        'No existe la funcion RPC create_wholesale_invoice_transaction en Supabase. Ejecuta el script 11_wholesale_subpos.sql y reintenta.',
      )
    }

    throw new Error(error.message)
  }

  const first = Array.isArray(data) ? data[0] : null

  if (!first?.invoice_id) {
    throw new Error('No se pudo crear la factura de confeccion.')
  }

  return {
    invoiceId: first.invoice_id as string,
    invoiceNumber: first.invoice_number as string,
  }
}

export async function registerWholesalePayment(input: RegisterWholesalePaymentInput) {
  const { data, error } = await supabase.rpc('register_wholesale_payment', {
    p_invoice_id: input.invoiceId,
    p_actor_user_id: input.actorUserId,
    p_amount: input.amount,
    p_payment_method: input.paymentMethod,
    p_payment_reference: input.paymentReference.trim() || null,
    p_notes: input.notes.trim() || null,
  })

  if (error) {
    if (error.code === 'PGRST202' || error.message.toLowerCase().includes('register_wholesale_payment')) {
      throw new Error(
        'No existe la funcion RPC register_wholesale_payment en Supabase. Ejecuta el script 11_wholesale_subpos.sql y reintenta.',
      )
    }

    throw new Error(error.message)
  }

  const first = Array.isArray(data) ? data[0] : null

  if (!first?.invoice_id) {
    throw new Error('No se pudo registrar el abono de confeccion.')
  }

  return {
    invoiceId: first.invoice_id as string,
    paidTotal: Number(first.paid_total ?? 0),
    balanceDue: Number(first.balance_due ?? 0),
    status: String(first.status ?? 'issued'),
  }
}