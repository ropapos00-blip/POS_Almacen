import { supabase } from '../../../integrations/supabase/client/supabaseClient'
import type { SaleRow, SalesFilters } from '../model/sales.types'

function startOfDayIso(date: string) {
  return new Date(`${date}T00:00:00`).toISOString()
}

function endOfDayIso(date: string) {
  return new Date(`${date}T23:59:59`).toISOString()
}

export async function listSales(storeId: string, filters: SalesFilters) {
  const today = new Date().toISOString().slice(0, 10)
  const effectiveFilters =
    filters.viewerRole === 'cashier'
      ? {
          ...filters,
          fromDate: today,
          toDate: today,
        }
      : filters

  let query = supabase
    .from('sales')
    .select(
      'id, sale_number, customer_name, subtotal, discount_total, tax_total, grand_total, status, sold_at, sale_items(id, sku_snapshot, name_snapshot, size_snapshot, color_snapshot, unit_price, quantity, line_total), sale_payments(id, method, amount, reference, paid_at)',
    )
    .eq('store_id', storeId)
    .order('sold_at', { ascending: false })
    .limit(300)

  if (effectiveFilters.status !== 'all') {
    query = query.eq('status', effectiveFilters.status)
  }

  if (effectiveFilters.fromDate) {
    query = query.gte('sold_at', startOfDayIso(effectiveFilters.fromDate))
  }

  if (effectiveFilters.toDate) {
    query = query.lte('sold_at', endOfDayIso(effectiveFilters.toDate))
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  const normalized = (data ?? []) as SaleRow[]
  const text = effectiveFilters.search.trim().toLowerCase()

  if (!text) {
    return normalized
  }

  return normalized.filter((sale) => {
    const customer = sale.customer_name?.toLowerCase() ?? ''
    return sale.sale_number.toLowerCase().includes(text) || customer.includes(text)
  })
}

export async function voidSale(saleId: string, actorUserId: string, reason: string) {
  const { data, error } = await supabase.rpc('void_sale_transaction', {
    p_sale_id: saleId,
    p_actor_user_id: actorUserId,
    p_reason: reason,
  })

  if (error) {
    throw new Error(error.message)
  }

  const first = Array.isArray(data) ? data[0] : null
  return {
    saleId: (first?.sale_id as string) ?? saleId,
    status: (first?.sale_status as string) ?? 'void',
  }
}
