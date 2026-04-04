import { supabase } from '../../../integrations/supabase/client/supabaseClient'
import type {
  DashboardKpis,
  DashboardSellerMetric,
  DashboardTopProduct,
} from '../model/dashboard.types'

function startOfTodayIso() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return start.toISOString()
}

function startOfMonthIso() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  return start.toISOString()
}

function daysAgoIso(days: number) {
  const now = new Date()
  now.setDate(now.getDate() - days)
  return now.toISOString()
}

export async function getDashboardKpis(storeId: string): Promise<DashboardKpis> {
  const [
    salesTodayRes,
    salesMonthRes,
    avgTicketRes,
    saleItemsRes,
    outOfStockRes,
    stockRowsRes,
    sellersRes,
  ] = await Promise.all([
    supabase
      .from('sales')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .eq('status', 'confirmed')
      .gte('sold_at', startOfTodayIso()),
    supabase
      .from('sales')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .eq('status', 'confirmed')
      .gte('sold_at', startOfMonthIso()),
    supabase
      .from('sales')
      .select('grand_total')
      .eq('store_id', storeId)
      .eq('status', 'confirmed')
      .gte('sold_at', startOfMonthIso()),
    supabase
      .from('sale_items')
      .select('name_snapshot, quantity, line_total, sale_id, sales!inner(store_id, status, sold_by, sold_at)')
      .eq('sales.store_id', storeId)
      .eq('sales.status', 'confirmed')
      .gte('sales.sold_at', startOfMonthIso()),
    supabase
      .from('inventory_stock')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .lte('quantity_on_hand', 0),
    supabase
      .from('inventory_stock')
      .select('variant_id, quantity_on_hand')
      .eq('store_id', storeId)
      .gt('quantity_on_hand', 0),
    supabase
      .from('sales')
      .select('sold_by, grand_total')
      .eq('store_id', storeId)
      .eq('status', 'confirmed')
      .gte('sold_at', startOfMonthIso()),
  ])

  if (salesTodayRes.error) throw new Error(salesTodayRes.error.message)
  if (salesMonthRes.error) throw new Error(salesMonthRes.error.message)
  if (avgTicketRes.error) throw new Error(avgTicketRes.error.message)
  if (saleItemsRes.error) throw new Error(saleItemsRes.error.message)
  if (outOfStockRes.error) throw new Error(outOfStockRes.error.message)
  if (stockRowsRes.error) throw new Error(stockRowsRes.error.message)
  if (sellersRes.error) throw new Error(sellersRes.error.message)

  const ticketRows = avgTicketRes.data ?? []
  const avgTicket =
    ticketRows.length === 0
      ? 0
      : ticketRows.reduce((acc, row) => acc + Number(row.grand_total), 0) / ticketRows.length

  const itemRows = (saleItemsRes.data ?? []) as Array<{
    name_snapshot: string
    quantity: number
    line_total: number
    variant_id?: string
    sales?: { sold_by: string; sold_at: string }[]
  }>

  const topMap = new Map<string, { quantity: number; revenue: number }>()
  itemRows.forEach((row) => {
    const current = topMap.get(row.name_snapshot) ?? { quantity: 0, revenue: 0 }
    current.quantity += Number(row.quantity)
    current.revenue += Number(row.line_total)
    topMap.set(row.name_snapshot, current)
  })

  const topProducts: DashboardTopProduct[] = Array.from(topMap.entries())
    .map(([name, value]) => ({ name, quantity: value.quantity, revenue: value.revenue }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5)

  const soldRecentlyRes = await supabase
    .from('inventory_movements')
    .select('variant_id')
    .eq('store_id', storeId)
    .eq('type', 'sale')
    .gte('created_at', daysAgoIso(30))

  if (soldRecentlyRes.error) throw new Error(soldRecentlyRes.error.message)

  const soldRecently = new Set((soldRecentlyRes.data ?? []).map((row) => row.variant_id as string))
  const lowRotationCount = (stockRowsRes.data ?? []).filter(
    (row) => !soldRecently.has(row.variant_id as string),
  ).length

  const sellerRows = (sellersRes.data ?? []) as Array<{ sold_by: string; grand_total: number }>
  const sellerMap = new Map<string, { count: number; revenue: number }>()
  sellerRows.forEach((row) => {
    const current = sellerMap.get(row.sold_by) ?? { count: 0, revenue: 0 }
    current.count += 1
    current.revenue += Number(row.grand_total)
    sellerMap.set(row.sold_by, current)
  })

  const sellerIds = Array.from(sellerMap.keys())
  let nameMap = new Map<string, string>()

  if (sellerIds.length > 0) {
    const profilesRes = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', sellerIds)

    if (profilesRes.error) throw new Error(profilesRes.error.message)

    nameMap = new Map((profilesRes.data ?? []).map((p) => [p.id as string, p.full_name as string]))
  }

  const salesBySeller: DashboardSellerMetric[] = Array.from(sellerMap.entries())
    .map(([sellerId, value]) => ({
      sellerId,
      sellerName: nameMap.get(sellerId) ?? 'Vendedor',
      totalSales: value.count,
      revenue: value.revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  return {
    salesToday: salesTodayRes.count ?? 0,
    salesMonth: salesMonthRes.count ?? 0,
    averageTicket: avgTicket,
    outOfStockCount: outOfStockRes.count ?? 0,
    lowRotationCount,
    topProducts,
    salesBySeller,
  }
}
