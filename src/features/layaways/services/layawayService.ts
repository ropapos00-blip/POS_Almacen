import { supabase } from '../../../integrations/supabase/client/supabaseClient'
import {
  getTodayIsoDateColombia,
  toUtcIsoEndOfColombiaDay,
  toUtcIsoStartOfColombiaDay,
} from '../../../shared/utils/dateTime'
import type { AddLayawayPaymentInput, CreateLayawayInput, Layaway, VariantLookup } from '../model/layaway.types'

export interface LayawayKpis {
  dayTotal: number
  monthTotal: number
  yearTotal: number
  dayCount: number
  monthCount: number
  yearCount: number
  activeCount: number
}

export async function listLayaways(storeId: string): Promise<Layaway[]> {
  const { data, error } = await supabase
    .from('layaways')
    .select('*, layaway_items(*), layaway_payments(*)')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Layaway[]
}

export async function findVariantByBarcode(
  storeId: string,
  barcode: string,
): Promise<VariantLookup | null> {
  const { data, error } = await supabase
    .from('product_variants')
    .select('id, sku, barcode, size, color, cost_price, sale_price, suggested_price, products(name), inventory_stock(quantity_on_hand)')
    .eq('store_id', storeId)
    .eq('barcode', barcode.trim())
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as unknown as VariantLookup | null
}

export async function createLayaway(input: CreateLayawayInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_layaway', {
    p_store_id: input.storeId,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone || null,
    p_notes: input.notes || null,
    p_created_by: input.createdBy,
    p_items: input.items.map((item) => ({
      variant_id: item.variantId ?? '',
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      discount_amount: Math.max(0, Number(item.discountAmount ?? 0)),
    })),
  })

  if (error) throw new Error(error.message)
  return data as string
}

export async function addLayawayPayment(input: AddLayawayPaymentInput): Promise<void> {
  const { error } = await supabase.rpc('add_layaway_payment', {
    p_layaway_id: input.layawayId,
    p_amount: input.amount,
    p_payment_method: input.paymentMethod,
    p_notes: input.notes || null,
    p_created_by: input.createdBy,
  })

  if (error) throw new Error(error.message)
}

export async function cancelLayaway(layawayId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_layaway', {
    p_layaway_id: layawayId,
  })

  if (error) throw new Error(error.message)
}

export async function archiveLayaway(layawayId: string): Promise<void> {
  const { error } = await supabase.rpc('archive_layaway', {
    p_layaway_id: layawayId,
  })

  if (error) throw new Error(error.message)
}

export async function updateLayawayCustomer(
  id: string,
  customerName: string,
  customerPhone: string,
): Promise<void> {
  const { error } = await supabase
    .from('layaways')
    .update({ customer_name: customerName, customer_phone: customerPhone || null })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

export async function getLayawayKpis(storeId: string, filterDate?: string): Promise<LayawayKpis> {
  const todayIso = getTodayIsoDateColombia()
  const selectedIso = filterDate ?? todayIso
  const selectedYear = selectedIso.slice(0, 4)
  const selectedMonth = selectedIso.slice(0, 7)
  const yearStartIso = `${selectedYear}-01-01`
  const yearEndIso = `${selectedYear}-12-31`

  const PAGE_SIZE = 1000

  const [firstPaymentsRes, activeRes] = await Promise.all([
    supabase
      .from('layaway_payments')
      .select('amount, created_at, layaways!inner(store_id, status)', { count: 'exact' })
      .eq('layaways.store_id', storeId)
      .neq('layaways.status', 'cancelled')
      .gte('created_at', toUtcIsoStartOfColombiaDay(yearStartIso))
      .lte('created_at', toUtcIsoEndOfColombiaDay(yearEndIso))
      .order('created_at', { ascending: false })
      .range(0, PAGE_SIZE - 1),
    supabase
      .from('layaways')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .eq('status', 'active'),
  ])

  if (firstPaymentsRes.error) throw new Error(firstPaymentsRes.error.message)
  if (activeRes.error) throw new Error(activeRes.error.message)

  const paymentRows = [...(firstPaymentsRes.data ?? [])]
  const totalCount = firstPaymentsRes.count ?? paymentRows.length

  if (totalCount > PAGE_SIZE) {
    const remainingPromises = []
    for (let offset = PAGE_SIZE; offset < totalCount; offset += PAGE_SIZE) {
      remainingPromises.push(
        supabase
          .from('layaway_payments')
          .select('amount, created_at, layaways!inner(store_id, status)')
          .eq('layaways.store_id', storeId)
          .neq('layaways.status', 'cancelled')
          .gte('created_at', toUtcIsoStartOfColombiaDay(yearStartIso))
          .lte('created_at', toUtcIsoEndOfColombiaDay(yearEndIso))
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1),
      )
    }
    const remainingResponses = await Promise.all(remainingPromises)
    for (const res of remainingResponses) {
      if (res.error) throw new Error(res.error.message)
      if (res.data) paymentRows.push(...res.data)
    }
  }

  const kpis: LayawayKpis = {
    dayTotal: 0,
    monthTotal: 0,
    yearTotal: 0,
    dayCount: 0,
    monthCount: 0,
    yearCount: 0,
    activeCount: activeRes.count ?? 0,
  }

  paymentRows.forEach((row) => {
    const createdIsoDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(String(row.created_at)))
    const amount = Math.max(0, Number(row.amount ?? 0))

    if (createdIsoDate.slice(0, 4) === selectedYear) {
      kpis.yearTotal += amount
      kpis.yearCount += 1
    }
    if (createdIsoDate.slice(0, 7) === selectedMonth) {
      kpis.monthTotal += amount
      kpis.monthCount += 1
    }
    if (createdIsoDate === selectedIso) {
      kpis.dayTotal += amount
      kpis.dayCount += 1
    }
  })

  return kpis
}
