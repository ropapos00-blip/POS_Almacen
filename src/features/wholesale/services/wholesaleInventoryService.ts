import { supabase } from '../../../integrations/supabase/client/supabaseClient'
import type {
  CreateWholesaleReferenceInput,
  WholesaleCostBreakdown,
  WholesaleCosteoHeader,
  UpdateWholesaleReferenceInvestmentMovementInput,
  UpdateWholesaleReferenceInput,
  WholesaleInventoryRow,
  WholesaleReferenceInvestmentMovementRow,
} from '../model/wholesale.types'

const COST_KEYS: Array<keyof WholesaleCostBreakdown> = [
  'tela',
  'corte',
  'colorTela',
  'colorTinta',
  'plotter',
  'estampado',
  'disenoEstampa',
  'dacron',
  'cuelloRib',
  'entretela',
  'botones',
  'confeccion',
  'fletesTela',
  'gasolina',
  'bordado',
  'bolsa',
  'etiqueta',
  'marquilla',
  'aplique',
  'varios',
  'impresiones',
  'cintaNit',
  'talla',
  'plastifle',
  'hiladilla',
  'cierre',
]

function getDefaultCostBreakdown(): WholesaleCostBreakdown {
  return {
    tela: 0,
    corte: 0,
    colorTela: 0,
    colorTinta: 0,
    plotter: 0,
    estampado: 0,
    disenoEstampa: 0,
    dacron: 0,
    cuelloRib: 0,
    entretela: 0,
    botones: 0,
    confeccion: 0,
    fletesTela: 0,
    gasolina: 0,
    bordado: 0,
    bolsa: 0,
    etiqueta: 0,
    marquilla: 0,
    aplique: 0,
    varios: 0,
    impresiones: 0,
    cintaNit: 0,
    talla: 0,
    plastifle: 0,
    hiladilla: 0,
    cierre: 0,
  }
}

function normalizeCostBreakdown(raw: unknown): WholesaleCostBreakdown {
  const base = getDefaultCostBreakdown()
  if (!raw || typeof raw !== 'object') {
    return base
  }

  const source = raw as Record<string, unknown>
  COST_KEYS.forEach((key) => {
    const parsed = Number(source[key] ?? 0)
    base[key] = Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  })

  return base
}

function normalizeSizeQuantities(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') {
    return {}
  }

  return Object.entries(raw as Record<string, unknown>).reduce<Record<string, number>>((acc, [size, qty]) => {
    const normalizedSize = size.trim().toUpperCase()
    if (!normalizedSize) {
      return acc
    }

    const parsedQty = Number(qty ?? 0)
    acc[normalizedSize] = Number.isFinite(parsedQty) ? Math.max(0, Math.trunc(parsedQty)) : 0
    return acc
  }, {})
}

function normalizeColorQuantities(raw: unknown): Record<string, Record<string, number>> {
  if (!raw || typeof raw !== 'object') {
    return {}
  }

  return Object.entries(raw as Record<string, unknown>).reduce<Record<string, Record<string, number>>>(
    (acc, [color, sizesRaw]) => {
      const normalizedColor = color.trim().toUpperCase()
      if (!normalizedColor || !sizesRaw || typeof sizesRaw !== 'object') {
        return acc
      }

      const normalizedSizes = Object.entries(sizesRaw as Record<string, unknown>).reduce<Record<string, number>>(
        (sizesAcc, [size, qty]) => {
          const normalizedSize = size.trim().toUpperCase()
          if (!normalizedSize) {
            return sizesAcc
          }

          const parsedQty = Number(qty ?? 0)
          sizesAcc[normalizedSize] = Number.isFinite(parsedQty) ? Math.max(0, Math.trunc(parsedQty)) : 0
          return sizesAcc
        },
        {},
      )

      acc[normalizedColor] = normalizedSizes
      return acc
    },
    {},
  )
}

function sumColorQuantities(colorQuantities: Record<string, Record<string, number>>) {
  return Object.values(colorQuantities).reduce((acc, sizeMap) => {
    return acc + Object.values(sizeMap).reduce((inner, qty) => inner + Math.max(0, Math.trunc(Number(qty || 0))), 0)
  }, 0)
}

function aggregateSizeQuantitiesFromColor(
  colorQuantities: Record<string, Record<string, number>>,
): Record<string, number> {
  return Object.values(colorQuantities).reduce<Record<string, number>>((acc, sizeMap) => {
    Object.entries(sizeMap).forEach(([size, qty]) => {
      acc[size] = (acc[size] ?? 0) + Math.max(0, Math.trunc(Number(qty || 0)))
    })
    return acc
  }, {})
}

