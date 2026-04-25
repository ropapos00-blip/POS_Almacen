import { supabase } from '../../../integrations/supabase/client/supabaseClient'
import { makeBarcode } from '../../catalog/services/catalogUtils'
import type {
  InventoryItemInput,
  InventoryItemRow,
  InventoryStockRow,
  StockAdjustmentInput,
} from '../model/inventory.types'

export async function listInventoryStock(storeId: string) {
  const { data, error } = await supabase
    .from('inventory_stock')
    .select(
      '*, product_variants(sku, barcode, size, color, cost_price, sale_price, suggested_price, products(id, name, category_id))',
    )
    .eq('store_id', storeId)
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as InventoryStockRow[]
}

/** Convierte filas de stock a vista plana para la tabla de inventario */
export function mapStockToItems(rows: InventoryStockRow[]): InventoryItemRow[] {
  return rows
    .filter((r) => r.product_variants?.products != null)
    .map((r) => ({
      stockId: r.id,
      variantId: r.variant_id,
      productId: r.product_variants!.products!.id,
      categoryId: r.product_variants!.products!.category_id,
      description: r.product_variants!.products!.name,
      quantity: r.quantity_on_hand,
      costPrice: r.product_variants!.cost_price,
      salePrice: r.product_variants!.sale_price,
      minSalePrice: r.product_variants!.suggested_price ?? null,
      reference: r.product_variants!.sku,
      barcode: r.product_variants!.barcode,
    }))
}

/** Crea producto + variante + actualiza stock inicial en una secuencia */
export async function createInventoryItem(
  storeId: string,
  input: InventoryItemInput,
): Promise<{ variantId: string; stockId: string }> {
  const reference = input.reference.trim() || makeBarcode()

  // 1. Crear producto
  const { data: productData, error: productError } = await supabase
    .from('products')
    .insert({
      store_id: storeId,
      category_id: input.categoryId,
      name: input.description.trim(),
    })
    .select('id')
    .single()

  if (productError) {
    throw new Error(productError.message)
  }

  // 2. Crear variante (barcode = reference)
  const { data: variantData, error: variantError } = await supabase
    .from('product_variants')
    .insert({
      store_id: storeId,
      product_id: productData.id,
      size: '-',
      color: '-',
      cost_price: input.costPrice,
      sale_price: input.salePrice,
      suggested_price: input.minSalePrice,
      sku: reference,
      barcode: reference,
    })
    .select('id')
    .single()

  if (variantError) {
    await supabase.from('products').delete().eq('id', productData.id)
    throw new Error(variantError.message)
  }

  // 3. Crear stock inicial
  const { data: stockData, error: stockError } = await supabase
    .from('inventory_stock')
    .insert({
      store_id: storeId,
      variant_id: variantData.id,
      quantity_on_hand: input.quantity,
      quantity_reserved: 0,
      reorder_level: 0,
    })
    .select('id')
    .single()

  if (stockError) {
    await supabase.from('product_variants').delete().eq('id', variantData.id)
    await supabase.from('products').delete().eq('id', productData.id)
    throw new Error(stockError.message)
  }

  return { variantId: variantData.id, stockId: stockData.id }
}

/** Actualiza descripción, cantidad, precios y referencia de un ítem existente */
export async function updateInventoryItem(
  input: InventoryItemInput & { productId: string; variantId: string; stockId: string },
): Promise<void> {
  const reference = input.reference.trim()

  const [productRes, variantRes, stockRes] = await Promise.all([
    supabase
      .from('products')
      .update({ name: input.description.trim(), category_id: input.categoryId })
      .eq('id', input.productId),
    supabase
      .from('product_variants')
      .update({ cost_price: input.costPrice, sale_price: input.salePrice, suggested_price: input.minSalePrice, sku: reference, barcode: reference })
      .eq('id', input.variantId),
    supabase
      .from('inventory_stock')
      .update({ quantity_on_hand: input.quantity, updated_at: new Date().toISOString() })
      .eq('id', input.stockId),
  ])

  const err = productRes.error ?? variantRes.error ?? stockRes.error
  if (err) {
    throw new Error(err.message)
  }
}

/** Elimina ítem: movements → stock (cascade) → variante → producto */
export async function deleteInventoryItem(
  productId: string,
  variantId: string,
  stockId: string,
): Promise<void> {
  // 1. Borrar movimientos de inventario (on delete restrict → hay que borrarlos antes)
  const { error: movErr } = await supabase
    .from('inventory_movements')
    .delete()
    .eq('variant_id', variantId)
  if (movErr) throw new Error(movErr.message)

  // 2. Borrar stock explícitamente (también cascadea al borrar variante, pero lo hacemos explícito)
  await supabase.from('inventory_stock').delete().eq('id', stockId)

  // 3. Borrar variante (inventory_stock cascadea)
  const { error: varErr } = await supabase
    .from('product_variants')
    .delete()
    .eq('id', variantId)
  if (varErr) {
    // Si tiene ventas asociadas (sale_items) Supabase retorna 409
    if (varErr.code === '23503') {
      throw new Error('No se puede eliminar: este producto tiene ventas registradas.')
    }
    throw new Error(varErr.message)
  }

  // 4. Borrar producto padre
  const { error: prodErr } = await supabase.from('products').delete().eq('id', productId)
  if (prodErr) throw new Error(prodErr.message)
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

