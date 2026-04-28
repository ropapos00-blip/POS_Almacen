import { supabase } from '../../../integrations/supabase/client/supabaseClient'
import type {
  CreateWholesaleFinanceMovementInput,
  CreateWholesaleInvoiceInput,
  RegisterWholesalePaymentInput,
  UpdateWholesaleInvoiceInput,
  UpdateWholesaleInvoiceHeaderInput,
  WholesaleFinanceMovementRow,
  WholesaleReferenceOption,
  WholesaleInvoiceRow,
} from '../model/wholesale.types'

export async function listWholesaleReferenceOptions(storeId: string) {
  const { data, error } = await supabase
    .from('wholesale_references')
    .select('id, reference, unit_price, quantity_on_hand, size_quantities, color_quantities, is_active')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(600)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? [])
    .map((row) => {
      if (!row.id || !row.reference) {
        return null
      }

      const normalizedColorQuantities =
        row.color_quantities && typeof row.color_quantities === 'object'
          ? Object.entries(row.color_quantities as Record<string, unknown>).reduce<
              Record<string, Record<string, number>>
            >((colorAcc, [color, sizesRaw]) => {
              const normalizedColor = String(color).trim().toUpperCase()
              if (!normalizedColor || !sizesRaw || typeof sizesRaw !== 'object') {
                return colorAcc
              }

              const sizeMap = Object.entries(sizesRaw as Record<string, unknown>).reduce<
                Record<string, number>
              >((sizeAcc, [size, qty]) => {
                const normalizedSize = String(size).trim().toUpperCase()
                const parsedQty = Number(qty ?? 0)
                if (normalizedSize) {
                  sizeAcc[normalizedSize] = Number.isFinite(parsedQty)
                    ? Math.max(0, Math.trunc(parsedQty))
                    : 0
                }
                return sizeAcc
              }, {})

              colorAcc[normalizedColor] = sizeMap
              return colorAcc
            }, {})
          : {}

      const normalizedSizeQuantities =
        row.size_quantities && typeof row.size_quantities === 'object'
          ? Object.entries(row.size_quantities as Record<string, unknown>).reduce<Record<string, number>>(
              (acc, [size, qty]) => {
                const normalized = String(size).trim().toUpperCase()
                const parsedQty = Number(qty ?? 0)
                if (normalized) {
                  acc[normalized] = Number.isFinite(parsedQty) ? Math.max(0, Math.trunc(parsedQty)) : 0
                }
                return acc
              },
              {},
            )
          : {}

      const availableSizesFromColors = Array.from(
        new Set(
          Object.values(normalizedColorQuantities).flatMap((sizeMap) =>
            Object.keys(sizeMap).map((size) => size.trim().toUpperCase()).filter((size) => size.length > 0),
          ),
        ),
      )

      return {
        variantId: String(row.id),
        reference: String(row.reference),
        productName: String(row.reference),
        unitPrice: Number(row.unit_price ?? 0),
        quantityOnHand: Number(row.quantity_on_hand ?? 0),
        colorQuantities: normalizedColorQuantities,
        sizeQuantities: normalizedSizeQuantities,
        availableSizes:
          availableSizesFromColors.length > 0
            ? availableSizesFromColors
            : Object.keys(normalizedSizeQuantities),
        availableColors: Object.keys(normalizedColorQuantities),
      } satisfies WholesaleReferenceOption
    })
    .filter((row): row is WholesaleReferenceOption => Boolean(row))
}

