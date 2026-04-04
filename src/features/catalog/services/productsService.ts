import { supabase } from '../../../integrations/supabase/client/supabaseClient'
import { normalizeOptionalText } from './catalogUtils'
import type { Product, ProductInput } from '../model/catalog.types'

export async function listProducts(storeId: string) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as Product[]
}

export async function createProduct(storeId: string, input: ProductInput) {
  const { error } = await supabase.from('products').insert({
    store_id: storeId,
    category_id: input.categoryId,
    name: input.name.trim(),
    description: normalizeOptionalText(input.description),
    brand: normalizeOptionalText(input.brand),
    gender: normalizeOptionalText(input.gender),
    season: normalizeOptionalText(input.season),
  })

  if (error) {
    throw new Error(error.message)
  }
}

export async function updateProduct(productId: string, input: ProductInput) {
  const { error } = await supabase
    .from('products')
    .update({
      category_id: input.categoryId,
      name: input.name.trim(),
      description: normalizeOptionalText(input.description),
      brand: normalizeOptionalText(input.brand),
      gender: normalizeOptionalText(input.gender),
      season: normalizeOptionalText(input.season),
    })
    .eq('id', productId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function deleteProduct(productId: string) {
  const { error } = await supabase.from('products').delete().eq('id', productId)

  if (error) {
    throw new Error(error.message)
  }
}
