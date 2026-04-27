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
