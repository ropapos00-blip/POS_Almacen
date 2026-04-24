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
  // 1. Obtener IDs de productos de esta categoría
  const { data: products } = await supabase
    .from('products')
    .select('id')
    .eq('category_id', categoryId)

  const productIds = (products ?? []).map((p) => p.id)

  if (productIds.length > 0) {
    // 2. Obtener IDs de variantes
    const { data: variants } = await supabase
      .from('product_variants')
      .select('id')
      .in('product_id', productIds)

    const variantIds = (variants ?? []).map((v) => v.id)

    if (variantIds.length > 0) {
      // 3. Borrar movimientos de inventario
      const { error: movErr } = await supabase
        .from('inventory_movements')
        .delete()
        .in('variant_id', variantIds)
      if (movErr) throw new Error(movErr.message)

      // 4. Borrar stock
      const { error: stockErr } = await supabase
        .from('inventory_stock')
        .delete()
        .in('variant_id', variantIds)
      if (stockErr) throw new Error(stockErr.message)

      // 5. Borrar variantes
      const { error: varErr } = await supabase
        .from('product_variants')
        .delete()
        .in('id', variantIds)
      if (varErr) {
        if (varErr.code === '23503') {
          throw new Error('No se puede eliminar: algún producto tiene ventas registradas.')
        }
        throw new Error(varErr.message)
      }
    }

    // 6. Borrar productos
    const { error: prodErr } = await supabase
      .from('products')
      .delete()
      .in('id', productIds)
    if (prodErr) throw new Error(prodErr.message)
  }

  // 7. Borrar categoría
  const { error } = await supabase.from('categories').delete().eq('id', categoryId)
  if (error) throw new Error(error.message)
}
