import { supabase } from '../../../integrations/supabase/client/supabaseClient'

export interface ConfeccionCustomer {
  id: string
  store_id: string
  full_name: string
  phone: string
  address: string
  document_id: string
  city: string
  created_at: string
  updated_at: string
  is_active: boolean
}

export interface CustomerPurchaseStats {
  key: string
  customerName: string
  customerPhone: string | null
  invoicesCount: number
  totalPurchased: number
  totalPaid: number
  totalPending: number
  averageTicket: number
  lastPurchaseAt: string | null
}

export async function listConfeccionCustomers(
  storeId: string,
  options?: { includeInactive?: boolean; limit?: number },
): Promise<ConfeccionCustomer[]> {
  const includeInactive = options?.includeInactive ?? false
  const limit = options?.limit ?? 200

  let query = supabase
    .from('confeccion_customers')
    .select('*')
    .eq('store_id', storeId)
    .order('full_name', { ascending: true })
    .limit(limit)

  if (!includeInactive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query

  if (error) throw new Error(error.message)
  return data as ConfeccionCustomer[]
}

export async function searchConfeccionCustomers(storeId: string, query: string, limit = 20): Promise<ConfeccionCustomer[]> {
  const { data, error } = await supabase
    .from('confeccion_customers')
    .select('*')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .or(`full_name.ilike.%${query}%,document_id.ilike.%${query}%,phone.ilike.%${query}%`)
    .order('full_name', { ascending: true })
    .limit(limit)

  if (error) throw new Error(error.message)
  return data as ConfeccionCustomer[]
}

export async function getConfeccionCustomerByDocument(storeId: string, documentId: string): Promise<ConfeccionCustomer | null> {
  const { data, error } = await supabase
    .from('confeccion_customers')
    .select('*')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .eq('document_id', documentId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as ConfeccionCustomer | null
}

export async function createConfeccionCustomer(input: Omit<ConfeccionCustomer, 'id' | 'created_at' | 'updated_at' | 'is_active'>): Promise<ConfeccionCustomer> {
  const { data, error } = await supabase
    .from('confeccion_customers')
    .insert([{ ...input }])
    .select('*')
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as ConfeccionCustomer
}

export async function updateConfeccionCustomer(
  customerId: string,
  storeId: string,
  input: Pick<ConfeccionCustomer, 'full_name' | 'phone' | 'address' | 'document_id' | 'city'>,
): Promise<ConfeccionCustomer> {
  const { data, error } = await supabase
    .from('confeccion_customers')
    .update({
      full_name: input.full_name.trim(),
      phone: input.phone.trim(),
      address: input.address.trim(),
      document_id: input.document_id.trim(),
      city: input.city.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', customerId)
    .eq('store_id', storeId)
    .select('*')
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as ConfeccionCustomer
}

export async function deactivateConfeccionCustomer(customerId: string, storeId: string): Promise<void> {
  const { error } = await supabase
    .from('confeccion_customers')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', customerId)
    .eq('store_id', storeId)

  if (error) throw new Error(error.message)
}

export async function listConfeccionCustomerPurchaseStats(
  storeId: string,
  limit = 800,
): Promise<CustomerPurchaseStats[]> {
  const { data, error } = await supabase
    .from('wholesale_invoices')
    .select('customer_name, customer_phone, grand_total, paid_total, balance_due, issued_at, status')
    .eq('store_id', storeId)
    .neq('status', 'void')
    .not('customer_name', 'is', null)
    .order('issued_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)

  const grouped = new Map<string, CustomerPurchaseStats>()

  for (const row of data ?? []) {
    const rawName = String(row.customer_name ?? '').trim()
    if (!rawName) {
      continue
    }

    const rawPhone = row.customer_phone ? String(row.customer_phone) : null
    const key = `${rawName.toLowerCase()}::${(rawPhone ?? '').trim()}`
    const current = grouped.get(key) ?? {
      key,
      customerName: rawName,
      customerPhone: rawPhone,
      invoicesCount: 0,
      totalPurchased: 0,
      totalPaid: 0,
      totalPending: 0,
      averageTicket: 0,
      lastPurchaseAt: null,
    }

    const grandTotal = Number(row.grand_total ?? 0)
    const paidTotal = Number(row.paid_total ?? 0)
    const pending = Number(row.balance_due ?? 0)

    current.invoicesCount += 1
    current.totalPurchased += Number.isFinite(grandTotal) ? grandTotal : 0
    current.totalPaid += Number.isFinite(paidTotal) ? paidTotal : 0
    current.totalPending += Number.isFinite(pending) ? pending : 0

    const issuedAt = row.issued_at ? String(row.issued_at) : null
    if (!current.lastPurchaseAt || (issuedAt && issuedAt > current.lastPurchaseAt)) {
      current.lastPurchaseAt = issuedAt
    }

    grouped.set(key, current)
  }

  return Array.from(grouped.values())
    .map((item) => ({
      ...item,
      averageTicket: item.invoicesCount > 0 ? item.totalPurchased / item.invoicesCount : 0,
    }))
    .sort((a, b) => b.totalPurchased - a.totalPurchased)
}
