import { useEffect, useMemo, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import { formatCop } from '../../../shared/utils/currency'
import { getTodayIsoDateColombia } from '../../../shared/utils/dateTime'
import { formatCopInput, parseCopIntegerInput } from '../../../shared/utils/numberInput'
import { useAuthStore } from '../../auth/model/useAuthStore'
import {
  useCreateManualExpenseMutation,
  useDeleteManualExpenseMutation,
  useManualExpenseKpisQuery,
  useManualExpensesQuery,
  useUpdateManualExpenseMutation,
} from '../model/useManualInvoicesQueries'
import type { ManualExpenseRow } from '../model/manualInvoices.types'
import { ExpenseReceipt } from './ExpenseReceipt'

export function GastosPage() {
  const user = useAuthStore((state) => state.user)
  const isAdminUser = user?.role === 'admin' || user?.role === 'super_admin'
  const todayIso = getTodayIsoDateColombia()

  const todayLabel = useMemo(() => {
    const parts = new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      weekday: 'long',
      month: 'long',
      year: 'numeric',
    }).formatToParts(new Date())

    const weekday = parts.find((part) => part.type === 'weekday')?.value ?? ''
    const month = parts.find((part) => part.type === 'month')?.value ?? ''
    const year = parts.find((part) => part.type === 'year')?.value ?? ''

    return `Hoy ${weekday}, mes ${month}, año ${year}`
  }, [])

  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState(todayIso)
  const [expenseCategory, setExpenseCategory] = useState('')
  const [expenseNotes, setExpenseNotes] = useState('')
  const [expenseFeedback, setExpenseFeedback] = useState<string | null>(null)
  const [expenseForEdit, setExpenseForEdit] = useState<ManualExpenseRow | null>(null)
  const [editExpenseAmount, setEditExpenseAmount] = useState('')
  const [editExpenseDate, setEditExpenseDate] = useState(todayIso)
  const [editExpenseCategory, setEditExpenseCategory] = useState('')
  const [editExpenseNotes, setEditExpenseNotes] = useState('')
  const [expenseForDelete, setExpenseForDelete] = useState<ManualExpenseRow | null>(null)
  const [selectedExpense, setSelectedExpense] = useState<ManualExpenseRow | null>(null)
  const [expenseSearch, setExpenseSearch] = useState('')

  const expenseReceiptRef = useRef<HTMLDivElement>(null)

  const expensesQuery = useManualExpensesQuery(user?.storeId)
  const expenseKpisQuery = useManualExpenseKpisQuery(user?.storeId, isAdminUser)
  const createExpenseMutation = useCreateManualExpenseMutation(user?.storeId)
  const updateExpenseMutation = useUpdateManualExpenseMutation(user?.storeId)
  const deleteExpenseMutation = useDeleteManualExpenseMutation(user?.storeId)

  const handlePrintExpense = useReactToPrint({
    contentRef: expenseReceiptRef,
    documentTitle: 'comprobante-gasto',
    pageStyle:
      '@page { size: 56mm auto; margin: 0mm; } @media print { html { height: auto !important; min-height: 0 !important; overflow: visible !important; } body { margin: 0 !important; padding: 0 !important; height: auto !important; min-height: 0 !important; overflow: visible !important; background: white !important; color: black !important; } }',
  })

  useEffect(() => {
    if (selectedExpense !== null) {
      void handlePrintExpense()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExpense])

  async function saveExpense() {
    setExpenseFeedback(null)

    if (!user?.storeId || !user.id) {
      setExpenseFeedback('Usuario sin tienda activa.')
      return
    }

    const parsedAmount = parseCopIntegerInput(expenseAmount, 0)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setExpenseFeedback('El monto del gasto debe ser mayor a cero.')
      return
    }

    try {
      const result = await createExpenseMutation.mutateAsync({
        storeId: user.storeId,
        actorUserId: user.id,
        amount: parsedAmount,
        expenseDate,
        category: expenseCategory,
        notes: expenseNotes,
      })

      setExpenseFeedback('Gasto registrado correctamente.')
      setExpenseAmount('')
      setExpenseCategory('')
      setExpenseNotes('')
      setExpenseDate(todayIso)

      const expenseRow: ManualExpenseRow = {
        id: result.expenseId,
        store_id: user.storeId,
        amount: parsedAmount,
        expense_date: expenseDate,
        category: expenseCategory.trim() || null,
        notes: expenseNotes.trim() || null,
        created_by: user.id,
        created_at: new Date().toISOString(),
      }
      setSelectedExpense(expenseRow)
    } catch (error) {
      setExpenseFeedback(error instanceof Error ? error.message : 'No se pudo registrar el gasto.')
    }
  }

  function openEditExpense(expense: ManualExpenseRow) {
    setExpenseForEdit(expense)
    setEditExpenseAmount(formatCopInput(expense.amount))
    setEditExpenseDate(expense.expense_date)
    setEditExpenseCategory(expense.category ?? '')
    setEditExpenseNotes(expense.notes ?? '')
    setExpenseFeedback(null)
  }

  function closeEditExpense() {
    setExpenseForEdit(null)
    setEditExpenseAmount('')
    setEditExpenseDate(todayIso)
    setEditExpenseCategory('')
    setEditExpenseNotes('')
  }

  async function saveExpenseEdit() {
    if (!user?.storeId || !expenseForEdit) {
      return
    }

    const parsedAmount = parseCopIntegerInput(editExpenseAmount, 0)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setExpenseFeedback('El monto del gasto debe ser mayor a cero.')
      return
    }

    try {
      await updateExpenseMutation.mutateAsync({
        expenseId: expenseForEdit.id,
        storeId: user.storeId,
        amount: parsedAmount,
        expenseDate: editExpenseDate,
        category: editExpenseCategory,
        notes: editExpenseNotes,
      })

      setExpenseFeedback('Gasto actualizado correctamente.')
      closeEditExpense()
    } catch (error) {
      setExpenseFeedback(
        error instanceof Error ? error.message : 'No se pudo actualizar el gasto.',
      )
    }
  }

  async function confirmDeleteExpense() {
    if (!user?.storeId || !expenseForDelete) {
      return
    }

    try {
      await deleteExpenseMutation.mutateAsync({
        expenseId: expenseForDelete.id,
        storeId: user.storeId,
      })
      setExpenseFeedback('Gasto eliminado correctamente.')
    } catch (error) {
      setExpenseFeedback(error instanceof Error ? error.message : 'No se pudo eliminar el gasto.')
    } finally {
      setExpenseForDelete(null)
    }
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-zinc-100">Gastos de caja</h1>
          <p className="text-xs text-zinc-500">{todayLabel}</p>
        </div>

        {isAdminUser ? (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <article className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
              <p className="text-xs text-zinc-500">Gastos del día</p>
              <p className="mt-1 text-lg font-semibold text-rose-300">
                {formatCop(expenseKpisQuery.data?.dayTotal ?? 0)}
              </p>
              <p className="text-xs text-zinc-500">
                Movimientos: {expenseKpisQuery.data?.dayCount ?? 0}
              </p>
            </article>

            <article className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
              <p className="text-xs text-zinc-500">Gastos del mes</p>
              <p className="mt-1 text-lg font-semibold text-rose-300">
                {formatCop(expenseKpisQuery.data?.monthTotal ?? 0)}
              </p>
              <p className="text-xs text-zinc-500">
                Movimientos: {expenseKpisQuery.data?.monthCount ?? 0}
              </p>
            </article>

            <article className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
              <p className="text-xs text-zinc-500">Gastos del año</p>
              <p className="mt-1 text-lg font-semibold text-rose-300">
                {formatCop(expenseKpisQuery.data?.yearTotal ?? 0)}
              </p>
              <p className="text-xs text-zinc-500">
                Movimientos: {expenseKpisQuery.data?.yearCount ?? 0}
              </p>
            </article>
          </div>
        ) : null}

        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
          <h3 className="text-sm font-semibold text-zinc-100">Registrar gasto</h3>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs text-zinc-400">Fecha</span>
              <input
                type="date"
                value={expenseDate}
                onChange={(event) => setExpenseDate(event.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs text-zinc-400">Monto</span>
              <input
                type="text"
                inputMode="numeric"
                value={expenseAmount}
                onChange={(event) => setExpenseAmount(formatCopInput(event.target.value))}
                placeholder="0"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs text-zinc-400">Categoría</span>
              <input
                value={expenseCategory}
                onChange={(event) => setExpenseCategory(event.target.value)}
                placeholder="Ej. envío"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs text-zinc-400">Nota (opcional)</span>
              <input
                value={expenseNotes}
                onChange={(event) => setExpenseNotes(event.target.value)}
                placeholder="Detalle del gasto"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              />
            </label>
          </div>

          {expenseFeedback ? (
            <p className="mt-2 text-xs text-amber-300">{expenseFeedback}</p>
          ) : null}

          <button
            type="button"
            onClick={() => {
              void saveExpense()
            }}
            disabled={createExpenseMutation.isPending}
            className="mt-3 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 disabled:opacity-70"
          >
            {createExpenseMutation.isPending ? 'Guardando gasto...' : 'Registrar gasto'}
          </button>
        </div>
      </article>

      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <h2 className="text-xl font-semibold text-zinc-100">Últimos gastos registrados</h2>
        <p className="mt-1 text-xs text-zinc-500">Gastos del periodo actual</p>

        <div className="mt-3">
          <input
            type="text"
            placeholder="Buscar por categoría o nota…"
            value={expenseSearch}
            onChange={(e) => setExpenseSearch(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-400 focus:outline-none"
          />
        </div>

        {expensesQuery.isLoading ? (
          <p className="mt-3 text-xs text-zinc-500">Cargando gastos...</p>
        ) : null}

        {!expensesQuery.isLoading && (expensesQuery.data ?? []).length === 0 ? (
          <p className="mt-3 text-xs text-zinc-500">Aún no hay gastos registrados.</p>
        ) : null}

        <div className="ghost-scrollbar mt-3 max-h-140 space-y-2 overflow-y-auto pr-1">
          {(expensesQuery.data ?? [])
            .filter((expense) => {
              if (!expenseSearch.trim()) return true
              const q = expenseSearch.trim().toLowerCase()
              return (
                (expense.category ?? '').toLowerCase().includes(q) ||
                (expense.notes ?? '').toLowerCase().includes(q) ||
                expense.expense_date.includes(q)
              )
            })
            .map((expense) => (
              <div
                key={expense.id}
                className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-0.5">
                  <p className="min-w-0 flex-1 text-xs text-zinc-300">
                    {expense.expense_date} · {expense.category?.trim() || 'Sin categoría'}
                  </p>
                  <p className="shrink-0 text-sm font-semibold text-rose-300">{formatCop(expense.amount)}</p>
                </div>
                {expense.notes ? (
                  <p className="mt-1 text-xs text-zinc-500">{expense.notes}</p>
                ) : null}
                {isAdminUser ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedExpense(expense)
                      }}
                      className="rounded-md border border-amber-500/40 px-2 py-1 text-xs text-amber-200"
                    >
                      Imprimir
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditExpense(expense)}
                      className="rounded-md border border-sky-500/40 px-2 py-1 text-xs text-sky-200"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpenseForDelete(expense)}
                      className="rounded-md border border-rose-500/40 px-2 py-1 text-xs text-rose-300"
                    >
                      Eliminar
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
        </div>
      </article>

      <ExpenseReceipt expense={selectedExpense} receiptRef={expenseReceiptRef} />

      {expenseForEdit ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 py-8">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
            <h3 className="text-lg font-semibold text-zinc-100">Editar gasto</h3>

            <div className="mt-4 grid gap-3">
              <label className="space-y-1">
                <span className="text-xs text-zinc-400">Fecha</span>
                <input
                  type="date"
                  value={editExpenseDate}
                  onChange={(event) => setEditExpenseDate(event.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-zinc-400">Monto</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={editExpenseAmount}
                  onChange={(event) => setEditExpenseAmount(formatCopInput(event.target.value))}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-zinc-400">Categoría</span>
                <input
                  value={editExpenseCategory}
                  onChange={(event) => setEditExpenseCategory(event.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-zinc-400">Nota</span>
                <input
                  value={editExpenseNotes}
                  onChange={(event) => setEditExpenseNotes(event.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeEditExpense}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  void saveExpenseEdit()
                }}
                disabled={updateExpenseMutation.isPending}
                className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-70"
              >
                {updateExpenseMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {expenseForDelete ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 py-8">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
            <h3 className="text-lg font-semibold text-zinc-100">Eliminar gasto</h3>
            <p className="mt-2 text-sm text-zinc-400">
              ¿Seguro que deseas eliminar este gasto de {formatCop(expenseForDelete.amount)}?
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setExpenseForDelete(null)}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  void confirmDeleteExpense()
                }}
                disabled={deleteExpenseMutation.isPending}
                className="rounded-lg bg-rose-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
              >
                {deleteExpenseMutation.isPending ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
