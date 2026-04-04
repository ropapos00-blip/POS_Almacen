import { supabase } from '../../../integrations/supabase/client/supabaseClient'
import type { Category, CategoryInput } from '../model/catalog.types'

export async function listCategories(storeId: string) {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as Category[]
}

export async function createCategory(storeId: string, input: CategoryInput) {
  const { error } = await supabase.from('categories').insert({
    store_id: storeId,
    name: input.name.trim(),
    slug: input.slug.trim(),
  })

  if (error) {
    throw new Error(error.message)
  }
}

export async function updateCategory(categoryId: string, input: CategoryInput) {
  const { error } = await supabase
    .from('categories')
    .update({
      name: input.name.trim(),
      slug: input.slug.trim(),
    })
    .eq('id', categoryId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function deleteCategory(categoryId: string) {
  const { error } = await supabase.from('categories').delete().eq('id', categoryId)

  if (error) {
    throw new Error(error.message)
  }
}
