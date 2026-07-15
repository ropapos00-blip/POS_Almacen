import { useEffect, useMemo, useState } from 'react'
import { createClientId } from '../../../shared/utils/id'
import { formatCop } from '../../../shared/utils/currency'
import { formatDateTimeColombia } from '../../../shared/utils/dateTime'
import { formatCopInput, parseCopIntegerInput, parseIntegerInput } from '../../../shared/utils/numberInput'
import { useAuthStore } from '../../auth/model/useAuthStore'
import {
  useCreateWholesaleReferenceMutation,
  useDeleteAllWholesaleReferencesMutation,
  useDeleteWholesaleReferenceMutation,
  useUpdateWholesaleReferenceInvestmentMovementMutation,
  useUpdateWholesaleReferenceMutation,
  useWholesaleReferenceInvestmentMovementsQuery,
  useWholesaleInventoryStockQuery,
} from '../model/useWholesaleQueries'
import type {
  WholesaleCostBreakdown,
  WholesaleCosteoHeader,
  WholesaleInventoryRow,
  UpdateWholesaleReferenceInput,
} from '../model/wholesale.types'

interface ColorSizeDraftRow {
  id: string
  color: string
  size: string
  quantity: string
}

interface CustomCostItemDraft {
  id: string
  label: string
  unitCost: string
}

type StockEntryMode = 'form' | 'matrix'

const COST_FIELDS: Array<{ key: keyof WholesaleCostBreakdown; label: string }> = [
  { key: 'tela', label: 'TELA' },
  { key: 'corte', label: 'CORTE' },
  { key: 'plotter', label: 'PLOTTER' },
  { key: 'estampado', label: 'ESTAMPADO' },
  { key: 'disenoEstampa', label: 'DIS. ESTAMPA' },
  { key: 'dacron', label: 'DACRON' },
  { key: 'cuelloRib', label: 'CUELLO RIB' },
  { key: 'entretela', label: 'ENTRELA' },
  { key: 'botones', label: 'BOTONES' },
  { key: 'confeccion', label: 'CONFECCION' },
  { key: 'fletesTela', label: 'FLETES' },
  { key: 'gasolina', label: 'GASOLINA' },
  { key: 'bordado', label: 'BORDADO' },
  { key: 'bolsa', label: 'BOLSA' },
  { key: 'etiqueta', label: 'ETIQUETA' },
  { key: 'marquilla', label: 'MARQUILLA' },
  { key: 'aplique', label: 'APLIQUE' },
  { key: 'varios', label: 'VARIOS' },
  { key: 'impresiones', label: 'IMPRESIONES' },
  { key: 'cintaNit', label: 'CINTA NIT' },
  { key: 'talla', label: 'TALLA' },
  { key: 'plastifle', label: 'PLASTIFLE' },
  { key: 'hiladilla', label: 'HILADILLA' },
  { key: 'cierre', label: 'CIERRE' },
]

const HIDDEN_COST_FIELDS: Array<keyof WholesaleCostBreakdown> = [
  'colorTela',
  'colorTinta',
]

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Operacion no completada.'
}

function createEmptyCostBreakdown(): WholesaleCostBreakdown {
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

function createEmptyCostDraft(): Record<keyof WholesaleCostBreakdown, string> {
  const base = createEmptyCostBreakdown()
  return COST_FIELDS.reduce<Record<keyof WholesaleCostBreakdown, string>>((acc, field) => {
    const safeValue = Number(base[field.key] ?? 0)
    acc[field.key] = safeValue === 0 ? '' : formatCopInput(safeValue)
    return acc
  }, {} as Record<keyof WholesaleCostBreakdown, string>)
}

function parseCostDraft(
  draft: Record<keyof WholesaleCostBreakdown, string>,
  quantity: number,
): WholesaleCostBreakdown {
  const values = createEmptyCostBreakdown()
  const safeQuantity = Math.max(0, Math.trunc(Number(quantity || 0)))
  COST_FIELDS.forEach((field) => {
    const unitValue = Math.max(0, parseCopIntegerInput(draft[field.key] ?? '', 0))
    values[field.key] = safeQuantity > 0 ? unitValue * safeQuantity : 0
  })
  return values
}

function parseUnitCostDraft(
  draft: Record<keyof WholesaleCostBreakdown, string>,
): WholesaleCostBreakdown {
  const values = createEmptyCostBreakdown()
  COST_FIELDS.forEach((field) => {
    values[field.key] = Math.max(0, parseCopIntegerInput(draft[field.key] ?? '', 0))
  })
  return values
}

function toCostDraft(
  costs: WholesaleCostBreakdown,
  quantity: number,
): Record<keyof WholesaleCostBreakdown, string> {
  const safeQuantity = Math.max(0, Math.trunc(Number(quantity || 0)))
  return COST_FIELDS.reduce<Record<keyof WholesaleCostBreakdown, string>>((acc, field) => {
    const totalValue = Math.max(0, Number(costs[field.key] ?? 0))
    const unitValue = safeQuantity > 0 ? Math.round(totalValue / safeQuantity) : totalValue
    acc[field.key] = unitValue > 0 ? formatCopInput(unitValue) : ''
    return acc
  }, {} as Record<keyof WholesaleCostBreakdown, string>)
}

function sumCostBreakdown(costs: WholesaleCostBreakdown) {
  return COST_FIELDS.reduce((acc, field) => acc + Math.max(0, Number(costs[field.key] || 0)), 0)
}

function normalizeSizeLabel(raw: string) {
  return raw.trim().toUpperCase()
}

function normalizeColorLabel(raw: string) {
  return raw.trim().toUpperCase()
}

function sumSizeQuantities(sizeQuantities: Record<string, number>) {
  return Object.values(sizeQuantities).reduce((acc, qty) => acc + Math.max(0, Number(qty || 0)), 0)
}

function createColorSizeRow(color: string, size: string, quantity = ''): ColorSizeDraftRow {
  return {
    id: createClientId(),
    color,
    size,
    quantity,
  }
}

function parseColorSizeRows(rows: ColorSizeDraftRow[]) {
  return rows.reduce<Record<string, Record<string, number>>>((acc, row) => {
    const color = row.color.trim().toUpperCase()
    const size = normalizeSizeLabel(row.size)
    if (!color || !size) {
      return acc
    }

    const qty = Math.max(0, parseIntegerInput(row.quantity || '0', 0))
    if (!acc[color]) {
      acc[color] = {}
    }
    acc[color][size] = (acc[color][size] ?? 0) + qty
    return acc
  }, {})
}

function aggregateSizesFromColorQuantities(colorQuantities: Record<string, Record<string, number>>) {
  return Object.values(colorQuantities).reduce<Record<string, number>>((acc, sizeMap) => {
    Object.entries(sizeMap).forEach(([size, qty]) => {
      const normalized = normalizeSizeLabel(size)
      if (!normalized) {
        return
      }
      acc[normalized] = Math.max(0, Math.trunc(Number(acc[normalized] ?? 0) + Number(qty ?? 0)))
    })
    return acc
  }, {})
}

function toColorSizeRows(colorQuantities: Record<string, Record<string, number>>) {
  const rows: ColorSizeDraftRow[] = []
  Object.entries(colorQuantities).forEach(([color, sizeMap]) => {
    const normalizedColor = color.trim().toUpperCase()
    if (!normalizedColor || !sizeMap || typeof sizeMap !== 'object') {
      return
    }
    Object.entries(sizeMap).forEach(([size, qty]) => {
      const normalizedSize = normalizeSizeLabel(size)
      if (!normalizedSize) {
        return
      }
      const safeQty = Math.max(0, Math.trunc(Number(qty || 0)))
      rows.push(createColorSizeRow(normalizedColor, normalizedSize, safeQty > 0 ? String(safeQty) : ''))
    })
  })

  return rows
}

function toColorSizeRowsFromSizeQuantities(sizeQuantities: Record<string, number>) {
  const rows: ColorSizeDraftRow[] = []
  Object.entries(sizeQuantities).forEach(([size, qty]) => {
    const normalizedSize = normalizeSizeLabel(size)
    if (!normalizedSize) {
      return
    }

    const safeQty = Math.max(0, Math.trunc(Number(qty || 0)))
    rows.push(createColorSizeRow('UNICO', normalizedSize, safeQty > 0 ? String(safeQty) : ''))
  })
  return rows
}

function getUniqueSizesFromRows(rows: ColorSizeDraftRow[]) {
  return Array.from(
    new Set(rows.map((row) => normalizeSizeLabel(row.size)).filter((size) => size.length > 0)),
  )
}

function getUniqueColorsFromRows(rows: ColorSizeDraftRow[]) {
  return Array.from(
    new Set(rows.map((row) => normalizeColorLabel(row.color)).filter((color) => color.length > 0)),
  )
}

function getCellQuantity(rows: ColorSizeDraftRow[], color: string, size: string) {
  const normalizedColor = normalizeColorLabel(color)
  const normalizedSize = normalizeSizeLabel(size)
  const match = rows.find(
    (row) =>
      normalizeColorLabel(row.color) === normalizedColor &&
      normalizeSizeLabel(row.size) === normalizedSize,
  )
  return match?.quantity ?? ''
}

function setCellQuantity(
  rows: ColorSizeDraftRow[],
  color: string,
  size: string,
  quantity: string,
) {
  const normalizedColor = normalizeColorLabel(color)
  const normalizedSize = normalizeSizeLabel(size)
  if (!normalizedColor || !normalizedSize) {
    return rows
  }

  const safeQty = String(Math.max(0, parseIntegerInput(quantity || '0', 0)))
  const index = rows.findIndex(
    (row) =>
      normalizeColorLabel(row.color) === normalizedColor &&
      normalizeSizeLabel(row.size) === normalizedSize,
  )

  if (index === -1) {
    return [...rows, createColorSizeRow(normalizedColor, normalizedSize, safeQty)]
  }

  const next = [...rows]
  next[index] = {
    ...next[index],
    quantity: safeQty,
    color: normalizedColor,
    size: normalizedSize,
  }
  return next
}

function renameColorGroupRows(rows: ColorSizeDraftRow[], oldColor: string, newColor: string) {
  const normalizedOld = normalizeColorLabel(oldColor)
  const normalizedNew = normalizeColorLabel(newColor)
  if (!normalizedOld || !normalizedNew) {
    return rows
  }

  return rows.map((row) =>
    normalizeColorLabel(row.color) === normalizedOld
      ? {
          ...row,
          color: normalizedNew,
        }
      : row,
  )
}

function createEmptyCustomCostItem(): CustomCostItemDraft {
  return {
    id: createClientId(),
    label: '',
    unitCost: '',
  }
}

function toCustomCostDraftRows(header: WholesaleCosteoHeader): CustomCostItemDraft[] {
  return (header.customCostItems ?? []).map((item) => ({
    id: item.id || createClientId(),
    label: item.label,
    unitCost: item.unitCost > 0 ? formatCopInput(item.unitCost) : '',
  }))
}

function sumCustomUnitCost(items: CustomCostItemDraft[]) {
  return items.reduce((acc, item) => acc + Math.max(0, parseCopIntegerInput(item.unitCost ?? '', 0)), 0)
}

function createEmptyCosteoHeader(): WholesaleCosteoHeader {
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
    customCostItems: [],
  }
}