function sumSizeQuantities(sizeQuantities: Record<string, number>) {
  return Object.values(sizeQuantities).reduce((acc, qty) => acc + Math.max(0, Math.trunc(Number(qty || 0))), 0)
}

function getDefaultCosteoHeader(): WholesaleCosteoHeader {
  return {
    fecha: '',
    cortador: '',
    curvaCorte: '',
    promedio: '',
    tipoTela: '',
    largoTrazo: '',
    anchoTrazo: '',
    numeroRollos: '',
    rendimiento: '',
    modelo: '',
  }
}

function normalizeCosteoHeader(raw: unknown): WholesaleCosteoHeader {
  const base = getDefaultCosteoHeader()
  if (!raw || typeof raw !== 'object') {
    return base
  }

  const source = raw as Record<string, unknown>
  return {
    fecha: String(source.fecha ?? base.fecha).trim(),
    cortador: String(source.cortador ?? base.cortador).trim(),
    curvaCorte: String(source.curvaCorte ?? base.curvaCorte).trim(),
    promedio: String(source.promedio ?? base.promedio).trim(),
    tipoTela: String(source.tipoTela ?? base.tipoTela).trim(),
    largoTrazo: String(source.largoTrazo ?? base.largoTrazo).trim(),
    anchoTrazo: String(source.anchoTrazo ?? base.anchoTrazo).trim(),
    numeroRollos: String(source.numeroRollos ?? base.numeroRollos).trim(),
    rendimiento: String(source.rendimiento ?? base.rendimiento).trim(),
    modelo: String(source.modelo ?? base.modelo).trim(),
  }
}

export async function listWholesaleInventoryStock(storeId: string) {
  const { data, error } = await supabase
    .from('wholesale_references')
    .select('id, reference, unit_price, quantity_on_hand, total_investment, cost_breakdown, size_quantities, color_quantities, design_enabled, costeo_header, is_active')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .order('reference', { ascending: true })
    .limit(800)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => {
    const normalizedColorQuantities = normalizeColorQuantities((row as { color_quantities?: unknown }).color_quantities)
    return {
      variantId: String(row.id),
      reference: String(row.reference ?? ''),
      productName: String(row.reference ?? ''),
      unitPrice: Number(row.unit_price ?? 0),
      quantityOnHand: Number(row.quantity_on_hand ?? 0),
      totalInvestment: Number(row.total_investment ?? 0),
      costBreakdown: normalizeCostBreakdown(row.cost_breakdown),
      sizeQuantities:
        Object.keys(normalizedColorQuantities).length > 0
          ? aggregateSizeQuantitiesFromColor(normalizedColorQuantities)
          : normalizeSizeQuantities(row.size_quantities),
      colorQuantities: normalizedColorQuantities,
      designEnabled: Boolean(row.design_enabled ?? false),
      costeoHeader: normalizeCosteoHeader(row.costeo_header),
    } satisfies WholesaleInventoryRow
  })
}

