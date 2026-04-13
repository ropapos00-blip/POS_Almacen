import { useEffect, useMemo, useState } from 'react'
import { formatCop } from '../../../shared/utils/currency'
import { formatDateTimeColombia } from '../../../shared/utils/dateTime'
import { formatCopInput, parseCopIntegerInput } from '../../../shared/utils/numberInput'
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
  const [investmentAmount, setInvestmentAmount] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<WholesaleInventoryRow | null>(null)
  const [showResetInventoryModal, setShowResetInventoryModal] = useState(false)
  const [editTarget, setEditTarget] = useState<WholesaleInventoryRow | null>(null)
  const [editReference, setEditReference] = useState('')
  const [editQuantityOnHand, setEditQuantityOnHand] = useState('')
  const [editUnitPrice, setEditUnitPrice] = useState('')
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
    setEditQuantityOnHand(String(editTarget.quantityOnHand))
    setEditUnitPrice(formatCopInput(editTarget.unitPrice))
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

      return (
        row.reference.toLowerCase().includes(query) ||
        row.productName.toLowerCase().includes(query)
      )
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
    setQuantityOnHand('')
    setUnitPrice('')
    setInvestmentAmount('')
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
  }

  async function saveReference() {
    if (!user?.id) {
      setFeedback('Usuario no valido para gestionar inventario de confeccion.')
      return
    }

    const parsedQty = Math.max(0, Math.trunc(Number(quantityOnHand || 0)))
    const parsedUnitPrice = Math.max(0, parseCopIntegerInput(unitPrice, 0))
    const parsedInvestmentAmount = Math.max(0, parseCopIntegerInput(investmentAmount, 0))

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

    if (!Number.isFinite(parsedInvestmentAmount)) {
      setFeedback('Inversion invalida.')
      return
    }

    if (parsedQty > 0 && parsedInvestmentAmount <= 0) {
      setFeedback('Debes indicar la inversion de esta entrada de inventario.')
      return
    }

    try {
      setFeedback(null)

      const result = await createMutation.mutateAsync({
        reference,
        quantityOnHand: parsedQty,
        unitPrice: parsedUnitPrice,
        investmentAmount: parsedInvestmentAmount,
      })
      if (result?.action === 'restocked') {
        setFeedback(
          `Referencia ${result.reference} ya existia. Se agregaron unidades. Nuevo stock: ${result.finalQuantity}. Inversion registrada: ${formatCop(parsedInvestmentAmount)}.`,
        )
      } else {
        setFeedback(
          `Referencia ${reference.trim().toUpperCase()} creada en inventario de confeccion. Inversion registrada: ${formatCop(parsedInvestmentAmount)}.`,
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

    const parsedQty = Math.max(0, Math.trunc(Number(editQuantityOnHand || 0)))
    const parsedUnitPrice = Math.max(0, parseCopIntegerInput(editUnitPrice, 0))

    if (!editReference.trim()) {
      setEditFeedback('La referencia es obligatoria.')
      return
    }

    if (!Number.isFinite(parsedQty)) {
      setEditFeedback('Cantidad invalida.')
      return
    }

    if (!Number.isFinite(parsedUnitPrice)) {
      setEditFeedback('Valor unitario invalido.')
      return
    }

    try {
      const payload: UpdateWholesaleReferenceInput = {
        referenceId: editTarget.variantId,
        reference: editReference,
        quantityOnHand: parsedQty,
        unitPrice: parsedUnitPrice,
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
      <header className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <h1 className="text-2xl font-semibold text-zinc-100">Inventario Confeccion</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Modulo aparte del inventario retail. Solo referencia, cantidad y valor unitario.
        </p>
        {feedback ? <p className="mt-2 text-sm text-amber-300">{feedback}</p> : null}
      </header>

      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <h2 className="text-lg font-semibold text-zinc-100">Crear referencia</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Cada referencia inicia en cero por defecto y es exclusiva de confeccion.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
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
              type="text"
              inputMode="numeric"
              value={unitPrice}
              placeholder="0"
              onChange={(event) => setUnitPrice(formatCopInput(event.target.value))}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-zinc-400">Inversion entrada (COP)</span>
            <input
              type="text"
              inputMode="numeric"
              value={investmentAmount}
              placeholder="0"
              onChange={(event) => setInvestmentAmount(formatCopInput(event.target.value))}
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
            disabled={createMutation.isPending}
            className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-70"
          >
            {createMutation.isPending ? 'Guardando...' : 'Crear referencia'}
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
          <button
            type="button"
            onClick={() => setShowResetInventoryModal(true)}
            disabled={filteredRows.length === 0 || deleteAllMutation.isPending}
            className="rounded-lg border border-rose-500/40 px-3 py-2 text-sm font-medium text-rose-300 disabled:opacity-60"
          >
            Reiniciar inventario
          </button>
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

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
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
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          onClick={closeEditModal}
        >
          <div
            className="w-full max-w-3xl rounded-2xl border border-zinc-700 bg-zinc-900 p-5"
            onClick={(event) => {
              event.stopPropagation()
            }}
          >
            <h3 className="text-lg font-semibold text-zinc-100">Editar referencia de confeccion</h3>
            <p className="mt-1 text-xs text-zinc-500">Referencia seleccionada: {editTarget.reference}</p>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="space-y-1">
                <span className="text-xs text-zinc-400">Referencia</span>
                <input
                  value={editReference}
                  onChange={(event) => setEditReference(event.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-zinc-400">Cantidad</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={editQuantityOnHand}
                  onChange={(event) => setEditQuantityOnHand(event.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
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
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
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
