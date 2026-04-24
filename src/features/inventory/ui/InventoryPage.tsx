import { useEffect, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import { formatCop } from '../../../shared/utils/currency'
import { formatCopInput, parseCopIntegerInput } from '../../../shared/utils/numberInput'
import { useAuthStore } from '../../auth/model/useAuthStore'
import { useCategoriesQuery, useCategoryMutations } from '../../catalog/model/useCatalogQueries'
import {
  useCreateInventoryItemMutation,
  useDeleteInventoryItemMutation,
  useInventoryItemsQuery,
  useUpdateInventoryItemMutation,
} from '../model/useInventoryQueries'
import type { InventoryItemInput, InventoryItemRow } from '../model/inventory.types'
import { BarcodeLabelPreview } from './BarcodeLabel'
import { BarcodePrintSheet } from './BarcodePrintSheet'

// ─── helpers ──────────────────────────────────────────────────────────────────

function calcSalePrice(costPrice: number, markupPercent: number) {
  if (!Number.isFinite(costPrice) || costPrice <= 0) return 0
  return Math.round(costPrice * (1 + markupPercent / 100))
}

function generateRef(description: string) {
  const clean = description
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, 'X')
  return `${clean}-${Date.now().toString().slice(-5)}`
}

const PRINT_PAGE_STYLE =
  '@page { size: 80mm auto; margin: 4mm; } @media print { html { height: auto !important; min-height: 0 !important; } body { margin: 0 !important; padding: 0 !important; height: auto !important; min-height: 0 !important; background: white !important; } }'

// ─── empty form state ─────────────────────────────────────────────────────────

interface FormState {
  description: string
  quantityRaw: string
  costPriceRaw: string
  markupRaw: string
  reference: string
}

const emptyForm: FormState = {
  description: '',
  quantityRaw: '',
  costPriceRaw: '',
  markupRaw: '30',
  reference: '',
}

// ─── Item modal ───────────────────────────────────────────────────────────────

interface ItemModalProps {
  categoryId: string
  categoryName: string
  editItem: InventoryItemRow | null
  storeName: string
  onClose: () => void
  onSave: (input: InventoryItemInput) => Promise<void>
  onSaveAndPrint: (input: InventoryItemInput) => Promise<void>
  isSaving: boolean
}