export async function listWholesaleInvoices(storeId: string) {
  await supabase.rpc('sync_wholesale_overdue_by_store', {
    p_store_id: storeId,
  })

  const { data, error } = await supabase
    .from('wholesale_invoices')
    .select(
      'id, invoice_number, customer_name, customer_phone, issued_at, due_date, subtotal, discount_total, grand_total, paid_total, balance_due, is_credit, status, payment_method, payment_reference, notes, wholesale_invoice_items(id, wholesale_reference_id, variant_id, reference, color, size, description, quantity, unit_price, line_total), wholesale_payments(id, paid_at, amount, payment_method, payment_reference, notes)',
    )
    .eq('store_id', storeId)
    .neq('status', 'void')
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
    p_payment_reference: null,
    p_notes: null,
    p_items: [
      ...input.items.map((item) => ({
        reference_id: item.variantId,
        color: item.color,
        size: item.size,
        quantity: item.quantity,
      })),
      ...(input.manualItems ?? []).map((item) => ({
        description: item.description,
        unit_price: item.unitPrice,
        quantity: item.quantity,
      })),
    ],
  })

  if (error) {
    if (
      error.code === 'PGRST202' ||
      error.message.toLowerCase().includes('create_wholesale_invoice_transaction')
    ) {
      throw new Error(
        'No existe la funcion RPC create_wholesale_invoice_transaction en Supabase. Ejecuta el script 19_wholesale_color_support.sql (actualizado) y reintenta.',
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

export async function updateWholesaleInvoiceHeader(input: UpdateWholesaleInvoiceHeaderInput) {
  const { error } = await supabase
    .from('wholesale_invoices')
    .update({
      customer_name: input.customerName.trim() || null,
      customer_phone: input.customerPhone.trim() || null,
    })
    .eq('id', input.invoiceId)
    .neq('status', 'void')

  if (error) {
    throw new Error(error.message)
  }
}

export async function patchWholesaleInvoiceDates(invoiceId: string, issuedDate: string, dueDate: string) {
  const { error } = await supabase
    .from('wholesale_invoices')
    .update({
      issued_at: `${issuedDate}T00:00:00`,
      due_date: dueDate,
    })
    .eq('id', invoiceId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function updateWholesaleInvoice(input: UpdateWholesaleInvoiceInput) {
  const { data, error } = await supabase.rpc('update_wholesale_invoice_transaction', {
    p_invoice_id: input.invoiceId,
    p_actor_user_id: input.actorUserId,
    p_invoice_number: input.invoiceNumber.trim(),
    p_customer_name: input.customerName.trim() || null,
    p_customer_phone: input.customerPhone.trim() || null,
    p_discount_total: input.discountTotal,
    p_items: [
      ...input.items.map((item) => ({
        reference_id: item.variantId,
        color: item.color,
        size: item.size,
        quantity: item.quantity,
      })),
      ...(input.manualItems ?? []).map((item) => ({
        description: item.description,
        unit_price: item.unitPrice,
        quantity: item.quantity,
      })),
    ],
  })

  if (error) {
    if (
      error.code === 'PGRST202' ||
      error.message.toLowerCase().includes('update_wholesale_invoice_transaction')
    ) {
      throw new Error(
        'No existe la funcion RPC update_wholesale_invoice_transaction en Supabase. Ejecuta el script 19_wholesale_color_support.sql (actualizado) y reintenta.',
      )
    }

    throw new Error(error.message)
  }

  const first = Array.isArray(data) ? data[0] : null
  if (!first?.invoice_id) {
    throw new Error('No se pudo actualizar la factura de confeccion.')
  }

  return {
    invoiceId: first.invoice_id as string,
    invoiceNumber: first.invoice_number as string,
  }
}

export async function voidWholesaleInvoice(invoiceId: string, actorUserId: string) {
  const { data, error } = await supabase.rpc('void_wholesale_invoice_transaction', {
    p_invoice_id: invoiceId,
    p_actor_user_id: actorUserId,
  })

  if (error) {
    if (
      error.code === 'PGRST202' ||
      error.message.toLowerCase().includes('void_wholesale_invoice_transaction')
    ) {
      throw new Error(
        'No existe la funcion RPC void_wholesale_invoice_transaction en Supabase. Ejecuta el script 19_wholesale_color_support.sql (actualizado) y reintenta.',
      )
    }

    const debugParts = [error.code, error.message, error.details, error.hint].filter(Boolean)
    throw new Error(debugParts.join(' | '))
  }

  const first = Array.isArray(data) ? data[0] : null
  if (!first?.invoice_id) {
    throw new Error('No se pudo anular la factura de confeccion.')
  }
}

export async function registerWholesalePayment(input: RegisterWholesalePaymentInput) {
  const { data, error } = await supabase.rpc('register_wholesale_payment', {
    p_invoice_id: input.invoiceId,
    p_actor_user_id: input.actorUserId,
    p_amount: input.amount,
    p_payment_method: input.paymentMethod,
    p_payment_reference: null,
    p_notes: null,
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

export async function listWholesaleFinanceMovements(storeId: string) {
  const { data, error } = await supabase
    .from('wholesale_finance_movements')
    .select('id, store_id, kind, amount, movement_date, category, notes, created_by, created_at')
    .eq('store_id', storeId)
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(400)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as WholesaleFinanceMovementRow[]
}

export async function createWholesaleFinanceMovement(input: CreateWholesaleFinanceMovementInput) {
  const { data, error } = await supabase.rpc('create_wholesale_finance_movement', {
    p_store_id: input.storeId,
    p_actor_user_id: input.actorUserId,
    p_kind: input.kind,
    p_amount: input.amount,
    p_movement_date: input.movementDate,
    p_category: input.category.trim() || null,
    p_notes: input.notes.trim() || null,
  })

  if (error) {
    if (
      error.code === 'PGRST202' ||
      error.message.toLowerCase().includes('create_wholesale_finance_movement')
    ) {
      throw new Error(
        'No existe la funcion RPC create_wholesale_finance_movement en Supabase. Ejecuta el script 14_wholesale_edit_and_finance.sql y reintenta.',
      )
    }

    throw new Error(error.message)
  }

  const first = Array.isArray(data) ? data[0] : null
  if (!first?.movement_id) {
    throw new Error('No se pudo registrar el movimiento financiero de confeccion.')
  }

  return {
    movementId: first.movement_id as string,
  }
}

export async function deleteWholesaleFinanceMovement(
  storeId: string,
  movementId: string,
  kind: 'expense' | 'investment',
) {
  const { error } = await supabase
    .from('wholesale_finance_movements')
    .delete()
    .eq('id', movementId)
    .eq('store_id', storeId)
    .eq('kind', kind)

  if (error) {
    throw new Error(error.message)
  }
}