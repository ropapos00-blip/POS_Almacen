import { supabase } from '../../../integrations/supabase/client/supabaseClient'
import type {
  CreateWholesaleReferenceInput,
  UpdateWholesaleReferenceInvestmentMovementInput,
  UpdateWholesaleReferenceInput,
  WholesaleInventoryRow,
  WholesaleReferenceInvestmentMovementRow,
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

  if (input.investmentAmount < 0) {
    throw new Error('La inversion no puede ser negativa.')
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
        investment_amount: input.investmentAmount,
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
    investment_amount: input.investmentAmount,
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
  const { data: referenceMovements, error: referenceMovementsError } = await supabase
    .from('wholesale_reference_movements')
    .select('id')
    .eq('store_id', storeId)
    .eq('wholesale_reference_id', referenceId)

  if (referenceMovementsError) {
    throw new Error(referenceMovementsError.message)
  }

  const movementIds = (referenceMovements ?? []).map((row) => String(row.id))

  if (movementIds.length > 0) {
    const { error: deleteInvestmentsError } = await supabase
      .from('wholesale_finance_movements')
      .delete()
      .eq('store_id', storeId)
      .eq('kind', 'investment')
      .in('source_reference_movement_id', movementIds)

    if (deleteInvestmentsError) {
      throw new Error(deleteInvestmentsError.message)
    }
  }

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

export async function deleteAllWholesaleReferences(storeId: string) {
  const { data: activeReferences, error: activeReferencesError } = await supabase
    .from('wholesale_references')
    .select('id')
    .eq('store_id', storeId)
    .eq('is_active', true)

  if (activeReferencesError) {
    throw new Error(activeReferencesError.message)
  }

  const activeReferenceIds = (activeReferences ?? []).map((row) => String(row.id))

  if (activeReferenceIds.length > 0) {
    const { data: referenceMovements, error: referenceMovementsError } = await supabase
      .from('wholesale_reference_movements')
      .select('id')
      .eq('store_id', storeId)
      .in('wholesale_reference_id', activeReferenceIds)

    if (referenceMovementsError) {
      throw new Error(referenceMovementsError.message)
    }

    const movementIds = (referenceMovements ?? []).map((row) => String(row.id))

    if (movementIds.length > 0) {
      const { error: deleteInvestmentsError } = await supabase
        .from('wholesale_finance_movements')
        .delete()
        .eq('store_id', storeId)
        .eq('kind', 'investment')
        .in('source_reference_movement_id', movementIds)

      if (deleteInvestmentsError) {
        throw new Error(deleteInvestmentsError.message)
      }
    }
  }

  const { data, error } = await supabase
    .from('wholesale_references')
    .update({
      is_active: false,
      quantity_on_hand: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('store_id', storeId)
    .eq('is_active', true)
    .select('id')

  if (error) {
    throw new Error(error.message)
  }

  return {
    affectedRows: (data ?? []).length,
  }
}

export async function listWholesaleReferenceInvestmentMovements(storeId: string, referenceId: string) {
  const { data: referenceMovements, error: referenceMovementsError } = await supabase
    .from('wholesale_reference_movements')
    .select('id, quantity, investment_amount, reason, created_at')
    .eq('store_id', storeId)
    .eq('wholesale_reference_id', referenceId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (referenceMovementsError) {
    throw new Error(referenceMovementsError.message)
  }

  const movementIds = (referenceMovements ?? []).map((row) => String(row.id))
  if (movementIds.length === 0) {
    return [] as WholesaleReferenceInvestmentMovementRow[]
  }

  const referenceMovementById = new Map(
    (referenceMovements ?? []).map((row) => [String(row.id), row]),
  )

  const { data: financeMovements, error: financeMovementsError } = await supabase
    .from('wholesale_finance_movements')
    .select('id, source_reference_movement_id, amount, movement_date, category, notes, created_at')
    .eq('store_id', storeId)
    .eq('kind', 'investment')
    .in('source_reference_movement_id', movementIds)
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (financeMovementsError) {
    throw new Error(financeMovementsError.message)
  }

  return (financeMovements ?? []).map((row) => {
    const sourceId = row.source_reference_movement_id ? String(row.source_reference_movement_id) : null
    const sourceRow = sourceId ? referenceMovementById.get(sourceId) : null

    return {
      id: String(row.id),
      source_reference_movement_id: sourceId,
      amount: Number(row.amount ?? 0),
      movement_date: String(row.movement_date ?? ''),
      category: row.category ? String(row.category) : null,
      notes: row.notes ? String(row.notes) : null,
      created_at: String(row.created_at ?? ''),
      reference_movement_quantity: Number(sourceRow?.quantity ?? 0),
      reference_movement_investment_amount: Number(sourceRow?.investment_amount ?? 0),
      reference_movement_reason: sourceRow?.reason ? String(sourceRow.reason) : null,
      reference_movement_created_at: String(sourceRow?.created_at ?? ''),
    } satisfies WholesaleReferenceInvestmentMovementRow
  })
}

export async function updateWholesaleReferenceInvestmentMovement(
  storeId: string,
  input: UpdateWholesaleReferenceInvestmentMovementInput,
) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('El monto de inversion debe ser mayor a cero.')
  }

  const { data: financeMovement, error: financeMovementError } = await supabase
    .from('wholesale_finance_movements')
    .select('id, source_reference_movement_id')
    .eq('id', input.movementId)
    .eq('store_id', storeId)
    .eq('kind', 'investment')
    .maybeSingle()

  if (financeMovementError) {
    throw new Error(financeMovementError.message)
  }

  if (!financeMovement?.id) {
    throw new Error('Movimiento de inversion no encontrado.')
  }

  const { error: updateFinanceError } = await supabase
    .from('wholesale_finance_movements')
    .update({
      amount: input.amount,
      notes: 'Ajuste manual de inversion desde inventario de confeccion',
    })
    .eq('id', input.movementId)
    .eq('store_id', storeId)
    .eq('kind', 'investment')

  if (updateFinanceError) {
    throw new Error(updateFinanceError.message)
  }

  const sourceReferenceMovementId = financeMovement.source_reference_movement_id
    ? String(financeMovement.source_reference_movement_id)
    : null

  if (sourceReferenceMovementId) {
    const { error: updateReferenceMovementError } = await supabase
      .from('wholesale_reference_movements')
      .update({
        investment_amount: input.amount,
      })
      .eq('id', sourceReferenceMovementId)
      .eq('store_id', storeId)

    if (updateReferenceMovementError) {
      throw new Error(updateReferenceMovementError.message)
    }
  }
}