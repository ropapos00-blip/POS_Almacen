import { supabase } from '../../../integrations/supabase/client/supabaseClient'
import type { InventoryStockRow, StockAdjustmentInput } from '../model/inventory.types'

export async function listInventoryStock(storeId: string) {
  const { data, error } = await supabase
    .from('inventory_stock')
    .select('*, product_variants(sku, size, color, products(name))')
    .eq('store_id', storeId)
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as InventoryStockRow[]
}

export async function adjustStock(
  storeId: string,
  userId: string,
  input: StockAdjustmentInput,
) {
  const newQuantity = input.currentQuantity + input.delta

  if (newQuantity < 0) {
    throw new Error('El ajuste no puede dejar stock negativo.')
  }

  const { error: updateError } = await supabase
    .from('inventory_stock')
    .update({
      quantity_on_hand: newQuantity,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.stockId)

  if (updateError) {
    throw new Error(updateError.message)
  }

  const { error: movementError } = await supabase.from('inventory_movements').insert({
    store_id: storeId,
    variant_id: input.variantId,
    type: 'adjustment',
    quantity: input.delta,
    reason: input.reason.trim(),
    performed_by: userId,
  })

  if (movementError) {
    throw new Error(movementError.message)
  }
}
