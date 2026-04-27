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

export async function searchConfeccionCustomers(storeId: string, query: string): Promise<ConfeccionCustomer[]> {
  const { data, error } = await supabase
    .from('confeccion_customers')
    .select('*')
    .eq('store_id', storeId)
    .or(`full_name.ilike.%${query}%,document_id.ilike.%${query}%,phone.ilike.%${query}%`)
    .order('full_name', { ascending: true })
    .limit(20)

  if (error) throw new Error(error.message)
  return data as ConfeccionCustomer[]
}

export async function getConfeccionCustomerByDocument(storeId: string, documentId: string): Promise<ConfeccionCustomer | null> {
  const { data, error } = await supabase
    .from('confeccion_customers')
    .select('*')
    .eq('store_id', storeId)
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

export async function listConfeccionCustomers(
  storeId: string,
  options?: { includeInactive?: boolean; limit?: number },
): Promise<ConfeccionCustomer[]> {
  let query = supabase
    .from('confeccion_customers')
    .select('*')
    .eq('store_id', storeId)
    .order('full_name', { ascending: true })

  if (!options?.includeInactive) {
    query = query.eq('is_active', true)
  }

  if (options?.limit) {
    query = query.limit(options.limit)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data as ConfeccionCustomer[]
}

export async function updateConfeccionCustomer(
  id: string,
  storeId: string,
  form: { full_name: string; phone: string; address: string; document_id: string; city: string },
): Promise<ConfeccionCustomer> {
  const { data, error } = await supabase
    .from('confeccion_customers')
    .update({ ...form, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('store_id', storeId)
    .select('*')
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as ConfeccionCustomer
}

export async function deactivateConfeccionCustomer(id: string, storeId: string): Promise<void> {
  const { error } = await supabase
    .from('confeccion_customers')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('store_id', storeId)

  if (error) throw new Error(error.message)
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

export async function listConfeccionCustomerPurchaseStats(storeId: string): Promise<CustomerPurchaseStats[]> {
  const { data, error } = await supabase
    .from('wholesale_invoices')
    .select('customer_name, customer_phone, grand_total, paid_total, balance_due, issued_at, status')
    .eq('store_id', storeId)
    .neq('status', 'void')
    .order('issued_at', { ascending: false })

  if (error) throw new Error(error.message)

  const map = new Map<string, CustomerPurchaseStats>()

  for (const row of data ?? []) {
    const name = (row.customer_name ?? '').trim()
    const phone = (row.customer_phone ?? '').trim() || null
    const key = `${name.toLowerCase()}::${phone ?? ''}`

    const current = map.get(key) ?? {
      key,
      customerName: name || 'Cliente general',
      customerPhone: phone,
      invoicesCount: 0,
      totalPurchased: 0,
      totalPaid: 0,
      totalPending: 0,
      averageTicket: 0,
      lastPurchaseAt: null,
    }

    current.invoicesCount += 1
    current.totalPurchased += Number(row.grand_total ?? 0)
    current.totalPaid += Number(row.paid_total ?? 0)
    current.totalPending += Number(row.balance_due ?? 0)

    const issuedAt = row.issued_at as string | null
    if (issuedAt && (!current.lastPurchaseAt || issuedAt > current.lastPurchaseAt)) {
      current.lastPurchaseAt = issuedAt
    }

    map.set(key, current)
  }

  return Array.from(map.values())
    .map((row) => ({
      ...row,
      averageTicket: row.invoicesCount > 0 ? Math.round(row.totalPurchased / row.invoicesCount) : 0,
    }))
    .sort((a, b) => b.totalPurchased - a.totalPurchased)
}