function getUnitCostValue(
  draft: Record<keyof WholesaleCostBreakdown, string>,
  key: keyof WholesaleCostBreakdown,
) {
  return Math.max(0, parseCopIntegerInput(draft[key] ?? '', 0))
}

function getTotalCostValue(
  draft: Record<keyof WholesaleCostBreakdown, string>,
  key: keyof WholesaleCostBreakdown,
  quantity: number,
) {
  const safeQuantity = Math.max(0, Math.trunc(Number(quantity || 0)))
  return getUnitCostValue(draft, key) * safeQuantity
}

export function WholesaleInventoryPage() {
  const user = useAuthStore((state) => state.user)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [reference, setReference] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [costDraft, setCostDraft] = useState<Record<keyof WholesaleCostBreakdown, string>>(
    createEmptyCostDraft(),
  )
  const [colorSizeRows, setColorSizeRows] = useState<ColorSizeDraftRow[]>([])
  const [stockEntryMode, setStockEntryMode] = useState<StockEntryMode>('form')
  const [newColorInput, setNewColorInput] = useState('')
  const [newSizeInput, setNewSizeInput] = useState('')
  const [newQtyInput, setNewQtyInput] = useState('')
  const [costingEnabled, setCostingEnabled] = useState(false)
  const [customCostItems, setCustomCostItems] = useState<CustomCostItemDraft[]>([])
  const [costeoHeader, setCosteoHeader] = useState<WholesaleCosteoHeader>(createEmptyCosteoHeader())
  const [deleteTarget, setDeleteTarget] = useState<WholesaleInventoryRow | null>(null)
  const [detailTarget, setDetailTarget] = useState<WholesaleInventoryRow | null>(null)
  const [showResetInventoryModal, setShowResetInventoryModal] = useState(false)
  const [editTarget, setEditTarget] = useState<WholesaleInventoryRow | null>(null)
  const [editReference, setEditReference] = useState('')
  const [editUnitPrice, setEditUnitPrice] = useState('')
  const [editCostDraft, setEditCostDraft] = useState<Record<keyof WholesaleCostBreakdown, string>>(
    createEmptyCostDraft(),
  )
  const [editColorSizeRows, setEditColorSizeRows] = useState<ColorSizeDraftRow[]>([])
  const [editStockEntryMode, setEditStockEntryMode] = useState<StockEntryMode>('form')
  const [editNewColorInput, setEditNewColorInput] = useState('')
  const [editNewSizeInput, setEditNewSizeInput] = useState('')
  const [editNewQtyInput, setEditNewQtyInput] = useState('')
  const [editCostingEnabled, setEditCostingEnabled] = useState(false)
  const [editCustomCostItems, setEditCustomCostItems] = useState<CustomCostItemDraft[]>([])
  const [editCosteoHeader, setEditCosteoHeader] = useState<WholesaleCosteoHeader>(createEmptyCosteoHeader())
  const [editFeedback, setEditFeedback] = useState<string | null>(null)
  const [investmentDrafts, setInvestmentDrafts] = useState<Record<string, string>>({})
  const [investmentFromDate, setInvestmentFromDate] = useState('')
  const [investmentToDate, setInvestmentToDate] = useState('')

  const inventoryQuery = useWholesaleInventoryStockQuery(user?.storeId)
  const createMutation = useCreateWholesaleReferenceMutation(user?.storeId, user?.id)
  const updateMutation = useUpdateWholesaleReferenceMutation(user?.storeId, user?.id)
  const updateInvestmentMutation = useUpdateWholesaleReferenceInvestmentMovementMutation(user?.storeId)
  const deleteMutation = useDeleteWholesaleReferenceMutation(user?.storeId)
  const deleteAllMutation = useDeleteAllWholesaleReferencesMutation(user?.storeId)
  const referenceInvestmentsQuery = useWholesaleReferenceInvestmentMovementsQuery(
    user?.storeId,
    editTarget?.variantId,
  )

  const parsedColorQuantities = useMemo(() => parseColorSizeRows(colorSizeRows), [colorSizeRows])
  const parsedAggregatedSizeQuantities = useMemo(
    () => aggregateSizesFromColorQuantities(parsedColorQuantities),
    [parsedColorQuantities],
  )
  const effectiveSizeQuantities = useMemo(() => parsedAggregatedSizeQuantities, [parsedAggregatedSizeQuantities])
  const totalQuantity = useMemo(() => sumSizeQuantities(effectiveSizeQuantities), [effectiveSizeQuantities])
  const parsedBaseCosts = useMemo(() => parseCostDraft(costDraft, totalQuantity), [costDraft, totalQuantity])
  const customTotalInvestment = useMemo(
    () => sumCustomUnitCost(customCostItems) * Math.max(0, Math.trunc(totalQuantity || 0)),
    [customCostItems, totalQuantity],
  )
  const parsedCosts = useMemo(() => {
    const next = { ...parsedBaseCosts }
    next.varios = Math.max(0, Number(next.varios || 0) + customTotalInvestment)
    return next
  }, [customTotalInvestment, parsedBaseCosts])
  const totalInvestment = useMemo(() => sumCostBreakdown(parsedCosts), [parsedCosts])
  const unitInvestment = useMemo(() => {
    if (totalQuantity <= 0) {
      return 0
    }

    return Math.round(totalInvestment / totalQuantity)
  }, [totalInvestment, totalQuantity])

  const parsedEditColorQuantities = useMemo(() => parseColorSizeRows(editColorSizeRows), [editColorSizeRows])
  const parsedEditAggregatedSizeQuantities = useMemo(
    () => aggregateSizesFromColorQuantities(parsedEditColorQuantities),
    [parsedEditColorQuantities],
  )
  const effectiveEditSizeQuantities = useMemo(
    () => parsedEditAggregatedSizeQuantities,
    [parsedEditAggregatedSizeQuantities],
  )
  const editTotalQuantity = useMemo(
    () => sumSizeQuantities(effectiveEditSizeQuantities),
    [effectiveEditSizeQuantities],
  )
  const parsedEditBaseCosts = useMemo(
    () => parseCostDraft(editCostDraft, editTotalQuantity),
    [editCostDraft, editTotalQuantity],
  )
  const editCustomTotalInvestment = useMemo(
    () => sumCustomUnitCost(editCustomCostItems) * Math.max(0, Math.trunc(editTotalQuantity || 0)),
    [editCustomCostItems, editTotalQuantity],
  )
  const parsedEditCosts = useMemo(() => {
    const next = { ...parsedEditBaseCosts }
    next.varios = Math.max(0, Number(next.varios || 0) + editCustomTotalInvestment)
    return next
  }, [editCustomTotalInvestment, parsedEditBaseCosts])
  const editTotalInvestment = useMemo(() => sumCostBreakdown(parsedEditCosts), [parsedEditCosts])
  const editUnitInvestment = useMemo(() => {
    if (editTotalQuantity <= 0) {
      return 0
    }

    return Math.round(editTotalInvestment / editTotalQuantity)
  }, [editTotalInvestment, editTotalQuantity])

  useEffect(() => {
    if (!deleteTarget && !showResetInventoryModal && !editTarget) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDeleteTarget(null)
        setShowResetInventoryModal(false)
        setEditTarget(null)
        setEditFeedback(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [deleteTarget, editTarget, showResetInventoryModal])

  useEffect(() => {
    if (!editTarget) {
      return
    }

    setEditReference(editTarget.reference)
    setEditUnitPrice(formatCopInput(editTarget.unitPrice))
    setEditCostDraft(toCostDraft(editTarget.costBreakdownUnit, 1))
    const mappedColorRows = toColorSizeRows(editTarget.colorQuantities)
    setEditColorSizeRows(
      mappedColorRows.length > 0
        ? mappedColorRows
        : toColorSizeRowsFromSizeQuantities(editTarget.sizeQuantities),
    )
    setEditNewColorInput('')
    setEditNewSizeInput('')
    setEditNewQtyInput('')
    setEditCostingEnabled(editTarget.totalInvestment > 0)
    setEditCosteoHeader(editTarget.costeoHeader)
    setEditCustomCostItems(toCustomCostDraftRows(editTarget.costeoHeader))
    setEditFeedback(null)
    setInvestmentFromDate('')
    setInvestmentToDate('')
  }, [editTarget])

  useEffect(() => {
    const rows = referenceInvestmentsQuery.data ?? []
    const nextDrafts: Record<string, string> = {}

    rows.forEach((row) => {
      nextDrafts[row.id] = formatCopInput(row.amount)
    })

    setInvestmentDrafts(nextDrafts)
  }, [referenceInvestmentsQuery.data])

  const filteredRows = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    const rows = inventoryQuery.data ?? []
    const output = rows.filter((row) => {
      if (!query) {
        return true
      }

      return row.reference.toLowerCase().includes(query) || row.productName.toLowerCase().includes(query)
    })

    return output.sort((a, b) => a.reference.localeCompare(b.reference, 'es'))
  }, [inventoryQuery.data, searchText])

  const filteredInvestmentRows = useMemo(() => {
    const rows = referenceInvestmentsQuery.data ?? []
    return rows.filter((row) => {
      if (investmentFromDate && row.movement_date < investmentFromDate) {
        return false
      }

      if (investmentToDate && row.movement_date > investmentToDate) {
        return false
      }

      return true
    })
  }, [investmentFromDate, investmentToDate, referenceInvestmentsQuery.data])

  function resetForm() {
    setReference('')
    setUnitPrice('')
    setCostDraft(createEmptyCostDraft())
    setColorSizeRows([])
    setCostingEnabled(false)
    setCustomCostItems([])
    setCosteoHeader(createEmptyCosteoHeader())
    setNewColorInput('')
    setNewSizeInput('')
    setNewQtyInput('')
  }

  function openEditModal(row: WholesaleInventoryRow) {
    setEditTarget(row)
    setEditFeedback(null)
  }

  function closeEditModal() {
    setEditTarget(null)
    setEditFeedback(null)
    setInvestmentDrafts({})
    setInvestmentFromDate('')
    setInvestmentToDate('')
    setEditCostingEnabled(false)
    setEditColorSizeRows([])
    setEditCustomCostItems([])
    setEditCosteoHeader(createEmptyCosteoHeader())
    setEditNewColorInput('')
    setEditNewSizeInput('')
    setEditNewQtyInput('')
  }

  function updateCosteoHeaderField(
    key: keyof WholesaleCosteoHeader,
    value: string,
    isEdit = false,
  ) {
    if (isEdit) {
      setEditCosteoHeader((prev) => ({ ...prev, [key]: value }))
      return
    }

    setCosteoHeader((prev) => ({ ...prev, [key]: value }))
  }

  function removeColorSizeRow(id: string, isEdit = false) {
    if (isEdit) {
      setEditColorSizeRows((prev) => prev.filter((row) => row.id !== id))
      return
    }

    setColorSizeRows((prev) => prev.filter((row) => row.id !== id))
  }

  function updateColorSizeRow(
    id: string,
    field: 'color' | 'size' | 'quantity',
    value: string,
    isEdit = false,
  ) {
    const updater = (rows: ColorSizeDraftRow[]) =>
      rows.map((row) => {
        if (row.id !== id) {
          return row
        }

        return {
          ...row,
          [field]: field === 'quantity' ? String(Math.max(0, parseIntegerInput(value, 0))) : value,
        }
      })

    if (isEdit) {
      setEditColorSizeRows((prev) => updater(prev))
      return
    }

    setColorSizeRows((prev) => updater(prev))
  }

  function removeColorGroup(rawColor: string, isEdit = false) {
    const color = normalizeColorLabel(rawColor)
    if (!color) {
      return
    }

    if (isEdit) {
      setEditColorSizeRows((prev) => prev.filter((row) => normalizeColorLabel(row.color) !== color))
      return
    }

    setColorSizeRows((prev) => prev.filter((row) => normalizeColorLabel(row.color) !== color))
  }

  function removeSizeGlobal(rawSize: string, isEdit = false) {
    const size = normalizeSizeLabel(rawSize)
    if (!size) {
      return
    }

    if (isEdit) {
      setEditColorSizeRows((prev) => prev.filter((row) => normalizeSizeLabel(row.size) !== size))
      return
    }

    setColorSizeRows((prev) => prev.filter((row) => normalizeSizeLabel(row.size) !== size))
  }

  function addCustomRow(rawColor: string, rawSize: string, rawQty: string, isEdit = false) {
    const color = normalizeColorLabel(rawColor)
    const size = normalizeSizeLabel(rawSize)
    if (!color || !size) {
      return
    }

    const qty = String(Math.max(0, parseIntegerInput(rawQty || '0', 0)))
    const row = createColorSizeRow(color, size, qty)

    if (isEdit) {
      setEditColorSizeRows((prev) => [...prev, row])
      setEditNewSizeInput('')
      setEditNewQtyInput('')
      return
    }

    setColorSizeRows((prev) => [...prev, row])
    setNewSizeInput('')
    setNewQtyInput('')
  }

  function handleQuickAddQuantityEnter(event: React.KeyboardEvent<HTMLInputElement>, isEdit = false) {
    if (event.key !== 'Enter') {
      return
    }

    event.preventDefault()
    if (isEdit) {
      addCustomRow(editNewColorInput, editNewSizeInput, editNewQtyInput, true)
      return
    }

    addCustomRow(newColorInput, newSizeInput, newQtyInput, false)
  }

  function addSizeToColor(rawColor: string, isEdit = false) {
    const color = normalizeColorLabel(rawColor)
    if (!color) {
      return
    }

    const nextRow = createColorSizeRow(color, '', '')
    if (isEdit) {
      setEditColorSizeRows((prev) => [...prev, nextRow])
      return
    }

    setColorSizeRows((prev) => [...prev, nextRow])
  }

  function renameColorGroup(oldColor: string, newColor: string, isEdit = false) {
    if (isEdit) {
      setEditColorSizeRows((prev) => renameColorGroupRows(prev, oldColor, newColor))
      return
    }

    setColorSizeRows((prev) => renameColorGroupRows(prev, oldColor, newColor))
  }

  function updateMatrixCell(color: string, size: string, quantity: string, isEdit = false) {
    if (isEdit) {
      setEditColorSizeRows((prev) => setCellQuantity(prev, color, size, quantity))
      return
    }

    setColorSizeRows((prev) => setCellQuantity(prev, color, size, quantity))
  }

  function updateCostField(key: keyof WholesaleCostBreakdown, value: string, isEdit = false) {
    if (isEdit) {
      setEditCostDraft((prev) => ({
        ...prev,
        [key]: formatCopInput(value),
      }))
      return
    }

    setCostDraft((prev) => ({
      ...prev,
      [key]: formatCopInput(value),
    }))
  }

  function addCustomCostItem(isEdit = false) {
    if (isEdit) {
      setEditCustomCostItems((prev) => [...prev, createEmptyCustomCostItem()])
      return
    }

    setCustomCostItems((prev) => [...prev, createEmptyCustomCostItem()])
  }

  function updateCustomCostItem(
    id: string,
    field: 'label' | 'unitCost',
    value: string,
    isEdit = false,
  ) {
    const updater = (rows: CustomCostItemDraft[]) =>
      rows.map((row) => {
        if (row.id !== id) {
          return row
        }

        if (field === 'unitCost') {
          return {
            ...row,
            unitCost: formatCopInput(value),
          }
        }

        return {
          ...row,
          label: value,
        }
      })

    if (isEdit) {
      setEditCustomCostItems((prev) => updater(prev))
      return
    }

    setCustomCostItems((prev) => updater(prev))
  }

  function removeCustomCostItem(id: string, isEdit = false) {
    if (isEdit) {
      setEditCustomCostItems((prev) => prev.filter((item) => item.id !== id))
      return
    }

    setCustomCostItems((prev) => prev.filter((item) => item.id !== id))
  }

  async function saveReference() {
    if (!user?.id) {
      setFeedback('Usuario no valido para gestionar inventario de confeccion.')
      return
    }

    const parsedUnitPrice = Math.max(0, parseCopIntegerInput(unitPrice, 0))

    if (!reference.trim()) {
      setFeedback('La referencia es obligatoria.')
      return
    }

    if (!Number.isFinite(parsedUnitPrice)) {
      setFeedback('Valor unitario invalido.')
      return
    }

    if (totalQuantity > 0 && totalInvestment <= 0) {
      setFeedback('Debes indicar los insumos para calcular la inversion total.')
      return
    }

    try {
      setFeedback(null)

      const customItemsPayload = customCostItems
        .map((item) => ({
          id: item.id,
          label: item.label.trim(),
          unitCost: Math.max(0, parseCopIntegerInput(item.unitCost, 0)),
        }))
        .filter((item) => item.label.length > 0)

      const result = await createMutation.mutateAsync({
        reference,
        quantityOnHand: totalQuantity,
        unitPrice: parsedUnitPrice,
        investmentAmount: totalInvestment,
        costBreakdown: parsedCosts,
        costBreakdownUnit: parseUnitCostDraft(costDraft),
        sizeQuantities: effectiveSizeQuantities,
        colorQuantities: parsedColorQuantities,
        designEnabled: false,
        costeoHeader: {
          ...costeoHeader,
          customCostItems: customItemsPayload,
        },
      })

      if (result?.action === 'restocked') {
        setFeedback(
          `Referencia ${result.reference} ya existia. Se agregaron unidades. Nuevo stock: ${result.finalQuantity}. Inversion registrada: ${formatCop(totalInvestment)}.`,
        )
      } else {
        setFeedback(
          `Referencia ${reference.trim().toUpperCase()} creada en inventario de confeccion. Inversion registrada: ${formatCop(totalInvestment)}.`,
        )
      }

      resetForm()
    } catch (error) {
      setFeedback(getErrorMessage(error))
    }
  }

  async function saveReferenceFromModal() {
    if (!editTarget) {
      return
    }

    const parsedUnitPrice = Math.max(0, parseCopIntegerInput(editUnitPrice, 0))

    if (!editReference.trim()) {
      setEditFeedback('La referencia es obligatoria.')
      return
    }

    if (!Number.isFinite(parsedUnitPrice)) {
      setEditFeedback('Valor unitario invalido.')
      return
    }

    try {
      const customItemsPayload = editCustomCostItems
        .map((item) => ({
          id: item.id,
          label: item.label.trim(),
          unitCost: Math.max(0, parseCopIntegerInput(item.unitCost, 0)),
        }))
        .filter((item) => item.label.length > 0)

      const payload: UpdateWholesaleReferenceInput = {
        referenceId: editTarget.variantId,
        reference: editReference,
        quantityOnHand: editTotalQuantity,
        unitPrice: parsedUnitPrice,
        costBreakdown: parsedEditCosts,
        costBreakdownUnit: parseUnitCostDraft(editCostDraft),
        sizeQuantities: effectiveEditSizeQuantities,
        colorQuantities: parsedEditColorQuantities,
        designEnabled: false,
        costeoHeader: {
          ...editCosteoHeader,
          customCostItems: customItemsPayload,
        },
      }

      await updateMutation.mutateAsync(payload)
      setFeedback(`Referencia ${editReference.trim()} actualizada.`)
      closeEditModal()
    } catch (error) {
      setEditFeedback(getErrorMessage(error))
    }
  }

  async function saveInvestmentAmount(movementId: string) {
    const parsedAmount = parseCopIntegerInput(investmentDrafts[movementId] ?? '', 0)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setEditFeedback('El monto de inversion debe ser mayor a cero.')
      return
    }

    try {
      await updateInvestmentMutation.mutateAsync({
        movementId,
        amount: parsedAmount,
      })
      setEditFeedback('Monto de inversion actualizado correctamente.')
    } catch (error) {
      setEditFeedback(getErrorMessage(error))
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) {
      return
    }

    const deletingReference = deleteTarget.reference
    const deletingReferenceId = deleteTarget.variantId

    try {
      await deleteMutation.mutateAsync(deletingReferenceId)
      setFeedback(`Referencia ${deletingReference} eliminada del inventario de confeccion.`)
      if (editTarget?.variantId === deletingReferenceId) {
        closeEditModal()
      }
    } catch (error) {
      setFeedback(getErrorMessage(error))
    } finally {
      setDeleteTarget(null)
    }
  }

  async function confirmDeleteAllInventory() {
    try {
      const result = await deleteAllMutation.mutateAsync()
      resetForm()
      setDeleteTarget(null)
      setShowResetInventoryModal(false)
      setFeedback(
        result.affectedRows > 0
          ? `Inventario de confeccion reiniciado. Referencias eliminadas: ${result.affectedRows}.`
          : 'No habia referencias activas para eliminar.',
      )
    } catch (error) {
      setFeedback(getErrorMessage(error))
    }
  }

  if (!user?.storeId) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <h1 className="text-2xl font-semibold text-zinc-100">Inventario Confeccion</h1>
        <p className="mt-2 text-zinc-400">No hay tienda activa asociada al usuario.</p>
      </section>
    )
  }

  return (
    <section className="space-y-6">
      <article className="min-w-0 space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-100">Inventario Confeccion</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Modulo aparte del inventario retail. Referencia, tallas, costos por insumo y valor unitario.
        </p>
        {feedback ? <p className="mt-2 text-sm text-amber-300">{feedback}</p> : null}
      </header>

      <div>
        <h2 className="text-sm font-semibold text-zinc-100">Crear referencia</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Cada referencia inicia en cero por defecto y es exclusiva de confeccion.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <label className="space-y-1">
            <span className="text-xs text-zinc-400">Referencia</span>
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-zinc-400">Cantidad total</span>
            <input
              type="number"
              value={totalQuantity}
              readOnly
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-zinc-400">Valor unitario (COP)</span>
            <input
              type="text"
              inputMode="numeric"
              value={unitPrice}
              placeholder="0"
              onChange={(event) => setUnitPrice(formatCopInput(event.target.value))}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-zinc-400">Inversion total (COP)</span>
            <input
              type="text"
              value={formatCop(totalInvestment)}
              readOnly
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-zinc-400">Inversion unidad (COP)</span>
            <input
              type="text"
              value={formatCop(unitInvestment)}
              readOnly
              className="w-full rounded-lg border border-emerald-700/40 bg-zinc-900 px-3 py-2 text-sm font-medium text-emerald-300"
            />
            <span className="text-[11px] text-zinc-500">Inversion total / cantidad total</span>
          </label>
        </div>

        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <h3 className="text-sm font-semibold text-zinc-100">Costeo polos-camisetas</h3>
          <div className="mt-3 grid gap-2 md:grid-cols-4 xl:grid-cols-6">
            <label className="space-y-1">
              <span className="text-xs text-zinc-400">Fecha</span>
              <input
                type="date"
                value={costeoHeader.fecha}
                onChange={(event) => updateCosteoHeaderField('fecha', event.target.value)}
                onFocus={(event) => {
                  event.currentTarget.showPicker?.()
                }}
                onClick={(event) => {
                  event.currentTarget.showPicker?.()
                }}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 scheme-dark"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-400">Cortador</span>
              <input
                value={costeoHeader.cortador}
                onChange={(event) => updateCosteoHeaderField('cortador', event.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-400">Curva corte</span>
              <input
                value={costeoHeader.curvaCorte}
                onChange={(event) => updateCosteoHeaderField('curvaCorte', event.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-400">Promedio</span>
              <input
                value={costeoHeader.promedio}
                onChange={(event) => updateCosteoHeaderField('promedio', event.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-400">Tipo de tela</span>
              <input
                value={costeoHeader.tipoTela}
                onChange={(event) => updateCosteoHeaderField('tipoTela', event.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-400">No. de rollos</span>
              <input
                value={costeoHeader.numeroRollos}
                onChange={(event) => updateCosteoHeaderField('numeroRollos', event.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-400">Largo trazo</span>
              <input
                value={costeoHeader.largoTrazo}
                onChange={(event) => updateCosteoHeaderField('largoTrazo', event.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-400">Ancho trazo</span>
              <input
                value={costeoHeader.anchoTrazo}
                onChange={(event) => updateCosteoHeaderField('anchoTrazo', event.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-400">Rendimiento</span>
              <input
                value={costeoHeader.rendimiento}
                onChange={(event) => updateCosteoHeaderField('rendimiento', event.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 md:col-span-2 xl:col-span-3">
              <span className="text-xs text-zinc-400">Modelo</span>
              <input
                value={costeoHeader.modelo}
                onChange={(event) => updateCosteoHeaderField('modelo', event.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              />
            </label>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="mr-auto">
              <h3 className="text-sm font-semibold text-zinc-100">Stock confeccion (color + talla)</h3>
              <p className="text-xs text-zinc-500">Un solo formulario. Ejemplo: 10 S negras, 20 S rojas.</p>
            </div>
            <div className="inline-flex rounded-lg border border-zinc-700 bg-zinc-900/70 p-1">
              <button
                type="button"
                onClick={() => setStockEntryMode('form')}
                className={`rounded-md px-2 py-1 text-xs ${stockEntryMode === 'form' ? 'bg-zinc-200 text-zinc-900' : 'text-zinc-300'}`}
              >
                Formulario
              </button>
              <button
                type="button"
                onClick={() => setStockEntryMode('matrix')}
                className={`rounded-md px-2 py-1 text-xs ${stockEntryMode === 'matrix' ? 'bg-zinc-200 text-zinc-900' : 'text-zinc-300'}`}
              >
                Matriz
              </button>
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            <div className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-2 md:grid-cols-[1fr_1fr_140px_auto]">
              <input
                value={newColorInput}
                onChange={(event) => setNewColorInput(event.target.value)}
                placeholder="Color"
                className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs"
              />
              <input
                value={newSizeInput}
                onChange={(event) => setNewSizeInput(event.target.value)}
                placeholder="Talla"
                className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs"
              />
              <input
                type="number"
                min={0}
                step={1}
                value={newQtyInput}
                onChange={(event) => setNewQtyInput(event.target.value)}
                onKeyDown={(event) => handleQuickAddQuantityEnter(event, false)}
                placeholder="Cantidad"
                className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs"
              />
              <button
                type="button"
                onClick={() => addCustomRow(newColorInput, newSizeInput, newQtyInput, false)}
                className="rounded-md border border-zinc-700 px-2 py-2 text-xs text-zinc-200"
              >
                Agregar linea
              </button>
            </div>
            {colorSizeRows.length === 0 ? (
              <p className="text-xs text-zinc-500">Usa la primera linea para empezar y luego agrega las que necesites.</p>
            ) : null}
            {colorSizeRows.length > 0 && stockEntryMode === 'matrix' ? (
              <div className="ghost-scrollbar overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/40">
                <table className="min-w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="px-2 py-2 text-left text-zinc-300">Color</th>
                      {getUniqueSizesFromRows(colorSizeRows).map((size) => (
                        <th key={size} className="px-2 py-2 text-zinc-300">
                          <div className="flex items-center justify-center gap-1">
                            <span>{size}</span>
                            <button
                              type="button"
                              onClick={() => removeSizeGlobal(size, false)}
                              className="inline-flex h-4 w-4 items-center justify-center rounded border border-rose-500/40 text-[10px] leading-none text-rose-300"
                              title={`Quitar talla ${size}`}
                            >
                              X
                            </button>
                          </div>
                        </th>
                      ))}
                      <th className="px-2 py-2 text-left text-zinc-300">Accion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getUniqueColorsFromRows(colorSizeRows).map((color) => (
                      <tr key={color} className="border-b border-zinc-900/70">
                        <td className="px-2 py-2 font-semibold text-zinc-200">{color}</td>
                        {getUniqueSizesFromRows(colorSizeRows).map((size) => (
                          <td key={`${color}-${size}`} className="px-2 py-2 text-center">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={getCellQuantity(colorSizeRows, color, size)}
                              placeholder="0"
                              onChange={(event) => updateMatrixCell(color, size, event.target.value, false)}
                              className="mx-auto w-20 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs"
                            />
                          </td>
                        ))}
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => removeColorGroup(color, false)}
                            className="rounded-lg border border-rose-500/40 px-2 py-1 text-xs text-rose-300"
                          >
                            Quitar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {colorSizeRows.length > 0 && stockEntryMode === 'form' ? (
              <div className="space-y-3">
                {getUniqueColorsFromRows(colorSizeRows).map((color) => (
                  <div key={color} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-xs text-zinc-400">Color</span>
                      <input
                        value={color}
                        onChange={(event) => renameColorGroup(color, event.target.value, false)}
                        className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => addSizeToColor(color, false)}
                        className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200"
                      >
                        Agregar talla a este color
                      </button>
                      <button
                        type="button"
                        onClick={() => removeColorGroup(color, false)}
                        className="ml-auto rounded-md border border-rose-500/40 px-2 py-1 text-xs text-rose-300"
                      >
                        Quitar color
                      </button>
                    </div>
                    <div className="space-y-2">
                      {colorSizeRows
                        .filter((row) => normalizeColorLabel(row.color) === color)
                        .map((row) => (
                          <div key={row.id} className="grid gap-2 md:grid-cols-[120px_140px_auto]">
                            <input
                              value={row.size}
                              onChange={(event) => updateColorSizeRow(row.id, 'size', event.target.value, false)}
                              placeholder="Talla"
                              className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs"
                            />
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={row.quantity}
                              placeholder="Cantidad"
                              onChange={(event) => updateColorSizeRow(row.id, 'quantity', event.target.value, false)}
                              className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => removeColorSizeRow(row.id, false)}
                              className="rounded-md border border-zinc-700 px-2 py-2 text-xs text-zinc-200"
                            >
                              Quitar fila
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <button
            type="button"
            onClick={() => setCostingEnabled((prev) => !prev)}
            className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200"
          >
            {costingEnabled ? 'Ocultar formulario de costo de confeccion' : 'Agregar formulario de costo de confeccion'}
          </button>

          {costingEnabled ? (
            <>
              <div className="mt-3 grid grid-cols-[1.2fr_1fr_1fr] gap-2 text-xs text-zinc-400">
                <p>INSUMO</p>
                <p>UNIDAD</p>
                <p>TOTAL</p>
              </div>
              <div className="mt-2 space-y-2">
                {COST_FIELDS.map((field) => (
                  <div key={field.key} className="grid grid-cols-[1.2fr_1fr_1fr] gap-2">
                    <input
                      value={field.label}
                      readOnly
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={costDraft[field.key]}
                      placeholder="0"
                      onChange={(event) => updateCostField(field.key, event.target.value, false)}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      value={formatCop(getTotalCostValue(costDraft, field.key, totalQuantity))}
                      readOnly
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300"
                    />
                  </div>
                ))}
              </div>

              <div className="mt-4 border-t border-zinc-800 pt-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-zinc-300">INSUMOS PERSONALIZADOS</p>
                  <button
                    type="button"
                    onClick={() => addCustomCostItem(false)}
                    className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200"
                  >
                    Agregar item
                  </button>
                </div>

                <div className="space-y-2">
                  {customCostItems.map((item) => (
                    <div key={item.id} className="grid grid-cols-[1.2fr_1fr_1fr_auto] gap-2">
                      <input
                        value={item.label}
                        onChange={(event) => updateCustomCostItem(item.id, 'label', event.target.value, false)}
                        placeholder="Nombre del insumo"
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={item.unitCost}
                        placeholder="0"
                        onChange={(event) => updateCustomCostItem(item.id, 'unitCost', event.target.value, false)}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        value={formatCop(
                          Math.max(0, parseCopIntegerInput(item.unitCost, 0)) * Math.max(0, Math.trunc(totalQuantity || 0)),
                        )}
                        readOnly
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300"
                      />
                      <button
                        type="button"
                        onClick={() => removeCustomCostItem(item.id, false)}
                        className="rounded-md border border-rose-500/40 px-2 py-2 text-xs text-rose-300"
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-400">
                Los items personalizados se suman al costo total y se guardan en este mismo formulario.
              </div>

              {HIDDEN_COST_FIELDS.length > 0 ? (
                <div className="sr-only">
                  {HIDDEN_COST_FIELDS.map((key) => (
                    <input key={key} value={costDraft[key]} readOnly />
                  ))}
                </div>
              ) : null}

            </>
          ) : null}
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              resetForm()
            }}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
          >
            Limpiar
          </button>
          <button
            type="button"
            onClick={() => {
              void saveReference()
            }}
            disabled={createMutation.isPending}
            className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-70"
          >
            {createMutation.isPending ? 'Guardando...' : 'Crear referencia'}
          </button>
        </div>
      </div>
      </article>

      <article className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Buscar por referencia"
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowResetInventoryModal(true)}
            disabled={filteredRows.length === 0 || deleteAllMutation.isPending}
            className="rounded-lg border border-rose-500/40 px-3 py-2 text-sm font-medium text-rose-300 disabled:opacity-60"
          >
            Reiniciar inventario
          </button>
        </div>

        <ul className="ghost-scrollbar mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
          {filteredRows.map((row) => (
            <li key={row.variantId} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-zinc-200">{row.reference}</p>
                <p className="text-xl font-semibold text-emerald-300">{row.quantityOnHand}</p>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setDetailTarget(row)}
                  className="rounded-md border border-amber-400/40 px-2 py-1 text-xs text-amber-300"
                >
                  Detalles
                </button>
                <button
                  type="button"
                  onClick={() => openEditModal(row)}
                  className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(row)}
                  className="rounded-md border border-rose-500/40 px-2 py-1 text-xs text-rose-300"
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      </article>

      {detailTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 py-8"
          onClick={() => setDetailTarget(null)}
        >
          <div
            className="ghost-scrollbar w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-5"
            onClick={(event) => { event.stopPropagation() }}
          >
            <h3 className="text-lg font-semibold text-zinc-100">{detailTarget.reference}</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-zinc-500">Cantidad</p>
                <p className="text-2xl font-bold text-emerald-300">{detailTarget.quantityOnHand}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Valor unitario</p>
                <p className="text-sm font-semibold text-zinc-200">{formatCop(detailTarget.unitPrice)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Inversion total</p>
                <p className="text-sm font-semibold text-zinc-200">{formatCop(detailTarget.totalInvestment)}</p>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-xs font-semibold text-zinc-400">Tallas activas</p>
              <p className="mt-1 text-xs text-zinc-300">
                {Object.entries(detailTarget.sizeQuantities)
                  .filter(([, v]) => v > 0)
                  .map(([k, v]) => `${k} (${v})`)
                  .join(', ') || 'Sin tallas cargadas'}
              </p>
            </div>
            <div className="mt-3">
              <p className="text-xs font-semibold text-zinc-400">Colores y tallas activos</p>
              <div className="mt-1 space-y-1">
                {Object.entries(detailTarget.colorQuantities)
                  .filter(([, sizes]) => Object.values(sizes ?? {}).some((qty) => Number(qty) > 0))
                  .map(([color, sizes]) => (
                    <p key={color} className="text-xs text-zinc-300">
                      <span className="font-medium text-zinc-200">{color}:</span>{' '}
                      {Object.entries(sizes ?? {})
                        .filter(([, v]) => Number(v) > 0)
                        .map(([size, qty]) => `${size} (${qty})`)
                        .join(', ')}
                    </p>
                  ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDetailTarget(null)}
              className="mt-5 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200"
            >
              Cerrar
            </button>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 py-8"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5"
            onClick={(event) => {
              event.stopPropagation()
            }}
          >
            <h3 className="text-lg font-semibold text-zinc-100">Confirmar eliminacion</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Seguro que deseas eliminar la referencia {deleteTarget.reference}? Esta accion la oculta del inventario de confeccion.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  void confirmDelete()
                }}
                disabled={deleteMutation.isPending}
                className="rounded-lg bg-rose-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
              >
                {deleteMutation.isPending ? 'Eliminando...' : 'Si, eliminar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 py-8"
          onClick={closeEditModal}
        >
          <div
            className="w-full max-w-5xl rounded-2xl border border-zinc-700 bg-zinc-900 p-5"
            onClick={(event) => {
              event.stopPropagation()
            }}
          >
            <h3 className="text-lg font-semibold text-zinc-100">Editar referencia de confeccion</h3>
            <p className="mt-1 text-xs text-zinc-500">Referencia seleccionada: {editTarget.reference}</p>

            <div className="mt-4 grid gap-3 md:grid-cols-5">
              <label className="space-y-1">
                <span className="text-xs text-zinc-400">Referencia</span>
                <input
                  value={editReference}
                  onChange={(event) => setEditReference(event.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-zinc-400">Cantidad total</span>
                <input
                  type="number"
                  value={editTotalQuantity}
                  readOnly
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-zinc-400">Valor unitario (COP)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={editUnitPrice}
                  onChange={(event) => setEditUnitPrice(formatCopInput(event.target.value))}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-zinc-400">Inversion total (COP)</span>
                <input
                  type="text"
                  value={formatCop(editTotalInvestment)}
                  readOnly
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-zinc-400">Inversion unidad (COP)</span>
                <input
                  type="text"
                  value={formatCop(editUnitInvestment)}
                  readOnly
                  className="w-full rounded-lg border border-emerald-700/40 bg-zinc-900 px-3 py-2 text-sm font-medium text-emerald-300"
                />
                <span className="text-[11px] text-zinc-500">Inversion total / cantidad total</span>
              </label>
            </div>

            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <h4 className="text-sm font-semibold text-zinc-100">Costeo polos-camisetas</h4>
              <div className="mt-3 grid gap-2 md:grid-cols-4 xl:grid-cols-6">
                <label className="space-y-1">
                  <span className="text-xs text-zinc-400">Fecha</span>
                  <input
                    type="date"
                    value={editCosteoHeader.fecha}
                    onChange={(event) => updateCosteoHeaderField('fecha', event.target.value, true)}
                    onFocus={(event) => {
                      event.currentTarget.showPicker?.()
                    }}
                    onClick={(event) => {
                      event.currentTarget.showPicker?.()
                    }}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 scheme-dark"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-zinc-400">Cortador</span>
                  <input
                    value={editCosteoHeader.cortador}
                    onChange={(event) => updateCosteoHeaderField('cortador', event.target.value, true)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-zinc-400">Curva corte</span>
                  <input
                    value={editCosteoHeader.curvaCorte}
                    onChange={(event) => updateCosteoHeaderField('curvaCorte', event.target.value, true)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-zinc-400">Promedio</span>
                  <input
                    value={editCosteoHeader.promedio}
                    onChange={(event) => updateCosteoHeaderField('promedio', event.target.value, true)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-zinc-400">Tipo de tela</span>
                  <input
                    value={editCosteoHeader.tipoTela}
                    onChange={(event) => updateCosteoHeaderField('tipoTela', event.target.value, true)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-zinc-400">No. de rollos</span>
                  <input
                    value={editCosteoHeader.numeroRollos}
                    onChange={(event) => updateCosteoHeaderField('numeroRollos', event.target.value, true)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-zinc-400">Largo trazo</span>
                  <input
                    value={editCosteoHeader.largoTrazo}
                    onChange={(event) => updateCosteoHeaderField('largoTrazo', event.target.value, true)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-zinc-400">Ancho trazo</span>
                  <input
                    value={editCosteoHeader.anchoTrazo}
                    onChange={(event) => updateCosteoHeaderField('anchoTrazo', event.target.value, true)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-zinc-400">Rendimiento</span>
                  <input
                    value={editCosteoHeader.rendimiento}
                    onChange={(event) => updateCosteoHeaderField('rendimiento', event.target.value, true)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1 md:col-span-2 xl:col-span-3">
                  <span className="text-xs text-zinc-400">Modelo</span>
                  <input
                    value={editCosteoHeader.modelo}
                    onChange={(event) => updateCosteoHeaderField('modelo', event.target.value, true)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  />
                </label>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="mr-auto">
                  <h4 className="text-sm font-semibold text-zinc-100">Stock confeccion (color + talla)</h4>
                  <p className="text-xs text-zinc-500">Un solo formulario para editar cantidades por combinacion.</p>
                </div>
                <div className="inline-flex rounded-lg border border-zinc-700 bg-zinc-900/70 p-1">
                  <button
                    type="button"
                    onClick={() => setEditStockEntryMode('form')}
                    className={`rounded-md px-2 py-1 text-xs ${editStockEntryMode === 'form' ? 'bg-zinc-200 text-zinc-900' : 'text-zinc-300'}`}
                  >
                    Formulario
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditStockEntryMode('matrix')}
                    className={`rounded-md px-2 py-1 text-xs ${editStockEntryMode === 'matrix' ? 'bg-zinc-200 text-zinc-900' : 'text-zinc-300'}`}
                  >
                    Matriz
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-2">
                <div className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-2 md:grid-cols-[1fr_1fr_140px_auto]">
                  <input
                    value={editNewColorInput}
                    onChange={(event) => setEditNewColorInput(event.target.value)}
                    placeholder="Color"
                    className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs"
                  />
                  <input
                    value={editNewSizeInput}
                    onChange={(event) => setEditNewSizeInput(event.target.value)}
                    placeholder="Talla"
                    className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs"
                  />
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={editNewQtyInput}
                    onChange={(event) => setEditNewQtyInput(event.target.value)}
                    onKeyDown={(event) => handleQuickAddQuantityEnter(event, true)}
                    placeholder="Cantidad"
                    className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => addCustomRow(editNewColorInput, editNewSizeInput, editNewQtyInput, true)}
                    className="rounded-md border border-zinc-700 px-2 py-2 text-xs text-zinc-200"
                  >
                    Agregar linea
                  </button>
                </div>
                {editColorSizeRows.length === 0 ? (
                  <p className="text-xs text-zinc-500">Usa la primera linea para empezar y luego agrega las que necesites.</p>
                ) : null}
                {editColorSizeRows.length > 0 && editStockEntryMode === 'matrix' ? (
                  <div className="ghost-scrollbar overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/40">
                    <table className="min-w-full border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800">
                          <th className="px-2 py-2 text-left text-zinc-300">Color</th>
                          {getUniqueSizesFromRows(editColorSizeRows).map((size) => (
                            <th key={size} className="px-2 py-2 text-zinc-300">
                              <div className="flex items-center justify-center gap-1">
                                <span>{size}</span>
                                <button
                                  type="button"
                                  onClick={() => removeSizeGlobal(size, true)}
                                  className="inline-flex h-4 w-4 items-center justify-center rounded border border-rose-500/40 text-[10px] leading-none text-rose-300"
                                  title={`Quitar talla ${size}`}
                                >
                                  X
                                </button>
                              </div>
                            </th>
                          ))}
                          <th className="px-2 py-2 text-left text-zinc-300">Accion</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getUniqueColorsFromRows(editColorSizeRows).map((color) => (
                          <tr key={color} className="border-b border-zinc-900/70">
                            <td className="px-2 py-2 font-semibold text-zinc-200">{color}</td>
                            {getUniqueSizesFromRows(editColorSizeRows).map((size) => (
                              <td key={`${color}-${size}`} className="px-2 py-2 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={getCellQuantity(editColorSizeRows, color, size)}
                                  placeholder="0"
                                  onChange={(event) => updateMatrixCell(color, size, event.target.value, true)}
                                  className="mx-auto w-20 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs"
                                />
                              </td>
                            ))}
                            <td className="px-2 py-2">
                              <button
                                type="button"
                                onClick={() => removeColorGroup(color, true)}
                                className="rounded-lg border border-rose-500/40 px-2 py-1 text-xs text-rose-300"
                              >
                                Quitar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {editColorSizeRows.length > 0 && editStockEntryMode === 'form' ? (
                  <div className="space-y-3">
                    {getUniqueColorsFromRows(editColorSizeRows).map((color) => (
                      <div key={color} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-xs text-zinc-400">Color</span>
                          <input
                            value={color}
                            onChange={(event) => renameColorGroup(color, event.target.value, true)}
                            className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => addSizeToColor(color, true)}
                            className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200"
                          >
                            Agregar talla a este color
                          </button>
                          <button
                            type="button"
                            onClick={() => removeColorGroup(color, true)}
                            className="ml-auto rounded-md border border-rose-500/40 px-2 py-1 text-xs text-rose-300"
                          >
                            Quitar color
                          </button>
                        </div>
                        <div className="space-y-2">
                          {editColorSizeRows
                            .filter((row) => normalizeColorLabel(row.color) === color)
                            .map((row) => (
                              <div key={row.id} className="grid gap-2 md:grid-cols-[120px_140px_auto]">
                                <input
                                  value={row.size}
                                  onChange={(event) => updateColorSizeRow(row.id, 'size', event.target.value, true)}
                                  placeholder="Talla"
                                  className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs"
                                />
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={row.quantity}
                                  placeholder="Cantidad"
                                  onChange={(event) => updateColorSizeRow(row.id, 'quantity', event.target.value, true)}
                                  className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeColorSizeRow(row.id, true)}
                                  className="rounded-md border border-zinc-700 px-2 py-2 text-xs text-zinc-200"
                                >
                                  Quitar fila
                                </button>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <button
                type="button"
                onClick={() => setEditCostingEnabled((prev) => !prev)}
                className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200"
              >
                {editCostingEnabled ? 'Ocultar formulario de costo de confeccion' : 'Agregar formulario de costo de confeccion'}
              </button>

              {editCostingEnabled ? (
                <>
                  <div className="mt-3 grid grid-cols-[1.2fr_1fr_1fr] gap-2 text-xs text-zinc-400">
                    <p>INSUMO</p>
                    <p>UNIDAD</p>
                    <p>TOTAL</p>
                  </div>
                  <div className="mt-2 space-y-2">
                    {COST_FIELDS.map((field) => (
                      <div key={field.key} className="grid grid-cols-[1.2fr_1fr_1fr] gap-2">
                        <input
                          value={field.label}
                          readOnly
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200"
                        />
                        <input
                          type="text"
                          inputMode="numeric"
                          value={editCostDraft[field.key]}
                          placeholder="0"
                          onChange={(event) => updateCostField(field.key, event.target.value, true)}
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                        />
                        <input
                          type="text"
                          value={formatCop(getTotalCostValue(editCostDraft, field.key, editTotalQuantity))}
                          readOnly
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 border-t border-zinc-800 pt-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold text-zinc-300">INSUMOS PERSONALIZADOS</p>
                      <button
                        type="button"
                        onClick={() => addCustomCostItem(true)}
                        className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200"
                      >
                        Agregar item
                      </button>
                    </div>

                    <div className="space-y-2">
                      {editCustomCostItems.map((item) => (
                        <div key={item.id} className="grid grid-cols-[1.2fr_1fr_1fr_auto] gap-2">
                          <input
                            value={item.label}
                            onChange={(event) => updateCustomCostItem(item.id, 'label', event.target.value, true)}
                            placeholder="Nombre del insumo"
                            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                          />
                          <input
                            type="text"
                            inputMode="numeric"
                            value={item.unitCost}
                            placeholder="0"
                            onChange={(event) => updateCustomCostItem(item.id, 'unitCost', event.target.value, true)}
                            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                          />
                          <input
                            type="text"
                            value={formatCop(
                              Math.max(0, parseCopIntegerInput(item.unitCost, 0)) *
                                Math.max(0, Math.trunc(editTotalQuantity || 0)),
                            )}
                            readOnly
                            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300"
                          />
                          <button
                            type="button"
                            onClick={() => removeCustomCostItem(item.id, true)}
                            className="rounded-md border border-rose-500/40 px-2 py-2 text-xs text-rose-300"
                          >
                            Quitar
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-400">
                    Los items personalizados se suman al costo total y se guardan en este mismo formulario.
                  </div>

                </>
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeEditModal}
                disabled={updateMutation.isPending || updateInvestmentMutation.isPending}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 disabled:opacity-70"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  void saveReferenceFromModal()
                }}
                disabled={updateMutation.isPending || updateInvestmentMutation.isPending}
                className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-70"
              >
                {updateMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>

            <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
              <h4 className="text-sm font-semibold text-zinc-100">Corregir montos de inversion</h4>
              <p className="mt-1 text-xs text-zinc-500">
                Ajusta manualmente cada movimiento de inversion asociado a esta referencia.
              </p>

              <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                <label className="space-y-1">
                  <span className="text-xs text-zinc-400">Desde</span>
                  <input
                    type="date"
                    value={investmentFromDate}
                    onChange={(event) => setInvestmentFromDate(event.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-zinc-400">Hasta</span>
                  <input
                    type="date"
                    value={investmentToDate}
                    onChange={(event) => setInvestmentToDate(event.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setInvestmentFromDate('')
                    setInvestmentToDate('')
                  }}
                  className="h-fit self-end rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
                >
                  Limpiar filtro
                </button>
              </div>

              {referenceInvestmentsQuery.isLoading ? (
                <p className="mt-3 text-sm text-zinc-500">Cargando inversiones...</p>
              ) : null}

              {!referenceInvestmentsQuery.isLoading && (referenceInvestmentsQuery.data ?? []).length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">
                  Esta referencia no tiene movimientos de inversion registrados.
                </p>
              ) : null}

              {!referenceInvestmentsQuery.isLoading &&
              (referenceInvestmentsQuery.data ?? []).length > 0 &&
              filteredInvestmentRows.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">
                  No hay movimientos de inversion dentro del rango seleccionado.
                </p>
              ) : null}

              <div className="mt-3 space-y-2">
                {filteredInvestmentRows.map((movement) => (
                  <div
                    key={movement.id}
                    className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-zinc-200">
                          {movement.movement_date} · {formatCop(movement.amount)}
                        </p>
                        <p className="text-xs text-zinc-500">
                          Cantidad movida: {movement.reference_movement_quantity} ·{' '}
                          {movement.reference_movement_reason ?? 'Sin detalle'}
                        </p>
                        <p className="text-xs text-zinc-500">
                          Registro: {formatDateTimeColombia(movement.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={investmentDrafts[movement.id] ?? ''}
                          onChange={(event) =>
                            setInvestmentDrafts((prev) => ({
                              ...prev,
                              [movement.id]: formatCopInput(event.target.value),
                            }))
                          }
                          className="w-36 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            void saveInvestmentAmount(movement.id)
                          }}
                          disabled={updateInvestmentMutation.isPending}
                          className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-200 disabled:opacity-70"
                        >
                          {updateInvestmentMutation.isPending ? 'Guardando...' : 'Actualizar'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {editFeedback ? <p className="mt-3 text-sm text-amber-300">{editFeedback}</p> : null}
          </div>
        </div>
      ) : null}

      {showResetInventoryModal ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 py-8"
          onClick={() => setShowResetInventoryModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5"
            onClick={(event) => {
              event.stopPropagation()
            }}
          >
            <h3 className="text-lg font-semibold text-zinc-100">Reiniciar inventario de confeccion</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Esta accion eliminara todas las referencias activas del inventario y lo dejara en cero para iniciar de nuevo.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowResetInventoryModal(false)}
                disabled={deleteAllMutation.isPending}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 disabled:opacity-70"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  void confirmDeleteAllInventory()
                }}
                disabled={deleteAllMutation.isPending}
                className="rounded-lg bg-rose-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
              >
                {deleteAllMutation.isPending ? 'Eliminando...' : 'Si, reiniciar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
