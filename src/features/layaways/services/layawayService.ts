import { supabase } from '../../../integrations/supabase/client/supabaseClient'
import type { AddLayawayPaymentInput, CreateLayawayInput, Layaway, VariantLookup } from '../model/layaway.types'

export async function listLayaways(storeId: string): Promise<Layaway[]> {
  const { data, error } = await supabase
    .from('layaways')
    .select('*, layaway_items(*), layaway_payments(*)')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Layaway[]
}

export async function findVariantByBarcode(
  storeId: string,
  barcode: string,
): Promise<VariantLookup | null> {
  const { data, error } = await supabase
    .from('product_variants')
    .select('id, sku, barcode, size, color, cost_price, sale_price, suggested_price, products(name), inventory_stock(quantity_on_hand)')
    .eq('store_id', storeId)
    .eq('barcode', barcode.trim())
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as unknown as VariantLookup | null
}

export async function createLayaway(input: CreateLayawayInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_layaway', {
    p_store_id: input.storeId,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone || null,
    p_notes: input.notes || null,
    p_created_by: input.createdBy,
    p_items: input.items.map((item) => ({
      variant_id: item.variantId ?? '',
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
    })),
  })

  if (error) throw new Error(error.message)
  return data as string
}

export async function addLayawayPayment(input: AddLayawayPaymentInput): Promise<void> {
  const { error } = await supabase.rpc('add_layaway_payment', {
    p_layaway_id: input.layawayId,
    p_amount: input.amount,
    p_payment_method: input.paymentMethod,
    p_notes: input.notes || null,
    p_created_by: input.createdBy,
  })

  if (error) throw new Error(error.message)
}

export async function cancelLayaway(layawayId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_layaway', {
    p_layaway_id: layawayId,
  })

  if (error) throw new Error(error.message)
}

export async function updateLayawayCustomer(
  id: string,
  customerName: string,
  customerPhone: string,
): Promise<void> {
  const { error } = await supabase
    .from('layaways')
    .update({ customer_name: customerName, customer_phone: customerPhone || null })
    .eq('id', id)

  if (error) throw new Error(error.message)
}
