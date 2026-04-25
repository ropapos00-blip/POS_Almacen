import { supabase } from '../../../integrations/supabase/client/supabaseClient'

export interface DiscountPinConfig {
  enabled: boolean
  hasPin: boolean
}

export async function getDiscountPinConfig(storeId: string): Promise<DiscountPinConfig> {
  const { data, error } = await supabase.rpc('get_store_discount_pin_config', {
    p_store_id: storeId,
  })
  if (error) throw new Error(error.message)
  const first = Array.isArray(data) ? data[0] : null
  return {
    enabled: Boolean(first?.out_enabled),
    hasPin: Boolean(first?.out_has_pin),
  }
}

export async function setDiscountPinConfig(
  storeId: string,
  pin: string | null,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('set_store_discount_pin', {
    p_store_id: storeId,
    p_pin: pin ?? '',
    p_enabled: enabled,
  })
  if (error) throw new Error(error.message)
}

export async function validateDiscountPin(storeId: string, pin: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('validate_store_discount_pin', {
    p_store_id: storeId,
    p_pin: pin,
  })
  if (error) throw new Error(error.message)
  return Boolean(data)
}
