import { supabase } from '../../../integrations/supabase/client/supabaseClient'
import type {
  CreateWholesaleReferenceInput,
  UpdateWholesaleReferenceInput,
  WholesaleInventoryRow,
} from '../model/wholesale.types'

export async function listWholesaleInventoryStock(storeId: string) {
  const { data, error } = await supabase
    .from('wholesale_references')
    .select('id, reference, unit_price, quantity_on_hand, is_active')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .order('reference', { ascending: true })
    .limit(800)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => {
    return {
      variantId: String(row.id),
      reference: String(row.reference ?? ''),
      productName: String(row.reference ?? ''),
      unitPrice: Number(row.unit_price ?? 0),
      quantityOnHand: Number(row.quantity_on_hand ?? 0),
    } satisfies WholesaleInventoryRow
  })
}

export async function createWholesaleReference(
  storeId: string,
  userId: string,
  input: CreateWholesaleReferenceInput,
) {
  const normalizedReference = input.reference.trim().toUpperCase()

  if (!normalizedReference) {
    throw new Error('La referencia es obligatoria.')
  }

  if (input.quantityOnHand < 0) {
    throw new Error('La cantidad no puede ser negativa.')
  }

  if (input.unitPrice < 0) {
    throw new Error('El valor unitario no puede ser negativo.')
  }

  const { data: existing, error: existingError } = await supabase
    .from('wholesale_references')
    .select('id, quantity_on_hand, is_active')
    .eq('store_id', storeId)
    .ilike('reference', normalizedReference)
    .limit(1)
    .maybeSingle()

  if (existingError) {
    throw new Error(existingError.message)
  }

  if (existing?.id) {
    const nextQuantity = Number(existing.quantity_on_hand ?? 0) + input.quantityOnHand

    const { error: updateExistingError } = await supabase
      .from('wholesale_references')
      .update({
        quantity_on_hand: nextQuantity,
        unit_price: input.unitPrice,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)

    if (updateExistingError) {
      throw new Error(updateExistingError.message)
    }

    if (input.quantityOnHand > 0) {
      const { error: movementError } = await supabase.from('wholesale_reference_movements').insert({
        store_id: storeId,
        wholesale_reference_id: existing.id,
        type: 'in',
        quantity: input.quantityOnHand,
        reason: 'Carga adicional de referencia existente',
        reference_type: 'reference_restock',
        performed_by: userId,
      })

      if (movementError) {
        throw new Error(movementError.message)
      }
    }

    return {
      action: 'restocked' as const,
      reference: normalizedReference,
      finalQuantity: nextQuantity,
    }
  }

  const { data, error } = await supabase
    .from('wholesale_references')
    .insert({
      store_id: storeId,
      reference: normalizedReference,
      quantity_on_hand: input.quantityOnHand,
      unit_price: input.unitPrice,
      created_by: userId,
      is_active: true,
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  if (input.quantityOnHand <= 0) {
    return
  }

  const { error: movementError } = await supabase.from('wholesale_reference_movements').insert({
    store_id: storeId,
    wholesale_reference_id: data.id,
    type: 'in',
    quantity: input.quantityOnHand,
    reason: 'Carga inicial de referencia',
    reference_type: 'reference_create',
    performed_by: userId,
  })

  if (movementError) {
    throw new Error(movementError.message)
  }

  return {
    action: 'created' as const,
    reference: normalizedReference,
    finalQuantity: input.quantityOnHand,
  }
}

export async function updateWholesaleReference(
  storeId: string,
  userId: string,
  input: UpdateWholesaleReferenceInput,
) {
  if (!input.reference.trim()) {
    throw new Error('La referencia es obligatoria.')
  }

  if (input.quantityOnHand < 0) {
    throw new Error('La cantidad no puede ser negativa.')
  }

  if (input.unitPrice < 0) {
    throw new Error('El valor unitario no puede ser negativo.')
  }

  const { data: current, error: currentError } = await supabase
    .from('wholesale_references')
    .select('id, quantity_on_hand')
    .eq('id', input.referenceId)
    .eq('store_id', storeId)
    .single()

  if (currentError || !current) {
    throw new Error('Referencia no encontrada en inventario de confeccion.')
  }

  const { error: updateError } = await supabase
    .from('wholesale_references')
    .update({
      reference: input.reference.trim(),
      unit_price: input.unitPrice,
      quantity_on_hand: input.quantityOnHand,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.referenceId)
    .eq('store_id', storeId)

  if (updateError) {
    throw new Error(updateError.message)
  }

  const delta = input.quantityOnHand - Number(current.quantity_on_hand ?? 0)
  if (delta === 0) {
    return
  }

  const { error: movementError } = await supabase.from('wholesale_reference_movements').insert({
    store_id: storeId,
    wholesale_reference_id: input.referenceId,
    type: 'adjustment',
    quantity: Math.abs(delta),
    reason: 'Ajuste manual de administrador',
    reference_type: 'reference_update',
    performed_by: userId,
  })

  if (movementError) {
    throw new Error(movementError.message)
  }
}

export async function deleteWholesaleReference(storeId: string, referenceId: string) {
  const { error } = await supabase
    .from('wholesale_references')
    .update({
      is_active: false,
      quantity_on_hand: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', referenceId)
    .eq('store_id', storeId)

  if (error) {
    throw new Error(error.message)
  }
}