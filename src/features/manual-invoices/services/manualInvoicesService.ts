import { supabase } from '../../../integrations/supabase/client/supabaseClient'
import type { CreateManualInvoiceInput, ManualInvoiceRow } from '../model/manualInvoices.types'

export async function listManualInvoices(storeId: string) {
  const { data, error } = await supabase
    .from('manual_invoices')
    .select(
      'id, invoice_number, customer_name, customer_phone, subtotal, discount_total, grand_total, payment_method, payment_reference, created_at, manual_invoice_items(id, description, quantity, unit_price, line_total)',
    )
    .eq('store_id', storeId)
    .eq('source', 'provisional')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as ManualInvoiceRow[]
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
