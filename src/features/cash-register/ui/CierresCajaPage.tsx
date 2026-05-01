import { useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import { formatCop } from '../../../shared/utils/currency'
import { addDaysToIsoDate, getTodayIsoDateColombia } from '../../../shared/utils/dateTime'
import { formatCopInput, parseCopIntegerInput } from '../../../shared/utils/numberInput'
import { useAuthStore } from '../../auth/model/useAuthStore'
import {
  useCloseSessionMutation,
  useDaySalesSummaryQuery,
  useLastSessionQuery,
  useOpenSessionMutation,
  useSessionsByRangeQuery,
  useTodaySessionQuery,
  useUpdateCashBaseMutation,
} from '../model/useCashRegisterQueries'
import type { CashRegisterSession } from '../model/cashRegister.types'
import { CierreReceipt } from './CierreReceipt'
import type { CierreReceiptData } from './CierreReceipt'

export function CierresCajaPage() {
  const user = useAuthStore((state) => state.user)
  const storeId = user?.storeId
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  const todayIso = getTodayIsoDateColombia()
  const tomorrowIso = addDaysToIsoDate(todayIso, 1)

  const cierreReceiptRef = useRef<HTMLDivElement>(null)

  // ─── Queries ────────────────────────────────────────────────────────────────
  const sessionQuery = useTodaySessionQuery(storeId)
  const session = sessionQuery.data ?? null
  const lastSessionQuery = useLastSessionQuery(storeId)
  const lastSession = lastSessionQuery.data ?? null

  const summaryQuery = useDaySalesSummaryQuery(storeId, todayIso)
  const summary = summaryQuery.data

  // ─── Mutations ──────────────────────────────────────────────────────────────
  const openMutation = useOpenSessionMutation(storeId)
  const closeMutation = useCloseSessionMutation(storeId)
  const updateBaseMutation = useUpdateCashBaseMutation(storeId)

  // ─── Estado formulario apertura ─────────────────────────────────────────────
  const [cashBaseInput, setCashBaseInput] = useState('')
  const [notesOpenInput, setNotesOpenInput] = useState('')
  const [openFeedback, setOpenFeedback] = useState<string | null>(null)

  // ─── Estado formulario cierre ────────────────────────────────────────────────
  const [cashCountedInput, setCashCountedInput] = useState('')
  const [notesCloseInput, setNotesCloseInput] = useState('')
  const [closeFeedback, setCloseFeedback] = useState<string | null>(null)
  const [showCloseModal, setShowCloseModal] = useState(false)

  // ─── Estado modal editar base ────────────────────────────────────────────────
  const [showEditBaseModal, setShowEditBaseModal] = useState(false)
  const [editBaseInput, setEditBaseInput] = useState('')
  const [editNotesOpen, setEditNotesOpen] = useState('')
  const [editBaseFeedback, setEditBaseFeedback] = useState<string | null>(null)

  // ─── Estado apertura siguiente dia ───────────────────────────────────────────
  const [nextDayBaseInput, setNextDayBaseInput] = useState('')
  const [nextDayNotesInput, setNextDayNotesInput] = useState('')
  const [nextDayFeedback, setNextDayFeedback] = useState<string | null>(null)

  // ─── Estado modal historial (admin) ─────────────────────────────────────────
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [selectedHistSession, setSelectedHistSession] = useState<CashRegisterSession | null>(null)

  // rango: mes actual para el historial
  const monthStart = todayIso.slice(0, 8) + '01'
  const historyQuery = useSessionsByRangeQuery(
    isAdmin && showHistoryModal ? storeId : undefined,
    monthStart,
    todayIso,
  )
  const historySessions = historyQuery.data ?? []

  // sesion de mañana (para saber si ya fue preparada)
  const tomorrowSessionQuery = useSessionsByRangeQuery(
    session?.status === 'closed' && isAdmin ? storeId : undefined,
    tomorrowIso,
    tomorrowIso,
  )
  const tomorrowSession = tomorrowSessionQuery.data?.[0] ?? null

  // resumen de sesión histórica seleccionada
  const histSummaryQuery = useDaySalesSummaryQuery(
    isAdmin && selectedHistSession ? storeId : undefined,
    selectedHistSession?.session_date ?? '',
  )
  const histSummary = histSummaryQuery.data

  // ─── Calculos ────────────────────────────────────────────────────────────────
  const cashBase = session?.cash_base ?? 0
  const posCash = summary?.posCash ?? 0
  const invoiceCash = summary?.invoiceCash ?? 0
  const expenses = summary?.expensesTotal ?? 0
  const expectedCash = cashBase + posCash + invoiceCash - expenses

  const cashCountedLive = parseCopIntegerInput(cashCountedInput)
  const differenceLive = cashCountedLive - expectedCash

  const closedCashCounted = session?.status === 'closed' ? (session.cash_counted ?? 0) : 0
  const closedDifference = closedCashCounted - expectedCash

  const todayLabel = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  // ─── Handlers ────────────────────────────────────────────────────────────────
  async function handleOpenSession() {
    setOpenFeedback(null)
    if (!storeId || !user?.id) return
    const base = parseCopIntegerInput(cashBaseInput)
    if (base < 0) {
      setOpenFeedback('La base en efectivo no puede ser negativa.')
      return
    }
    try {
      await openMutation.mutateAsync({
        storeId,
        openedBy: user.id,
        cashBase: base,
        notesOpen: notesOpenInput,
      })
      setCashBaseInput('')
      setNotesOpenInput('')
    } catch (e) {
      setOpenFeedback(e instanceof Error ? e.message : 'Error al abrir la sesion.')
    }
  }

  async function handlePrepareTomorrow() {
    setNextDayFeedback(null)
    if (!storeId || !user?.id) return
    const base = parseCopIntegerInput(nextDayBaseInput)
    if (base < 0) {
      setNextDayFeedback('La base no puede ser negativa.')
      return
    }
    try {
      await openMutation.mutateAsync({
        storeId,
        openedBy: user.id,
        cashBase: base,
        notesOpen: nextDayNotesInput,
        sessionDate: tomorrowIso,
      })
      setNextDayBaseInput('')
      setNextDayNotesInput('')
    } catch (e) {
      setNextDayFeedback(e instanceof Error ? e.message : 'Error al preparar la sesion.')
    }
  }

  async function handleUpdateTomorrow() {
    setNextDayFeedback(null)
    if (!tomorrowSession) return
    const base = parseCopIntegerInput(nextDayBaseInput || String(Math.trunc(tomorrowSession.cash_base)))
    if (base < 0) {
      setNextDayFeedback('La base no puede ser negativa.')
      return
    }
    try {
      await updateBaseMutation.mutateAsync({
        sessionId: tomorrowSession.id,
        cashBase: base,
        notesOpen: nextDayNotesInput !== '' ? nextDayNotesInput : (tomorrowSession.notes_open ?? ''),
      })
      setNextDayBaseInput('')
      setNextDayNotesInput('')
      setNextDayFeedback('✓ Base actualizada.')
    } catch (e) {
      setNextDayFeedback(e instanceof Error ? e.message : 'Error al actualizar la base.')
    }
  }

  function openEditBaseModal() {
    setEditBaseInput(formatCopInput(Math.trunc(session?.cash_base ?? 0)))
    setEditNotesOpen(session?.notes_open ?? '')
    setEditBaseFeedback(null)
    setShowEditBaseModal(true)
  }

  async function handleUpdateBase() {
    setEditBaseFeedback(null)
    if (!session) return
    const base = parseCopIntegerInput(editBaseInput)
    if (base < 0) {
      setEditBaseFeedback('La base no puede ser negativa.')
      return
    }
    try {
      await updateBaseMutation.mutateAsync({
        sessionId: session.id,
        cashBase: base,
        notesOpen: editNotesOpen,
      })
      setShowEditBaseModal(false)
    } catch (e) {
      setEditBaseFeedback(e instanceof Error ? e.message : 'Error al actualizar la base.')
    }
  }

  function openCloseModal() {
    setCashCountedInput('')
    setNotesCloseInput('')
    setCloseFeedback(null)
    setShowCloseModal(true)
  }

  async function handleCloseSession() {
    setCloseFeedback(null)
    if (!session || !user?.id) return
    const counted = parseCopIntegerInput(cashCountedInput)
    if (counted < 0) {
      setCloseFeedback('El efectivo contado no puede ser negativo.')
      return
    }
    try {
      await closeMutation.mutateAsync({
        sessionId: session.id,
        closedBy: user.id,
        cashCounted: counted,
        notesClose: notesCloseInput,
      })
      setShowCloseModal(false)
    } catch (e) {
      setCloseFeedback(e instanceof Error ? e.message : 'Error al cerrar la sesion.')
    }
  }

  function printCierre() {
    handlePrintCierre()
  }

  function diffColor(diff: number) {
    if (diff > 0) return 'text-emerald-300'
    if (diff < 0) return 'text-rose-300'
    return 'text-zinc-300'
  }

  function diffLabel(diff: number) {
    if (diff > 0) return `Sobrante ${formatCop(diff)}`
    if (diff < 0) return `Faltante ${formatCop(Math.abs(diff))}`
    return 'Cuadra exacto'
  }

  const invoiceByMethod = summary?.invoiceByMethod ?? {}

  const cierreReceiptData: CierreReceiptData | null =
    session?.status === 'closed'
      ? {
          sessionDate: new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${session.session_date}T12:00:00`)),
          closedAt: session.closed_at
            ? new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' }).format(new Date(session.closed_at))
            : null,
          cashBase,
          posCash,
          posCard: summary?.posCard ?? 0,
          posTransfer: summary?.posTransfer ?? 0,
          posTotal: summary?.posTotal ?? 0,
          invoiceCash,
          invoiceByMethod,
          invoiceTotal: summary?.invoiceTotal ?? 0,
          expenses,
          expectedCash,
          cashCounted: session.cash_counted ?? 0,
          difference: (session.cash_counted ?? 0) - expectedCash,
          notesClose: session.notes_close ?? null,
          cashierName: user?.fullName ?? user?.email ?? '—',
        }
      : null

  const handlePrintCierre = useReactToPrint({
    contentRef: cierreReceiptRef,
    documentTitle: `cierre-${session?.session_date ?? todayIso}`,
    pageStyle: '@page { size: 56mm auto; margin: 0mm; } html, body { margin: 0 !important; padding: 0 !important; height: auto !important; min-height: 0 !important; background: white !important; }',
  })

  if (sessionQuery.isLoading) {
    return (
      <section className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-zinc-100">Cierre de Caja</h1>
        </header>
        <p className="text-sm text-zinc-500">Cargando sesion del dia...</p>
      </section>
    )
  }

  return (
    <section className="space-y-6">
      {/* ── HEADER con botón historial (admin) ─────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Cierre de Caja</h1>
          <p className="mt-2 text-zinc-400">{todayLabel}</p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowHistoryModal(true)}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-100"
          >
            Historial del mes
          </button>
        )}
      </header>

      {/* ── KPIs del dia ──────────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
          <p className="text-xs text-zinc-500">Efectivo en caja</p>
          <p className="mt-1 text-lg font-semibold text-zinc-100">{formatCop(expectedCash)}</p>
          <p className="text-xs text-zinc-500">Base + ingresos - gastos</p>
        </article>
        <article className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
          <p className="text-xs text-zinc-500">Ventas POS hoy</p>
          <p className="mt-1 text-lg font-semibold text-emerald-300">
            {formatCop(summary?.posTotal ?? 0)}
          </p>
          <p className="text-xs text-zinc-500">Efectivo: {formatCop(posCash)}</p>
        </article>
        <article className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
          <p className="text-xs text-zinc-500">Facturas manuales hoy</p>
          <p className="mt-1 text-lg font-semibold text-amber-300">
            {formatCop(summary?.invoiceTotal ?? 0)}
          </p>
          <p className="text-xs text-zinc-500">Efectivo: {formatCop(invoiceCash)}</p>
        </article>
        <article className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
          <p className="text-xs text-zinc-500">Gastos hoy</p>
          <p className="mt-1 text-lg font-semibold text-rose-300">{formatCop(expenses)}</p>
          <p className="text-xs text-zinc-500">Deducido del efectivo</p>
        </article>
      </div>

      {/* ── SIN SESION ────────────────────────────────────────────────────────── */}
      {!session && (
        <div className="grid gap-4 lg:grid-cols-2">
          {isAdmin ? (
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
              <h2 className="text-xl font-semibold text-zinc-100">Abrir sesion del dia</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Define la base en efectivo que queda en caja al inicio del dia.
              </p>

              <div className="mt-4 grid gap-3">
                <label className="space-y-1">
                  <span className="text-xs text-zinc-400">Base en efectivo</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cashBaseInput}
                    onChange={(e) => setCashBaseInput(formatCopInput(e.target.value))}
                    placeholder="Ej: 50.000"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-zinc-400">Observaciones (opcional)</span>
                  <input
                    type="text"
                    value={notesOpenInput}
                    onChange={(e) => setNotesOpenInput(e.target.value)}
                    placeholder="Notas de apertura..."
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              {openFeedback ? (
                <p className="mt-2 text-xs text-amber-300">{openFeedback}</p>
              ) : null}

              <button
                type="button"
                onClick={() => { void handleOpenSession() }}
                disabled={openMutation.isPending}
                className="mt-4 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-70"
              >
                {openMutation.isPending ? 'Abriendo sesion...' : 'Abrir sesion de caja'}
              </button>
            </article>
          ) : (
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 space-y-4">
              <h2 className="text-xl font-semibold text-zinc-100">Abrir sesion del dia</h2>

              {lastSession ? (
                <>
                  <p className="text-xs text-zinc-500">
                    Base predeterminada de la ultima sesion. El administrador puede
                    ajustarla despues de abrir.
                  </p>
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex justify-between items-center">
                    <span className="text-sm text-zinc-400">Base en efectivo</span>
                    <span className="text-lg font-semibold text-amber-300">
                      {formatCop(lastSession.cash_base)}
                    </span>
                  </div>

                  {openFeedback ? (
                    <p className="text-xs text-amber-300">{openFeedback}</p>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => {
                      setCashBaseInput(String(Math.trunc(lastSession.cash_base)))
                      void handleOpenSession()
                    }}
                    disabled={openMutation.isPending}
                    className="w-full rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-70"
                  >
                    {openMutation.isPending ? 'Abriendo...' : 'Abrir sesion con esta base'}
                  </button>
                </>
              ) : lastSessionQuery.isLoading ? (
                <p className="text-xs text-zinc-500">Cargando base predeterminada...</p>
              ) : (
                <p className="text-sm text-zinc-400">
                  No hay sesiones anteriores. Pide al administrador que abra la sesion
                  y configure la base inicial.
                </p>
              )}
            </article>
          )}

          <SummaryBreakdown
            cashBase={cashBase}
            posCash={posCash}
            posCard={summary?.posCard ?? 0}
            posTransfer={summary?.posTransfer ?? 0}
            posTotal={summary?.posTotal ?? 0}
            invoiceCash={invoiceCash}
            invoiceByMethod={invoiceByMethod}
            invoiceTotal={summary?.invoiceTotal ?? 0}
            expenses={expenses}
            expectedCash={expectedCash}
            isLoading={summaryQuery.isLoading}
          />
        </div>
      )}

      {/* ── SESION ABIERTA ──────────────────────────────────────────────────── */}
      {session && session.status === 'open' && (
        <div className="space-y-4">
          {/* Banner de sesion abierta */}
          <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Sesion abierta
                </span>
                <p className="mt-2 text-sm text-zinc-400">
                  Base en caja:{' '}
                  <span className="font-semibold text-zinc-100">{formatCop(session.cash_base)}</span>
                </p>
                {session.notes_open ? (
                  <p className="mt-0.5 text-xs text-zinc-500">{session.notes_open}</p>
                ) : null}
              </div>
              <div className="flex gap-2">
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={openEditBaseModal}
                    className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
                  >
                    Editar base
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={openCloseModal}
                  className="rounded-lg bg-rose-400 px-3 py-2 text-sm font-semibold text-zinc-900"
                >
                  Cerrar caja
                </button>
              </div>
            </div>
          </article>

          {/* Grid movimientos + detalle por metodo */}
          <div className="grid gap-4 lg:grid-cols-2">
            <SummaryBreakdown
              cashBase={cashBase}
              posCash={posCash}
              posCard={summary?.posCard ?? 0}
              posTransfer={summary?.posTransfer ?? 0}
              posTotal={summary?.posTotal ?? 0}
              invoiceCash={invoiceCash}
              invoiceByMethod={invoiceByMethod}
              invoiceTotal={summary?.invoiceTotal ?? 0}
              expenses={expenses}
              expectedCash={expectedCash}
              isLoading={summaryQuery.isLoading}
            />

            {/* Detalle por metodo de pago */}
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
              <h2 className="text-xl font-semibold text-zinc-100">Desglose por metodo</h2>
              <div className="ghost-scrollbar mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
                <PayMethodRow label="Efectivo POS" value={posCash} color="text-zinc-200" />
                <PayMethodRow label="Tarjeta / Datafono" value={summary?.posCard ?? 0} color="text-zinc-200" />
                <PayMethodRow label="Transferencia POS" value={summary?.posTransfer ?? 0} color="text-zinc-200" />
                <div className="my-2 border-t border-zinc-800" />
                <PayMethodRow label="Efectivo facturas manuales" value={invoiceCash} color="text-zinc-200" />
                <PayMethodRow
                  label="Otros metodos facturas"
                  value={(summary?.invoiceTotal ?? 0) - invoiceCash}
                  color="text-zinc-200"
                />
                <div className="my-2 border-t border-zinc-800" />
                <PayMethodRow label="Gastos registrados" value={expenses} color="text-rose-300" />
                <div className="my-2 border-t border-zinc-700" />
                <div className="flex justify-between">
                  <span className="text-sm font-semibold text-zinc-300">Total neto del dia</span>
                  <span className="font-bold text-zinc-100">
                    {formatCop(
                      (summary?.posTotal ?? 0) + (summary?.invoiceTotal ?? 0) - expenses,
                    )}
                  </span>
                </div>
              </div>
            </article>
          </div>
        </div>
      )}

      {/* ── SESION CERRADA ──────────────────────────────────────────────────── */}
      {session && session.status === 'closed' && (
        <div className="space-y-4">
          {/* Banner cerrado */}
          <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
                  Sesion cerrada
                </span>
                <p className="mt-2 text-sm text-zinc-400">
                  La caja de hoy fue cerrada a las{' '}
                  {session.closed_at
                    ? new Intl.DateTimeFormat('es-CO', {
                        timeZone: 'America/Bogota',
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(session.closed_at))
                    : '—'}
                </p>
              </div>
            </div>
          </article>

          <div className="grid gap-4 lg:grid-cols-2">
            <SummaryBreakdown
              cashBase={cashBase}
              posCash={posCash}
              posCard={summary?.posCard ?? 0}
              posTransfer={summary?.posTransfer ?? 0}
              posTotal={summary?.posTotal ?? 0}
              invoiceCash={invoiceCash}
              invoiceByMethod={invoiceByMethod}
              invoiceTotal={summary?.invoiceTotal ?? 0}
              expenses={expenses}
              expectedCash={expectedCash}
              isLoading={summaryQuery.isLoading}
            />

            {/* Resultado del cierre */}
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-zinc-100">Resultado del cierre</h2>
                <button
                  type="button"
                  onClick={printCierre}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
                >
                  🖨️ Imprimir
                </button>
              </div>

              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Base apertura</span>
                  <span className="text-zinc-200">{formatCop(session.cash_base)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Efectivo esperado</span>
                  <span className="text-zinc-200">{formatCop(expectedCash)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Efectivo contado</span>
                  <span className="text-zinc-200">{formatCop(session.cash_counted ?? 0)}</span>
                </div>
                <div className="my-2 border-t border-zinc-800" />
                <div className="flex justify-between">
                  <span className="font-semibold text-zinc-300">Diferencia</span>
                  <span className={`font-bold text-base ${diffColor(closedDifference)}`}>
                    {diffLabel(closedDifference)}
                  </span>
                </div>
              </div>

              {session.notes_close ? (
                <p className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
                  Notas: {session.notes_close}
                </p>
              ) : null}
            </article>
          </div>

          {/* ── Preparar apertura del dia siguiente (solo admin) ─────────────── */}
          {isAdmin ? (
            <article className="rounded-2xl border border-zinc-700 bg-zinc-900/80 p-5">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-zinc-100">Apertura del dia siguiente</h2>
                {tomorrowSession ? (
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">
                    Preparada
                  </span>
                ) : null}
              </div>

              {tomorrowSession ? (
                <div className="mt-4 space-y-3">
                  <p className="text-xs text-zinc-500">
                    La sesion del{' '}
                    {new Intl.DateTimeFormat('es-CO', {
                      timeZone: 'America/Bogota',
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    }).format(new Date(`${tomorrowIso}T12:00:00`))}{' '}
                    ya fue preparada. Puedes ajustar la base antes de que inicie el dia.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-xs text-zinc-400">Base en efectivo</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={nextDayBaseInput || formatCopInput(Math.trunc(tomorrowSession.cash_base))}
                        onChange={(e) => {
                          setNextDayBaseInput(formatCopInput(e.target.value))
                          setNextDayFeedback(null)
                        }}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-zinc-400">Observaciones (opcional)</span>
                      <input
                        type="text"
                        value={nextDayNotesInput !== '' ? nextDayNotesInput : (tomorrowSession.notes_open ?? '')}
                        onChange={(e) => setNextDayNotesInput(e.target.value)}
                        placeholder="Notas de apertura..."
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  {nextDayFeedback ? (
                    <p className={`text-xs ${nextDayFeedback.startsWith('✓') ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {nextDayFeedback}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => { void handleUpdateTomorrow() }}
                    disabled={updateBaseMutation.isPending}
                    className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-50"
                  >
                    {updateBaseMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                </div>
              ) : (
                <>
                  <p className="mt-1 text-xs text-zinc-500">
                    Configura la base en efectivo para que el cajero pueda empezar a trabajar
                    mañana sin esperas.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-xs text-zinc-400">Base en efectivo</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={nextDayBaseInput}
                        onChange={(e) => {
                          setNextDayBaseInput(formatCopInput(e.target.value))
                          setNextDayFeedback(null)
                        }}
                        placeholder="Ej: 200.000"
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-zinc-400">Observaciones (opcional)</span>
                      <input
                        type="text"
                        value={nextDayNotesInput}
                        onChange={(e) => setNextDayNotesInput(e.target.value)}
                        placeholder="Notas de apertura..."
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  {nextDayFeedback ? (
                    <p className="mt-2 text-xs text-amber-300">{nextDayFeedback}</p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => { void handlePrepareTomorrow() }}
                    disabled={openMutation.isPending || !nextDayBaseInput}
                    className="mt-4 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-50"
                  >
                    {openMutation.isPending ? 'Preparando...' : 'Preparar apertura de mañana'}
                  </button>
                </>
              )}
            </article>
          ) : null}
        </div>
      )}

      {/* ── MODAL: editar base ──────────────────────────────────────────────── */}
      {showEditBaseModal ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
            <h3 className="text-lg font-semibold text-zinc-100">Editar base en efectivo</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Modifica la base que el cajero tendra al inicio.
            </p>

            <div className="mt-4 grid gap-3">
              <label className="space-y-1">
                <span className="text-xs text-zinc-400">Nueva base en efectivo</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={editBaseInput}
                  onChange={(e) => setEditBaseInput(formatCopInput(e.target.value))}
                  placeholder="Ej: 50.000"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-400">Observaciones</span>
                <input
                  type="text"
                  value={editNotesOpen}
                  onChange={(e) => setEditNotesOpen(e.target.value)}
                  placeholder="Notas de apertura..."
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                />
              </label>
            </div>

            {editBaseFeedback ? (
              <p className="mt-2 text-xs text-amber-300">{editBaseFeedback}</p>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowEditBaseModal(false)}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => { void handleUpdateBase() }}
                disabled={updateBaseMutation.isPending}
                className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-70"
              >
                {updateBaseMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── MODAL: cerrar caja ──────────────────────────────────────────────── */}
      {showCloseModal ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
            <h3 className="text-lg font-semibold text-zinc-100">Cerrar caja del dia</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Ingresa el efectivo fisico que hay en caja al cerrar.
            </p>

            {/* Resumen rapido */}
            <div className="mt-4 space-y-1.5 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-sm">
              <div className="flex justify-between text-zinc-400">
                <span>Base apertura</span>
                <span>{formatCop(cashBase)}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>+ Efectivo POS</span>
                <span>{formatCop(posCash)}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>+ Efectivo facturas</span>
                <span>{formatCop(invoiceCash)}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>- Gastos</span>
                <span>{formatCop(expenses)}</span>
              </div>
              <div className="border-t border-zinc-800 pt-1.5 flex justify-between font-semibold">
                <span className="text-zinc-300">Esperado en caja</span>
                <span className="text-zinc-100">{formatCop(expectedCash)}</span>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="space-y-1">
                <span className="text-xs text-zinc-400">Efectivo fisico contado</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cashCountedInput}
                  onChange={(e) => setCashCountedInput(formatCopInput(e.target.value))}
                  placeholder="Total contado..."
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                />
              </label>

              {/* Diferencia en tiempo real */}
              {cashCountedInput.replace(/[^\d]/g, '') !== '' ? (
                <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                  <span className="text-xs text-zinc-400">Diferencia</span>
                  <span className={`text-sm font-semibold ${diffColor(differenceLive)}`}>
                    {diffLabel(differenceLive)}
                  </span>
                </div>
              ) : null}

              <label className="space-y-1">
                <span className="text-xs text-zinc-400">Observaciones de cierre</span>
                <input
                  type="text"
                  value={notesCloseInput}
                  onChange={(e) => setNotesCloseInput(e.target.value)}
                  placeholder="Notas del cajero al cerrar..."
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                />
              </label>
            </div>

            {closeFeedback ? (
              <p className="mt-2 text-xs text-amber-300">{closeFeedback}</p>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowCloseModal(false)}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => { void handleCloseSession() }}
                disabled={
                  closeMutation.isPending || cashCountedInput.replace(/[^\d]/g, '') === ''
                }
                className="rounded-lg bg-rose-400 px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-70"
              >
                {closeMutation.isPending ? 'Cerrando...' : 'Confirmar cierre'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── MODAL: historial del mes (admin) ───────────────────────────── */}
      {showHistoryModal ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-900 p-5 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between shrink-0">
              <h3 className="text-lg font-semibold text-zinc-100">Historial de cierres — mes actual</h3>
              <button
                type="button"
                onClick={() => { setShowHistoryModal(false); setSelectedHistSession(null) }}
                className="text-zinc-500 hover:text-zinc-200 text-xl leading-none"
              >
                ×
              </button>
            </div>

            {selectedHistSession ? (
              // Vista detalle de sesión histórica
              <div className="overflow-y-auto ghost-scrollbar space-y-4">
                <button
                  type="button"
                  onClick={() => setSelectedHistSession(null)}
                  className="text-xs text-zinc-400 hover:text-zinc-200"
                >
                  ← Volver al historial
                </button>
                <p className="text-sm font-semibold text-zinc-300">
                  {new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long' }).format(
                    new Date(`${selectedHistSession.session_date}T12:00:00`)
                  )}
                </p>
                {histSummaryQuery.isLoading ? (
                  <p className="text-xs text-zinc-500">Cargando detalle...</p>
                ) : (
                  <div className="space-y-3 text-sm">
                    {/* Movimientos */}
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Movimientos</p>
                      <div className="flex justify-between"><span className="text-zinc-400">Base apertura</span><span className="text-zinc-200">{formatCop(selectedHistSession.cash_base)}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-400">Efectivo POS</span><span className="text-zinc-200">{formatCop(histSummary?.posCash ?? 0)}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-400">Tarjeta POS</span><span className="text-zinc-200">{formatCop(histSummary?.posCard ?? 0)}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-400">Transferencia POS</span><span className="text-zinc-200">{formatCop(histSummary?.posTransfer ?? 0)}</span></div>
                      <div className="border-t border-zinc-800 pt-1 flex justify-between font-medium"><span className="text-zinc-300">Total POS</span><span className="text-emerald-300">{formatCop(histSummary?.posTotal ?? 0)}</span></div>
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Facturas manuales</p>
                      <div className="flex justify-between"><span className="text-zinc-400">Efectivo</span><span className="text-zinc-200">{formatCop(histSummary?.invoiceCash ?? 0)}</span></div>
                      {Object.entries(histSummary?.invoiceByMethod ?? {}).map(([m, v]) => (
                        <div key={m} className="flex justify-between">
                          <span className="text-zinc-400">{{addi:'Addi',credilondon:'CREDILONDON',dataphone:'Datáfono',bancolombia:'Bancolombia',daviplata:'Daviplata',nequi:'Nequi'}[m] ?? m}</span>
                          <span className="text-zinc-200">{formatCop(v)}</span>
                        </div>
                      ))}
                      <div className="border-t border-zinc-800 pt-1 flex justify-between font-medium"><span className="text-zinc-300">Total facturas</span><span className="text-amber-300">{formatCop(histSummary?.invoiceTotal ?? 0)}</span></div>
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Cierre</p>
                      <div className="flex justify-between"><span className="text-zinc-400">Gastos</span><span className="text-rose-300">{formatCop(histSummary?.expensesTotal ?? 0)}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-400">Efectivo esperado</span><span className="text-zinc-200">{formatCop(selectedHistSession.cash_base + (histSummary?.posCash ?? 0) + (histSummary?.invoiceCash ?? 0) - (histSummary?.expensesTotal ?? 0))}</span></div>
                      {selectedHistSession.status === 'closed' && (
                        <>
                          <div className="flex justify-between"><span className="text-zinc-400">Efectivo contado</span><span className="text-zinc-200">{formatCop(selectedHistSession.cash_counted ?? 0)}</span></div>
                          <div className="border-t border-zinc-800 pt-1 flex justify-between font-semibold">
                            <span className="text-zinc-300">Diferencia</span>
                            <span className={(
                              () => {
                                const diff = (selectedHistSession.cash_counted ?? 0) - (selectedHistSession.cash_base + (histSummary?.posCash ?? 0) + (histSummary?.invoiceCash ?? 0) - (histSummary?.expensesTotal ?? 0))
                                return diff > 0 ? 'text-emerald-300' : diff < 0 ? 'text-rose-300' : 'text-zinc-300'
                              }
                            )()}>
                              {(() => {
                                const diff = (selectedHistSession.cash_counted ?? 0) - (selectedHistSession.cash_base + (histSummary?.posCash ?? 0) + (histSummary?.invoiceCash ?? 0) - (histSummary?.expensesTotal ?? 0))
                                if (diff > 0) return `Sobrante ${formatCop(diff)}`
                                if (diff < 0) return `Faltante ${formatCop(Math.abs(diff))}`
                                return 'Cuadra exacto'
                              })()}
                            </span>
                          </div>
                        </>
                      )}
                      {selectedHistSession.status === 'open' && (
                        <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-300">Sesión sin cerrar</div>
                      )}
                    </div>
                    {selectedHistSession.notes_close ? (
                      <p className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">Notas cierre: {selectedHistSession.notes_close}</p>
                    ) : null}
                  </div>
                )}
              </div>
            ) : (
              // Lista de sesiones
              <div className="overflow-y-auto ghost-scrollbar space-y-2">
                {historyQuery.isLoading ? (
                  <p className="text-xs text-zinc-500">Cargando historial...</p>
                ) : historySessions.length === 0 ? (
                  <p className="text-xs text-zinc-500">No hay sesiones este mes.</p>
                ) : (
                  historySessions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedHistSession(s)}
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-left hover:border-zinc-600 flex items-center justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-zinc-200">
                          {new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'short', day: 'numeric', month: 'short' }).format(
                            new Date(`${s.session_date}T12:00:00`)
                          )}
                        </p>
                        <p className="text-xs text-zinc-500">Base: {formatCop(s.cash_base)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.status === 'closed'
                            ? 'bg-zinc-800 text-zinc-400'
                            : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                        }`}>
                          {s.status === 'closed' ? 'Cerrada' : 'Abierta'}
                        </span>
                        <span className="text-xs text-zinc-500">›</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <CierreReceipt receiptRef={cierreReceiptRef} data={cierreReceiptData} />
    </section>
  )
}

// ─── Subcomponente: fila de metodo de pago ──────────────────────────────────
function PayMethodRow({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className={color}>{formatCop(value)}</span>
    </div>
  )
}

// ─── Subcomponente: desglose de movimientos ─────────────────────────────────
interface SummaryBreakdownProps {
  cashBase: number
  posCash: number
  posCard: number
  posTransfer: number
  posTotal: number
  invoiceCash: number
  invoiceByMethod: Record<string, number>
  invoiceTotal: number
  expenses: number
  expectedCash: number
  isLoading: boolean
}

const INVOICE_METHOD_LABELS: Record<string, string> = {
  addi: 'Addi',
  credilondon: 'CREDILONDON',
  dataphone: 'Datáfono',
  bancolombia: 'Bancolombia',
  daviplata: 'Daviplata',
  nequi: 'Nequi',
}

function SummaryBreakdown({
  cashBase,
  posCash,
  posCard,
  posTransfer,
  posTotal,
  invoiceCash,
  invoiceByMethod,
  invoiceTotal,
  expenses,
  expectedCash,
  isLoading,
}: SummaryBreakdownProps) {
  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
      <h2 className="text-xl font-semibold text-zinc-100">Movimientos del dia</h2>

      {isLoading ? (
        <p className="mt-3 text-xs text-zinc-500">Cargando movimientos...</p>
      ) : (
        <div className="ghost-scrollbar mt-4 max-h-80 space-y-4 overflow-y-auto pr-1">
          {/* Base */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
              Base apertura
            </p>
            <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 flex justify-between text-sm">
              <span className="text-zinc-400">Efectivo inicial</span>
              <span className="text-zinc-200">{formatCop(cashBase)}</span>
            </div>
          </div>

          {/* Ventas POS */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
              Ventas POS
            </p>
            <div className="space-y-1.5">
              <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 flex justify-between text-sm">
                <span className="text-zinc-400">Efectivo</span>
                <span className="text-zinc-200">{formatCop(posCash)}</span>
              </div>
              <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 flex justify-between text-sm">
                <span className="text-zinc-400">Tarjeta</span>
                <span className="text-zinc-200">{formatCop(posCard)}</span>
              </div>
              <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 flex justify-between text-sm">
                <span className="text-zinc-400">Transferencia</span>
                <span className="text-zinc-200">{formatCop(posTransfer)}</span>
              </div>
              <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 flex justify-between text-sm font-medium">
                <span className="text-zinc-300">Total POS</span>
                <span className="text-emerald-300">{formatCop(posTotal)}</span>
              </div>
            </div>
          </div>

          {/* Facturas manuales */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
              Facturas Manuales
            </p>
            <div className="space-y-1.5">
              <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 flex justify-between text-sm">
                <span className="text-zinc-400">Efectivo</span>
                <span className="text-zinc-200">{formatCop(invoiceCash)}</span>
              </div>
              {Object.entries(invoiceByMethod).map(([method, amount]) => (
                <div key={method} className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 flex justify-between text-sm">
                  <span className="text-zinc-400">{INVOICE_METHOD_LABELS[method] ?? method}</span>
                  <span className="text-zinc-200">{formatCop(amount)}</span>
                </div>
              ))}
              <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 flex justify-between text-sm font-medium">
                <span className="text-zinc-300">Total facturas</span>
                <span className="text-amber-300">{formatCop(invoiceTotal)}</span>
              </div>
            </div>
          </div>

          {/* Gastos */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
              Gastos
            </p>
            <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 flex justify-between text-sm font-medium">
              <span className="text-zinc-300">Total gastos</span>
              <span className="text-rose-300">{formatCop(expenses)}</span>
            </div>
          </div>

          {/* Efectivo esperado */}
          <div className="rounded-xl border border-zinc-700 bg-zinc-800/40 px-4 py-3 flex justify-between items-center">
            <span className="text-sm font-semibold text-zinc-300">Efectivo esperado en caja</span>
            <span className="font-bold text-zinc-100">{formatCop(expectedCash)}</span>
          </div>
        </div>
      )}
    </article>
  )
}
