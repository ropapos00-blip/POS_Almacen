import { supabase } from '../../../integrations/supabase/client/supabaseClient'
import type { PriceCheckVariant } from '../model/priceCheck.types'

export async function listPriceCheckVariants(storeId: string) {
  const { data, error } = await supabase
    .from('product_variants')
    .select('id, sku, barcode, size, color, sale_price, products(name), inventory_stock(quantity_on_hand)')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(400)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as PriceCheckVariant[]
}
