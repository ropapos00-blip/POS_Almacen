import { supabase } from '../../../integrations/supabase/client/supabaseClient'
import type {
  DiscountAuthorizationResult,
  PosSalePayload,
  PosVariant,
} from '../model/pos.types'

export async function listPosVariants(storeId: string) {
  const { data, error } = await supabase
    .from('product_variants')
    .select('id, sku, barcode, size, color, cost_price, sale_price, products(name), inventory_stock(quantity_on_hand)')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(400)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as PosVariant[]
}

export async function createPosSale(payload: PosSalePayload) {
  const subtotal = payload.items.reduce((acc, item) => {
    return acc + Number(item.quantity)
  }, 0)

  if (subtotal <= 0) {
    throw new Error('No hay items en el carrito.')
  }

  const { data: pricingRows, error: pricingError } = await supabase
    .from('product_variants')
    .select('id, sale_price, cost_price')
    .in(
      'id',
      payload.items.map((item) => item.variant_id),
    )

  if (pricingError) {
    throw new Error(pricingError.message)
  }

  const priceMap = new Map(
    (pricingRows ?? []).map((row) => [
      row.id as string,
      {
        salePrice: Number(row.sale_price),
        costPrice: Number(row.cost_price),
      },
    ]),
  )

  const totalCost = payload.items.reduce((acc, item) => {
    const pricing = priceMap.get(item.variant_id)
    return acc + (pricing?.costPrice ?? 0) * item.quantity
  }, 0)

  const grossTotal = payload.items.reduce((acc, item) => {
    const unitPrice = priceMap.get(item.variant_id)?.salePrice ?? 0
    return acc + unitPrice * item.quantity
  }, 0)

  const maxAllowedDiscount = Number((grossTotal - totalCost).toFixed(2))

  if (payload.discountTotal > maxAllowedDiscount) {
    throw new Error(
      `El descuento supera el limite permitido por costo. Maximo: ${maxAllowedDiscount.toFixed(2)}.`,
    )
  }

  const grandTotal = Number((grossTotal - payload.discountTotal).toFixed(2))

  if (grandTotal <= 0) {
    throw new Error('El total final debe ser mayor a 0.')
  }

  let payments: Array<{ method: string; amount: number; reference: string | null }>

  if (
    payload.paymentMethod === 'mixed' &&
    payload.mixedFirstMethod &&
    payload.mixedFirstAmount != null &&
    payload.mixedSecondMethod &&
    payload.mixedSecondAmount != null
  ) {
    const firstAmount = Number(payload.mixedFirstAmount.toFixed(2))
    const secondAmount = Number(payload.mixedSecondAmount.toFixed(2))
    if (firstAmount + secondAmount !== grandTotal) {
      // Allow small floating-point tolerance; just pass amounts as-is
    }
    payments = [
      { method: payload.mixedFirstMethod, amount: firstAmount, reference: null },
      { method: payload.mixedSecondMethod, amount: secondAmount, reference: null },
    ]
  } else {
    payments = [
      {
        method: payload.paymentMethod,
        amount: grandTotal,
        reference: payload.paymentReference ?? null,
      },
    ]
  }

  const { data, error } = await supabase.rpc('create_sale_transaction', {
    p_store_id: payload.storeId,
    p_sold_by: payload.soldBy,
    p_discount_total: payload.discountTotal,
    p_customer_name: payload.customerName ?? null,
    p_items: payload.items,
    p_payments: payments,
  })

  if (error) {
    throw new Error(error.message)
  }

  const first = Array.isArray(data) ? data[0] : null
  return {
    saleId: (first?.sale_id as string) ?? '',
    saleNumber: (first?.sale_number as string) ?? '',
  }
}

export async function authorizeDiscountOverride(
  storeId: string,
  adminEmail: string,
  adminPassword: string,
  requestedDiscount: number,
): Promise<DiscountAuthorizationResult> {
  const { data, error } = await supabase.rpc('authorize_discount_override', {
    p_store_id: storeId,
    p_admin_email: adminEmail.trim().toLowerCase(),
    p_admin_password: adminPassword,
    p_requested_discount: requestedDiscount,
  })

  if (error) {
    throw new Error(error.message)
  }

  const first = Array.isArray(data) ? data[0] : null
  if (!first?.out_authorized) {
    throw new Error('No fue posible autorizar el descuento.')
  }

  return {
    authorized: Boolean(first.out_authorized),
    adminUserId: String(first.out_admin_user_id ?? ''),
    adminName: String(first.out_admin_name ?? 'Admin'),
    adminRoleCode: (first.out_role_code as 'super_admin' | 'admin') ?? 'admin',
  }
}
