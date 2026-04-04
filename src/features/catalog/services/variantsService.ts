import { supabase } from '../../../integrations/supabase/client/supabaseClient'
import { makeBarcode, makeSku } from './catalogUtils'
import type { Product, ProductVariant, VariantInput } from '../model/catalog.types'

export async function listVariants(storeId: string) {
  const { data, error } = await supabase
    .from('product_variants')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as ProductVariant[]
}

export async function createVariant(
  storeId: string,
  products: Product[],
  input: VariantInput,
) {
  const product = products.find((item) => item.id === input.productId)
  const defaultSku = makeSku(product?.name ?? 'PRD', input.size, input.color)
  const defaultBarcode = makeBarcode()

  const { data, error } = await supabase
    .from('product_variants')
    .insert({
    store_id: storeId,
    product_id: input.productId,
    size: input.size.trim(),
    color: input.color.trim(),
    cost_price: input.costPrice,
    sale_price: input.salePrice,
    sku: input.sku?.trim() || defaultSku,
    barcode: input.barcode?.trim() || defaultBarcode,
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  const { error: stockError } = await supabase.from('inventory_stock').insert({
    store_id: storeId,
    variant_id: data.id,
    quantity_on_hand: 0,
    quantity_reserved: 0,
    reorder_level: 0,
  })

  if (stockError) {
    await supabase.from('product_variants').delete().eq('id', data.id)
    throw new Error(stockError.message)
  }
}

export async function updateVariant(variantId: string, input: VariantInput) {
  const { error } = await supabase
    .from('product_variants')
    .update({
      product_id: input.productId,
      size: input.size.trim(),
      color: input.color.trim(),
      cost_price: input.costPrice,
      sale_price: input.salePrice,
      sku: input.sku?.trim(),
      barcode: input.barcode?.trim(),
    })
    .eq('id', variantId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function deleteVariant(variantId: string) {
  const { error } = await supabase.from('product_variants').delete().eq('id', variantId)

  if (error) {
    throw new Error(error.message)
  }
}
