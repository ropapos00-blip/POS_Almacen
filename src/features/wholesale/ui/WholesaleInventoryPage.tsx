import { useMemo, useState } from 'react'
import { formatCop } from '../../../shared/utils/currency'
import { useAuthStore } from '../../auth/model/useAuthStore'
import {
  useCreateWholesaleReferenceMutation,
  useDeleteWholesaleReferenceMutation,
  useUpdateWholesaleReferenceMutation,
  useWholesaleInventoryStockQuery,
} from '../model/useWholesaleQueries'
import type { WholesaleInventoryRow, UpdateWholesaleReferenceInput } from '../model/wholesale.types'

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Operacion no completada.'
}

export function WholesaleInventoryPage() {
  const user = useAuthStore((state) => state.user)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [reference, setReference] = useState('')
  const [quantityOnHand, setQuantityOnHand] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [editingRow, setEditingRow] = useState<WholesaleInventoryRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<WholesaleInventoryRow | null>(null)

  const inventoryQuery = useWholesaleInventoryStockQuery(user?.storeId)
  const createMutation = useCreateWholesaleReferenceMutation(user?.storeId, user?.id)
  const updateMutation = useUpdateWholesaleReferenceMutation(user?.storeId, user?.id)
  const deleteMutation = useDeleteWholesaleReferenceMutation(user?.storeId)

  const filteredRows = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    const rows = inventoryQuery.data ?? []
    const output = rows.filter((row) => {
      if (!query) {
        return true
      }

      return (
        row.reference.toLowerCase().includes(query) ||
        row.productName.toLowerCase().includes(query)
      )
    })

    return output.sort((a, b) => a.reference.localeCompare(b.reference, 'es'))
  }, [inventoryQuery.data, searchText])

  function resetForm() {
    setEditingRow(null)
    setReference('')
    setQuantityOnHand('')
    setUnitPrice('')
  }

  function startEdit(row: WholesaleInventoryRow) {
    setEditingRow(row)
    setReference(row.reference)
    setQuantityOnHand(String(row.quantityOnHand))
    setUnitPrice(String(row.unitPrice))
    setFeedback(null)
  }

  async function saveReference() {
    if (!user?.id) {
      setFeedback('Usuario no valido para gestionar inventario de confeccion.')
      return
    }

    const parsedQty = Math.max(0, Math.trunc(Number(quantityOnHand || 0)))
    const parsedUnitPrice = Math.max(0, Math.round(Number(unitPrice || 0)))

    if (!reference.trim()) {
      setFeedback('La referencia es obligatoria.')
      return
    }

    if (!Number.isFinite(parsedQty)) {
      setFeedback('Cantidad invalida.')
      return
    }

    if (!Number.isFinite(parsedUnitPrice)) {
      setFeedback('Valor unitario invalido.')
      return
    }

    try {
      setFeedback(null)

      if (!editingRow) {
        const result = await createMutation.mutateAsync({
          reference,
          quantityOnHand: parsedQty,
          unitPrice: parsedUnitPrice,
        })
        if (result?.action === 'restocked') {
          setFeedback(
            `Referencia ${result.reference} ya existia. Se agregaron unidades. Nuevo stock: ${result.finalQuantity}.`,
          )
        } else {
          setFeedback(`Referencia ${reference.trim().toUpperCase()} creada en inventario de confeccion.`)
        }
      } else {
        const payload: UpdateWholesaleReferenceInput = {
          referenceId: editingRow.variantId,
          reference,
          quantityOnHand: parsedQty,
          unitPrice: parsedUnitPrice,
        }
        await updateMutation.mutateAsync(payload)
        setFeedback(`Referencia ${reference.trim()} actualizada.`)
      }

      resetForm()
    } catch (error) {
      setFeedback(getErrorMessage(error))
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
      if (editingRow?.variantId === deletingReferenceId) {
        resetForm()
      }
    } catch (error) {
      setFeedback(getErrorMessage(error))
    } finally {
      setDeleteTarget(null)
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
      <header className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <h1 className="text-2xl font-semibold text-zinc-100">Inventario Confeccion</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Modulo aparte del inventario retail. Solo referencia, cantidad y valor unitario.
        </p>
        {feedback ? <p className="mt-2 text-sm text-amber-300">{feedback}</p> : null}
      </header>

      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <h2 className="text-lg font-semibold text-zinc-100">
          {editingRow ? 'Editar referencia' : 'Crear referencia'}
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Cada referencia inicia en cero por defecto y es exclusiva de confeccion.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs text-zinc-400">Referencia</span>
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-zinc-400">Cantidad</span>
            <input
              type="number"
              min={0}
              step={1}
              value={quantityOnHand}
              placeholder="0"
              onChange={(event) => setQuantityOnHand(event.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-zinc-400">Valor unitario (COP)</span>
            <input
              type="number"
              min={0}
              step={1}
              value={unitPrice}
              placeholder="0"
              onChange={(event) => setUnitPrice(event.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
          </label>
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
            disabled={createMutation.isPending || updateMutation.isPending}
            className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-70"
          >
            {createMutation.isPending || updateMutation.isPending
              ? 'Guardando...'
              : editingRow
                ? 'Guardar cambios'
                : 'Crear referencia'}
          </button>
        </div>
      </article>

      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Buscar por referencia"
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
          />
        </div>

        <ul className="mt-4 space-y-2">
          {filteredRows.map((row) => (
            <li key={row.variantId} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-200">{row.reference}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-zinc-500">Valor unitario</p>
                  <p className="text-xs text-zinc-300">{formatCop(row.unitPrice)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-zinc-500">Cantidad</p>
                  <p className="text-lg font-semibold text-emerald-300">{row.quantityOnHand}</p>
                </div>
              </div>

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(row)}
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

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
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
    </section>
  )
}