function ItemModal({
  categoryId,
  categoryName,
  editItem,
  storeName,
  onClose,
  onSave,
  onSaveAndPrint,
  isSaving,
}: ItemModalProps) {
  const [form, setForm] = useState<FormState>(() => {
    if (editItem) {
      const markup = editItem.costPrice > 0
        ? Math.round(((editItem.salePrice / editItem.costPrice) - 1) * 100)
        : 30
      return {
        description: editItem.description,
        quantityRaw: String(editItem.quantity),
        costPriceRaw: String(editItem.costPrice),
        markupRaw: String(markup),
        reference: editItem.reference,
      }
    }
    return emptyForm
  })
  const [feedback, setFeedback] = useState<string | null>(null)

  const costPrice = parseCopIntegerInput(form.costPriceRaw, 0)
  const markup = parseFloat(form.markupRaw) || 0
  const salePrice = calcSalePrice(costPrice, markup)
  const quantity = parseInt(form.quantityRaw, 10) || 0

  useEffect(() => {
    if (!editItem && form.description.length >= 3 && !form.reference) {
      setForm((f) => ({ ...f, reference: generateRef(f.description) }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.description])

  const previewItem: InventoryItemRow = {
    stockId: '',
    variantId: '',
    productId: '',
    categoryId,
    description: form.description || 'Vista previa',
    quantity,
    costPrice,
    salePrice,
    reference: form.reference || 'REF00001',
    barcode: form.reference || 'REF00001',
  }

  function validate(): InventoryItemInput | null {
    if (!form.description.trim()) { setFeedback('La descripción es obligatoria.'); return null }
    if (quantity <= 0) { setFeedback('La cantidad debe ser mayor a cero.'); return null }
    if (!Number.isFinite(costPrice) || costPrice <= 0) { setFeedback('El valor unitario debe ser mayor a cero.'); return null }
    if (!form.reference.trim()) { setFeedback('La referencia es obligatoria.'); return null }
    return { categoryId, description: form.description.trim(), quantity, costPrice, markupPercent: markup, reference: form.reference.trim() }
  }

  async function handleSave() {
    const input = validate()
    if (!input) return
    setFeedback(null)
    try { await onSave(input); onClose() }
    catch (e) { setFeedback(e instanceof Error ? e.message : 'Error al guardar.') }
  }

  async function handleSaveAndPrint() {
    const input = validate()
    if (!input) return
    setFeedback(null)
    try { await onSaveAndPrint(input); onClose() }
    catch (e) { setFeedback(e instanceof Error ? e.message : 'Error al guardar.') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">
              {editItem ? 'Editar ítem' : 'Nuevo ítem'}
            </h2>
            <p className="text-xs text-zinc-400">Categoría: {categoryName}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">✕</button>
        </div>

        {feedback && (
          <p className="mb-3 rounded-lg bg-rose-500/20 px-3 py-2 text-sm text-rose-300">{feedback}</p>
        )}

        <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Descripción</label>
              <input
                type="text"
                placeholder="Ej: Jean slim mujer talla 10"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">Cantidad</label>
              <input
                type="number"
                min={1}
                placeholder="0"
                value={form.quantityRaw}
                onChange={(e) => setForm((f) => ({ ...f, quantityRaw: e.target.value }))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">Valor unitario (costo)</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="$ 0"
                value={form.costPriceRaw ? formatCopInput(parseCopIntegerInput(form.costPriceRaw, 0)) : ''}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, '')
                  setForm((f) => ({ ...f, costPriceRaw: raw }))
                }}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Incremento %</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="30"
                  value={form.markupRaw}
                  onChange={(e) => setForm((f) => ({ ...f, markupRaw: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Precio de venta (auto)</label>
                <div className="flex items-center rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2">
                  <span className="text-sm font-semibold text-amber-300">
                    {salePrice > 0 ? formatCop(salePrice) : '—'}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">Referencia (código de barras)</label>
              <input
                type="text"
                placeholder="Ej: JEAN-SLM-001"
                value={form.reference}
                onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value.toUpperCase() }))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <p className="text-xs text-zinc-500">Vista previa</p>
            {form.reference ? (
              <BarcodeLabelPreview item={previewItem} storeName={storeName} />
            ) : (
              <div className="flex h-32 w-48 items-center justify-center rounded-lg border border-dashed border-zinc-700 text-xs text-zinc-600">
                Ingresa una referencia
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" disabled={isSaving} onClick={() => void handleSave()}
            className="rounded-xl bg-amber-400 px-5 py-2 text-sm font-semibold text-zinc-900 hover:bg-amber-300 disabled:opacity-50">
            {isSaving ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" disabled={isSaving} onClick={() => void handleSaveAndPrint()}
            className="rounded-xl border border-amber-400/50 px-5 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-400/10 disabled:opacity-50">
            Guardar e imprimir etiquetas
          </button>
          <button type="button" onClick={onClose}
            className="ml-auto rounded-xl border border-zinc-700 px-5 py-2 text-sm text-zinc-400 hover:bg-zinc-800">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Category modal ───────────────────────────────────────────────────────────

function CategoryModal({
  onClose,
  onCreate,
  isCreating,
}: {
  onClose: () => void
  onCreate: (name: string) => Promise<void>
  isCreating: boolean
}) {
  const [name, setName] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  async function handleCreate() {
    if (!name.trim()) { setFeedback('El nombre es obligatorio.'); return }
    setFeedback(null)
    try { await onCreate(name.trim()); onClose() }
    catch (e) { setFeedback(e instanceof Error ? e.message : 'Error al crear.') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">Nueva categoría</h2>
        {feedback && (
          <p className="mb-3 rounded-lg bg-rose-500/20 px-3 py-2 text-sm text-rose-300">{feedback}</p>
        )}
        <input
          type="text"
          placeholder="Ej: Jean Mujer"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate() }}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none"
        />
        <div className="mt-4 flex gap-2">
          <button type="button" disabled={isCreating} onClick={() => void handleCreate()}
            className="flex-1 rounded-xl bg-amber-400 py-2 text-sm font-semibold text-zinc-900 hover:bg-amber-300 disabled:opacity-50">
            {isCreating ? 'Creando…' : 'Crear categoría'}
          </button>
          <button type="button" onClick={onClose}
            className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function InventoryPage() {
  const user = useAuthStore((state) => state.user)
  const storeName = user?.storeName ?? 'POS Retail'

  const categoriesQuery = useCategoriesQuery(user?.storeId)
  const itemsQuery = useInventoryItemsQuery(user?.storeId)

  const categoryMutations = useCategoryMutations(user?.storeId)
  const createItem = useCreateInventoryItemMutation(user?.storeId)
  const updateItem = useUpdateInventoryItemMutation(user?.storeId)
  const deleteItem = useDeleteInventoryItemMutation(user?.storeId)

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [itemModal, setItemModal] = useState<{
    categoryId: string
    categoryName: string
    editItem: InventoryItemRow | null
  } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<InventoryItemRow | null>(null)
  const [printItem, setPrintItem] = useState<InventoryItemRow | null>(null)
  const [printCopies, setPrintCopies] = useState(1)

  const printRef = useRef<HTMLDivElement>(null)
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: 'etiquetas',
    pageStyle: PRINT_PAGE_STYLE,
  })

  useEffect(() => {
    if (printItem !== null) void handlePrint()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printItem])

  function toggleCategory(id: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCreateCategory(name: string) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    await categoryMutations.createMutation.mutateAsync({ name, slug })
  }

  async function handleSaveItem(input: InventoryItemInput) {
    if (itemModal?.editItem) {
      await updateItem.mutateAsync({
        ...input,
        productId: itemModal.editItem.productId,
        variantId: itemModal.editItem.variantId,
        stockId: itemModal.editItem.stockId,
      })
    } else {
      await createItem.mutateAsync(input)
    }
  }

  async function handleSaveAndPrint(input: InventoryItemInput) {
    const salePrice = calcSalePrice(input.costPrice, input.markupPercent)
    let saved: InventoryItemRow

    if (itemModal?.editItem) {
      await updateItem.mutateAsync({
        ...input,
        productId: itemModal.editItem.productId,
        variantId: itemModal.editItem.variantId,
        stockId: itemModal.editItem.stockId,
      })
      saved = { ...itemModal.editItem, description: input.description, quantity: input.quantity, costPrice: input.costPrice, salePrice, reference: input.reference, barcode: input.reference }
    } else {
      const result = await createItem.mutateAsync(input)
      saved = { stockId: result.stockId, variantId: result.variantId, productId: '', categoryId: input.categoryId, description: input.description, quantity: input.quantity, costPrice: input.costPrice, salePrice, reference: input.reference, barcode: input.reference }
    }

    setPrintCopies(input.quantity)
    setPrintItem(saved)
  }

  const categories = categoriesQuery.data ?? []
  const items = itemsQuery.data ?? []
  const isSaving = createItem.isPending || updateItem.isPending

  if (!user?.storeId) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <h1 className="text-2xl font-semibold text-zinc-100">Inventario</h1>
        <p className="mt-2 text-zinc-400">No hay tienda activa asociada al usuario.</p>
      </section>
    )
  }

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Inventario</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Organiza el stock por categorías y genera etiquetas con código de barras.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCategoryModal(true)}
          className="shrink-0 rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-amber-300"
        >
          + Nueva categoría
        </button>
      </header>

      {categoriesQuery.isLoading && (
        <p className="text-sm text-zinc-500">Cargando categorías…</p>
      )}

      {!categoriesQuery.isLoading && categories.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-700 p-8 text-center">
          <p className="text-zinc-400">No hay categorías todavía.</p>
          <p className="mt-1 text-sm text-zinc-500">Crea una categoría para empezar a registrar inventario.</p>
        </div>
      )}

      <div className="space-y-3">
        {categories.map((cat) => {
          const catItems = items.filter((it) => it.categoryId === cat.id)
          const isExpanded = expandedCategories.has(cat.id)

          return (
            <article key={cat.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/70">
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleCategory(cat.id)}
                onKeyDown={(e) => e.key === 'Enter' && toggleCategory(cat.id)}
                className="flex w-full cursor-pointer items-center justify-between rounded-2xl px-4 py-3 text-left hover:bg-zinc-800/40"
              >
                <div className="flex items-center gap-3">
                  <span className="text-base font-semibold text-zinc-100">{cat.name}</span>
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                    {catItems.length} {catItems.length === 1 ? 'ítem' : 'ítems'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setItemModal({ categoryId: cat.id, categoryName: cat.name, editItem: null })
                      setExpandedCategories((prev) => new Set([...prev, cat.id]))
                    }}
                    className="rounded-lg border border-amber-500/40 px-3 py-1 text-xs font-medium text-amber-300 hover:bg-amber-400/10"
                  >
                    + Agregar ítem
                  </button>
                  <span className="text-zinc-500">{isExpanded ? '▲' : '▼'}</span>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-zinc-800 px-2 pb-2 pt-1">
                  {catItems.length === 0 ? (
                    <p className="py-4 text-center text-sm text-zinc-500">
                      Sin ítems. Usa "+ Agregar ítem" para registrar.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-zinc-800 text-left text-zinc-500">
                            <th className="py-2 pl-2 font-medium">Descripción</th>
                            <th className="py-2 px-2 font-medium">Cant.</th>
                            <th className="py-2 px-2 font-medium">Costo</th>
                            <th className="py-2 px-2 font-medium">Precio venta</th>
                            <th className="py-2 px-2 font-medium">Referencia</th>
                            <th className="py-2 px-2 font-medium">Código de barras</th>
                            <th className="py-2 pr-2 font-medium"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {catItems.map((item) => (
                            <tr key={item.stockId} className="border-b border-zinc-800/60 hover:bg-zinc-800/30">
                              <td className="py-2 pl-2 text-zinc-200">{item.description}</td>
                              <td className="py-2 px-2 font-semibold text-emerald-300">{item.quantity}</td>
                              <td className="py-2 px-2 text-zinc-400">{formatCop(item.costPrice)}</td>
                              <td className="py-2 px-2 font-semibold text-amber-300">{formatCop(item.salePrice)}</td>
                              <td className="py-2 px-2 font-mono text-zinc-400">{item.reference}</td>
                              <td className="py-2 px-2">
                                <BarcodeLabelPreview item={item} storeName={storeName} />
                              </td>
                              <td className="py-2 pr-2">
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    title="Imprimir etiquetas"
                                    onClick={() => { setPrintItem(item); setPrintCopies(item.quantity) }}
                                    className="rounded border border-amber-500/40 px-2 py-1 text-amber-300 hover:bg-amber-400/10"
                                  >
                                    🖨
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setItemModal({ categoryId: cat.id, categoryName: cat.name, editItem: item })}
                                    className="rounded border border-sky-500/40 px-2 py-1 text-sky-300 hover:bg-sky-400/10"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirm(item)}
                                    className="rounded border border-rose-500/40 px-2 py-1 text-rose-300 hover:bg-rose-400/10"
                                  >
                                    Eliminar
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>

      <BarcodePrintSheet printRef={printRef} item={printItem} copies={printCopies} storeName={storeName} />

      {showCategoryModal && (
        <CategoryModal
          onClose={() => setShowCategoryModal(false)}
          onCreate={handleCreateCategory}
          isCreating={categoryMutations.createMutation.isPending}
        />
      )}

      {itemModal && (
        <ItemModal
          categoryId={itemModal.categoryId}
          categoryName={itemModal.categoryName}
          editItem={itemModal.editItem}
          storeName={storeName}
          onClose={() => setItemModal(null)}
          onSave={handleSaveItem}
          onSaveAndPrint={handleSaveAndPrint}
          isSaving={isSaving}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
            <h2 className="text-base font-semibold text-zinc-100">¿Eliminar ítem?</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Se eliminará <strong className="text-zinc-100">{deleteConfirm.description}</strong>{' '}
              junto con su variante y stock. Esta acción no se puede deshacer.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={deleteItem.isPending}
                onClick={() => {
                  void deleteItem
                    .mutateAsync({ productId: deleteConfirm.productId, variantId: deleteConfirm.variantId, stockId: deleteConfirm.stockId })
                    .then(() => setDeleteConfirm(null))
                }}
                className="flex-1 rounded-xl bg-rose-600 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {deleteItem.isPending ? 'Eliminando…' : 'Eliminar'}
              </button>
              <button type="button" onClick={() => setDeleteConfirm(null)}
                className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
