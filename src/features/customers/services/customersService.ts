import { supabase } from '../../../integrations/supabase/client/supabaseClient'

export interface StoreCustomer {
  id: string
  store_id: string
  full_name: string
  phone: string
  document_id: string
  address: string
  city: string
  notes: string
  created_at: string
  updated_at: string
  is_active: boolean
}

export type CreateStoreCustomerInput = {
  store_id: string
  full_name: string
  phone?: string
  document_id?: string
  address?: string
  city?: string
  notes?: string
}
export type UpdateStoreCustomerInput = Partial<Omit<StoreCustomer, 'id' | 'store_id' | 'created_at' | 'updated_at' | 'is_active'>>

export async function listStoreCustomers(
  storeId: string,
  options?: { includeInactive?: boolean; limit?: number },
): Promise<StoreCustomer[]> {
  let query = supabase
    .from('store_customers')
    .select('*')
    .eq('store_id', storeId)
    .order('full_name', { ascending: true })
    .limit(options?.limit ?? 500)

  if (!options?.includeInactive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data as StoreCustomer[]
}

export async function searchStoreCustomers(storeId: string, term: string, limit = 20): Promise<StoreCustomer[]> {
  const { data, error } = await supabase
    .from('store_customers')
    .select('*')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .or(`full_name.ilike.%${term}%,document_id.ilike.%${term}%,phone.ilike.%${term}%`)
    .order('full_name', { ascending: true })
    .limit(limit)

  if (error) throw new Error(error.message)
  return data as StoreCustomer[]
}

export async function createStoreCustomer(input: CreateStoreCustomerInput): Promise<StoreCustomer> {
  const { data, error } = await supabase
    .from('store_customers')
    .insert(input)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as StoreCustomer
}

export async function updateStoreCustomer(
  id: string,
  storeId: string,
  input: UpdateStoreCustomerInput,
): Promise<StoreCustomer> {
  const { data, error } = await supabase
    .from('store_customers')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('store_id', storeId)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as StoreCustomer
}

export async function deactivateStoreCustomer(id: string, storeId: string): Promise<void> {
  const { error } = await supabase
    .from('store_customers')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('store_id', storeId)

  if (error) throw new Error(error.message)
}