export async function createWholesaleReference(
  storeId: string,
  userId: string,
  input: CreateWholesaleReferenceInput,
) {
  const normalizedReference = input.reference.trim().toUpperCase()
  const normalizedColorQuantities = normalizeColorQuantities(input.colorQuantities)
  const normalizedSizeQuantities =
    Object.keys(normalizedColorQuantities).length > 0
      ? aggregateSizeQuantitiesFromColor(normalizedColorQuantities)
      : normalizeSizeQuantities(input.sizeQuantities)
  const computedQuantityFromSizes =
    Object.keys(normalizedColorQuantities).length > 0
      ? sumColorQuantities(normalizedColorQuantities)
      : sumSizeQuantities(normalizedSizeQuantities)
  const targetQuantity = computedQuantityFromSizes > 0 ? computedQuantityFromSizes : input.quantityOnHand
  const normalizedCosts = normalizeCostBreakdown(input.costBreakdown)
  const totalInvestment = COST_KEYS.reduce((acc, key) => acc + normalizedCosts[key], 0)
  const normalizedCosteoHeader = normalizeCosteoHeader(input.costeoHeader)

  if (!normalizedReference) {
    throw new Error('La referencia es obligatoria.')
  }

  if (targetQuantity < 0) {
    throw new Error('La cantidad no puede ser negativa.')
  }

  if (input.unitPrice < 0) {
    throw new Error('El valor unitario no puede ser negativo.')
  }

  if (totalInvestment < 0) {
    throw new Error('La inversion no puede ser negativa.')
  }

  const { data: existing, error: existingError } = await supabase
    .from('wholesale_references')
    .select('id, quantity_on_hand, size_quantities, color_quantities, is_active')
    .eq('store_id', storeId)
    .ilike('reference', normalizedReference)
    .limit(1)
    .maybeSingle()

  if (existingError) {
    throw new Error(existingError.message)
  }

  if (existing?.id) {
    const existingSizeQuantities = normalizeSizeQuantities(existing.size_quantities)
    const existingColorQuantities = normalizeColorQuantities((existing as { color_quantities?: unknown }).color_quantities)
    const mergedSizeQuantities = { ...existingSizeQuantities }
    Object.entries(normalizedSizeQuantities).forEach(([size, qty]) => {
      mergedSizeQuantities[size] = Math.max(0, Math.trunc((mergedSizeQuantities[size] ?? 0) + qty))
    })

    const mergedColorQuantities: Record<string, Record<string, number>> = {
      ...existingColorQuantities,
    }
    Object.entries(normalizedColorQuantities).forEach(([color, sizeMap]) => {
      const current = { ...(mergedColorQuantities[color] ?? {}) }
      Object.entries(sizeMap).forEach(([size, qty]) => {
        current[size] = Math.max(0, Math.trunc((current[size] ?? 0) + qty))
      })
      mergedColorQuantities[color] = current
    })

    const quantityDelta = targetQuantity
    const nextQuantity = Number(existing.quantity_on_hand ?? 0) + quantityDelta

    const { error: updateExistingError } = await supabase
      .from('wholesale_references')
      .update({
        quantity_on_hand: nextQuantity,
        unit_price: input.unitPrice,
        total_investment: totalInvestment,
        cost_breakdown: normalizedCosts,
        size_quantities: mergedSizeQuantities,
        color_quantities: mergedColorQuantities,
        design_enabled: input.designEnabled,
        costeo_header: normalizedCosteoHeader,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)

    if (updateExistingError) {
      throw new Error(updateExistingError.message)
    }

    if (quantityDelta > 0) {
      const { error: movementError } = await supabase.from('wholesale_reference_movements').insert({
        store_id: storeId,
        wholesale_reference_id: existing.id,
        type: 'in',
        quantity: quantityDelta,
        investment_amount: totalInvestment,
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
      quantity_on_hand: targetQuantity,
      unit_price: input.unitPrice,
      total_investment: totalInvestment,
      cost_breakdown: normalizedCosts,
      size_quantities: normalizedSizeQuantities,
      color_quantities: normalizedColorQuantities,
      design_enabled: input.designEnabled,
      costeo_header: normalizedCosteoHeader,
      created_by: userId,
      is_active: true,
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  if (targetQuantity <= 0) {
    return
  }

  const { error: movementError } = await supabase.from('wholesale_reference_movements').insert({
    store_id: storeId,
    wholesale_reference_id: data.id,
    type: 'in',
    quantity: targetQuantity,
    investment_amount: totalInvestment,
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
    finalQuantity: targetQuantity,
  }
}

export async function updateWholesaleReference(
  storeId: string,
  userId: string,
  input: UpdateWholesaleReferenceInput,
) {
  const normalizedColorQuantities = normalizeColorQuantities(input.colorQuantities)
  const normalizedSizeQuantities =
    Object.keys(normalizedColorQuantities).length > 0
      ? aggregateSizeQuantitiesFromColor(normalizedColorQuantities)
      : normalizeSizeQuantities(input.sizeQuantities)
  const computedQuantityFromSizes =
    Object.keys(normalizedColorQuantities).length > 0
      ? sumColorQuantities(normalizedColorQuantities)
      : sumSizeQuantities(normalizedSizeQuantities)
  const targetQuantity = computedQuantityFromSizes > 0 ? computedQuantityFromSizes : input.quantityOnHand
  const normalizedCosts = normalizeCostBreakdown(input.costBreakdown)
  const totalInvestment = COST_KEYS.reduce((acc, key) => acc + normalizedCosts[key], 0)
  const normalizedCosteoHeader = normalizeCosteoHeader(input.costeoHeader)

  if (!input.reference.trim()) {
    throw new Error('La referencia es obligatoria.')
  }

  if (targetQuantity < 0) {
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
      quantity_on_hand: targetQuantity,
      total_investment: totalInvestment,
      cost_breakdown: normalizedCosts,
      size_quantities: normalizedSizeQuantities,
      color_quantities: normalizedColorQuantities,
      design_enabled: input.designEnabled,
      costeo_header: normalizedCosteoHeader,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.referenceId)
    .eq('store_id', storeId)

  if (updateError) {
    throw new Error(updateError.message)
  }

  const delta = targetQuantity - Number(current.quantity_on_hand ?? 0)
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