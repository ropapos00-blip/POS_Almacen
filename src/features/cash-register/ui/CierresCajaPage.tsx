import { useEffect, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import { formatCop } from '../../../shared/utils/currency'
import { addDaysToIsoDate, getTodayIsoDateColombia } from '../../../shared/utils/dateTime'
import { formatCopInput, parseCopIntegerInput } from '../../../shared/utils/numberInput'
import { useAuthStore } from '../../auth/model/useAuthStore'
import {
  useActiveSessionQuery,
  useCloseSessionMutation,
  useDaySalesSummaryQuery,
  useMostRecentSessionQuery,
  useOpenSessionMutation,
  useSessionsByRangeQuery,
  useUpdateCashBaseMutation,
} from '../model/useCashRegisterQueries'
import type { CashRegisterSession } from '../model/cashRegister.types'
import { CierreReceipt } from './CierreReceipt'
import type { CierreReceiptData } from './CierreReceipt'

export function CierresCajaPage() {
  const user = useAuthStore((state) => state.user)
  const storeId = user?.storeId
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  const canCashierClose = user?.role !== 'cashier' || user?.storeAllowCashierClose === true
  const todayIso = getTodayIsoDateColombia()
  const tomorrowIso = addDaysToIsoDate(todayIso, 1)

  const cierreReceiptRef = useRef<HTMLDivElement>(null)

  // ─── Queries ────────────────────────────────────────────────────────────────
  // Sesion activa: la que esta ABIERTA (puede ser de dias anteriores si no fue cerrada)
  const activeSessionQuery = useActiveSessionQuery(storeId)
  const activeSession = activeSessionQuery.data ?? null

  // Sesion mas reciente (fallback para mostrar vista de cierre tras cerrar una sesion multi-dia)
  const recentSessionQuery = useMostRecentSessionQuery(storeId)
  const recentSession = recentSessionQuery.data ?? null

  // La sesion operativa es la abierta; si no hay ninguna, la mas reciente (cerrada)
  const session = activeSession ?? recentSession

  // Rango de fechas del resumen: desde que se abrio la sesion hasta hoy
  const summaryFromDate = session?.session_date ?? todayIso
  const summaryToDate = todayIso
  const isMultiDay = summaryFromDate !== summaryToDate

  const summaryQuery = useDaySalesSummaryQuery(storeId, summaryFromDate, summaryToDate)
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
  const [closeFeedback, setCloseFeedback] = useState<string | null>(null)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [pendingPrintData, setPendingPrintData] = useState<CierreReceiptData | null>(null)

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
  // Para sesiones abiertas el rango llega hasta hoy para incluir todos los dias
  const histSummaryQuery = useDaySalesSummaryQuery(
    isAdmin && selectedHistSession ? storeId : undefined,
    selectedHistSession?.session_date ?? '',
    selectedHistSession?.status === 'open' ? todayIso : (selectedHistSession?.session_date ?? ''),
  )
  const histSummary = histSummaryQuery.data

  // ─── Calculos ────────────────────────────────────────────────────────────────
  const cashBase = session?.cash_base ?? 0
  const posCash = summary?.posCash ?? 0
  const invoiceCash = summary?.invoiceCash ?? 0
  const layawayCash = summary?.layawayCash ?? 0
  const expenses = summary?.expensesTotal ?? 0
  const expectedCash = cashBase + posCash + invoiceCash + layawayCash - expenses

  const totalDigital = (summary?.posCard ?? 0) + (summary?.posTransfer ?? 0)
    + Object.values(summary?.invoiceByMethod ?? {}).reduce((a, b) => a + b, 0)
    + Object.values(summary?.layawayByMethod ?? {}).reduce((a, b) => a + b, 0)

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
    if (!canCashierClose) return
    setCloseFeedback(null)
    setShowCloseModal(true)
  }

  async function handleCloseSession() {
    if (!canCashierClose) {
      setCloseFeedback('Solo admin puede cerrar caja en esta tienda.')
      return
    }
    setCloseFeedback(null)
    if (!session || !user?.id) return
    try {
      await closeMutation.mutateAsync({
        sessionId: session.id,
        closedBy: user.id,
        cashCounted: expectedCash,
        notesClose: '',
      })
      // Construir datos del tique con los valores actuales antes de que el query se invalide
      setPendingPrintData({
        sessionDate: new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${session.session_date}T12:00:00`)),
        closedAt: new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' }).format(new Date()),
        cashBase,
        posByMethod,
        posCash,
        posCard: summary?.posCard ?? 0,
        posTransfer: summary?.posTransfer ?? 0,
        posTotal: summary?.posTotal ?? 0,
        invoiceCash,
        invoiceByMethod,
        invoiceTotal: summary?.invoiceTotal ?? 0,
        layawayCash,
        layawayByMethod,
        layawayTotal: summary?.layawayTotal ?? 0,
        expenses,
        expectedCash,
        cashCounted: expectedCash,
        difference: 0,
        notesClose: null,
        cashierName: user.fullName ?? user.email ?? '—',
      })
      setShowCloseModal(false)
    } catch (e) {
      setCloseFeedback(e instanceof Error ? e.message : 'Error al cerrar la sesion.')
    }
  }

  async function handleCloseHistSession() {
    if (!selectedHistSession || !user?.id) return
    try {
      await closeMutation.mutateAsync({
        sessionId: selectedHistSession.id,
        closedBy: user.id,
        cashCounted: 0,
        notesClose: '',
      })
      setSelectedHistSession({ ...selectedHistSession, status: 'closed', cash_counted: 0, closed_at: new Date().toISOString() })
    } catch (e) {
      console.error(e)
    }
  }

  /**
   * Abre una nueva sesion desde la vista de caja cerrada.
   * Para admin usa el formulario (cashBaseInput/notesOpenInput).
   * Para cajero usa la base de la sesion cerrada directamente,
   * evitando el bug de batching de estado de React.
   */
  async function handleOpenFromClosed() {
    setOpenFeedback(null)
    if (!storeId || !user?.id) return
    const base = isAdmin
      ? parseCopIntegerInput(cashBaseInput)
      : Math.trunc(session?.cash_base ?? 0)
    if (base < 0) {
      setOpenFeedback('La base en efectivo no puede ser negativa.')
      return
    }
    try {
      await openMutation.mutateAsync({
        storeId,
        openedBy: user.id,
        cashBase: base,
        notesOpen: isAdmin ? notesOpenInput : '',
      })
      setCashBaseInput('')
      setNotesOpenInput('')
    } catch (e) {
      setOpenFeedback(e instanceof Error ? e.message : 'Error al abrir la sesion.')
    }
  }

  function printCierre() {
    handlePrintCierre()
  }


  const invoiceByMethod = summary?.invoiceByMethod ?? {}
  const posByMethod = summary?.posByMethod ?? {}
  const layawayByMethod = summary?.layawayByMethod ?? {}

  const cierreReceiptData: CierreReceiptData | null =
    session?.status === 'closed'
      ? {
          sessionDate: new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${session.session_date}T12:00:00`)),
          closedAt: session.closed_at
            ? new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' }).format(new Date(session.closed_at))
            : null,
          cashBase,
          posByMethod,
          posCash,
          posCard: summary?.posCard ?? 0,
          posTransfer: summary?.posTransfer ?? 0,
          posTotal: summary?.posTotal ?? 0,
          invoiceCash,
          invoiceByMethod,
          invoiceTotal: summary?.invoiceTotal ?? 0,
          layawayCash,
          layawayByMethod,
          layawayTotal: summary?.layawayTotal ?? 0,
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

  // Disparar impresion automatica al cerrar caja
  useEffect(() => {
    if (pendingPrintData) {
      handlePrintCierre()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrintData])

  if (activeSessionQuery.isLoading || recentSessionQuery.isLoading) {
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <article className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
          <p className="text-xs text-zinc-500">Efectivo en caja</p>
          <p className="mt-1 text-lg font-semibold text-zinc-100">{formatCop(expectedCash)}</p>
          <p className="text-xs text-zinc-500">Base + ingresos - gastos</p>
        </article>
        <article className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
          <p className="text-xs text-zinc-500">{isMultiDay ? 'Ventas POS del periodo' : 'Ventas POS hoy'}</p>
          <p className="mt-1 text-lg font-semibold text-emerald-300">
            {formatCop(summary?.posTotal ?? 0)}
          </p>
          <p className="text-xs text-zinc-500">Efectivo: {formatCop(posCash)}</p>
        </article>
        <article className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
          <p className="text-xs text-zinc-500">{isMultiDay ? 'Facturas manuales del periodo' : 'Facturas manuales hoy'}</p>
          <p className="mt-1 text-lg font-semibold text-amber-300">
            {formatCop(summary?.invoiceTotal ?? 0)}
          </p>
          <p className="text-xs text-zinc-500">Efectivo: {formatCop(invoiceCash)}</p>
        </article>
        <article className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
          <p className="text-xs text-zinc-500">{isMultiDay ? 'Separados del periodo' : 'Separados hoy'}</p>
          <p className="mt-1 text-lg font-semibold text-sky-300">
            {formatCop(summary?.layawayTotal ?? 0)}
          </p>
          <p className="text-xs text-zinc-500">Efectivo: {formatCop(layawayCash)}</p>
        </article>
        <article className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
          <p className="text-xs text-zinc-500">{isMultiDay ? 'Gastos del periodo' : 'Gastos hoy'}</p>
          <p className="mt-1 text-lg font-semibold text-rose-300">{formatCop(expenses)}</p>
          <p className="text-xs text-zinc-500">Deducido del efectivo</p>
        </article>
      </div>

      {/* ── SIN SESION (nunca se ha abierto una caja) ─────────────────────────── */}
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
              <p className="text-sm text-zinc-400">
                No hay sesiones anteriores. Pide al administrador que abra la sesion
                y configure la base inicial.
              </p>
            </article>
          )}

          <SummaryBreakdown
            cashBase={cashBase}
            posByMethod={posByMethod}
            posCash={posCash}
            posCard={summary?.posCard ?? 0}
            posTransfer={summary?.posTransfer ?? 0}
            posTotal={summary?.posTotal ?? 0}
            invoiceCash={invoiceCash}
            invoiceByMethod={invoiceByMethod}
            invoiceTotal={summary?.invoiceTotal ?? 0}
            layawayCash={layawayCash}
            layawayByMethod={layawayByMethod}
            layawayTotal={summary?.layawayTotal ?? 0}
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
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Sesion abierta
                  </span>
                  {isMultiDay ? (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-300">
                      Desde el{' '}
                      {new Intl.DateTimeFormat('es-CO', {
                        timeZone: 'America/Bogota',
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      }).format(new Date(`${session.session_date}T12:00:00`))}
                    </span>
                  ) : null}
                </div>
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
                  disabled={!canCashierClose}
                  className="rounded-lg bg-rose-400 px-3 py-2 text-sm font-semibold text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cerrar caja
                </button>
                {!canCashierClose ? (
                  <p className="text-xs text-amber-300">Solo admin puede cerrar caja.</p>
                ) : null}
              </div>
            </div>
          </article>

          {/* Panel unificado de movimientos */}
          <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
            <h2 className="text-xl font-semibold text-zinc-100">{isMultiDay ? 'Movimientos del periodo' : 'Movimientos del dia'}</h2>
            {summaryQuery.isLoading ? (
              <p className="mt-3 text-xs text-zinc-500">Cargando movimientos...</p>
            ) : (
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                {/* Columna izquierda: detalle por sección */}
                <div className="ghost-scrollbar space-y-4 overflow-y-auto max-h-80 pr-1">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Base apertura</p>
                    <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 flex justify-between text-sm">
                      <span className="text-zinc-400">Efectivo inicial</span>
                      <span className="text-zinc-200">{formatCop(cashBase)}</span>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Ventas POS</p>
                    <div className="space-y-1.5">
                      {Object.entries(posByMethod).map(([method, amount]) => (
                        <div key={method} className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 flex justify-between text-sm">
                          <span className="text-zinc-400">{INVOICE_METHOD_LABELS[method] ?? method}</span>
                          <span className="text-zinc-200">{formatCop(amount)}</span>
                        </div>
                      ))}
                      <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 flex justify-between text-sm font-medium">
                        <span className="text-zinc-300">Total POS</span>
                        <span className="text-emerald-300">{formatCop(summary?.posTotal ?? 0)}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Facturas manuales</p>
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
                        <span className="text-amber-300">{formatCop(summary?.invoiceTotal ?? 0)}</span>
                      </div>
                    </div>
                  </div>

                  {(summary?.layawayTotal ?? 0) > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Separados</p>
                      <div className="space-y-1.5">
                        {layawayCash > 0 && (
                          <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 flex justify-between text-sm">
                            <span className="text-zinc-400">Efectivo</span>
                            <span className="text-zinc-200">{formatCop(layawayCash)}</span>
                          </div>
                        )}
                        {Object.entries(layawayByMethod).map(([method, amount]) => (
                          <div key={method} className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 flex justify-between text-sm">
                            <span className="text-zinc-400">{INVOICE_METHOD_LABELS[method] ?? method}</span>
                            <span className="text-zinc-200">{formatCop(amount)}</span>
                          </div>
                        ))}
                        <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 flex justify-between text-sm font-medium">
                          <span className="text-zinc-300">Total separados</span>
                          <span className="text-sky-300">{formatCop(summary?.layawayTotal ?? 0)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Gastos</p>
                    <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 flex justify-between text-sm font-medium">
                      <span className="text-zinc-300">Total gastos</span>
                      <span className="text-rose-300">{formatCop(expenses)}</span>
                    </div>
                  </div>
                </div>

                {/* Columna derecha: desglose compacto + totales */}
                <div className="space-y-2 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Desglose por metodo</p>
                  {Object.entries(posByMethod).map(([m, v]) => (
                    <PayMethodRow key={`pos-${m}`} label={`${INVOICE_METHOD_LABELS[m] ?? m} POS`} value={v} color="text-zinc-200" />
                  ))}
                  <div className="border-t border-zinc-800" />
                  <PayMethodRow label="Efectivo facturas" value={invoiceCash} color="text-zinc-200" />
                  {Object.entries(invoiceByMethod).map(([m, v]) => (
                    <PayMethodRow key={m} label={INVOICE_METHOD_LABELS[m] ?? m} value={v} color="text-zinc-200" />
                  ))}
                  <div className="border-t border-zinc-800" />
                  {(summary?.layawayTotal ?? 0) > 0 && (
                    <>
                      <PayMethodRow label="Efectivo separados" value={layawayCash} color="text-zinc-200" />
                      {Object.entries(layawayByMethod).map(([m, v]) => (
                        <PayMethodRow key={`lay-${m}`} label={`${INVOICE_METHOD_LABELS[m] ?? m} separados`} value={v} color="text-zinc-200" />
                      ))}
                      <div className="border-t border-zinc-800" />
                    </>
                  )}
                  <PayMethodRow label="Gastos registrados" value={expenses} color="text-rose-300" />
                  <div className="border-t border-zinc-700" />
                  <div className="rounded-xl border border-zinc-700 bg-zinc-800/40 px-4 py-2.5 flex justify-between items-center">
                    <span className="text-xs font-semibold text-zinc-300">{isMultiDay ? 'Total neto del periodo' : 'Total neto del dia'}</span>
                    <span className="font-bold text-zinc-100">{formatCop((summary?.posTotal ?? 0) + (summary?.invoiceTotal ?? 0) + (summary?.layawayTotal ?? 0) - expenses)}</span>
                  </div>
                  <div className="rounded-xl border border-zinc-700 bg-zinc-800/40 px-4 py-2.5 flex justify-between items-center">
                    <span className="text-xs font-semibold text-zinc-300">Efectivo esperado en caja</span>
                    <span className="font-bold text-zinc-100">{formatCop(expectedCash)}</span>
                  </div>
                </div>
              </div>
            )}
          </article>
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
                  {isMultiDay
                    ? `Sesion del ${new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${session.session_date}T12:00:00`))} cerrada el ${new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(session.closed_at ?? Date.now()))} a las ${session.closed_at ? new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' }).format(new Date(session.closed_at)) : '—'}`
                    : `La caja de hoy fue cerrada a las ${session.closed_at ? new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' }).format(new Date(session.closed_at)) : '—'}`
                  }
                </p>
              </div>
            </div>
          </article>

          <div className="grid gap-4 lg:grid-cols-2">
            <SummaryBreakdown
              cashBase={cashBase}
              posByMethod={posByMethod}
              posCash={posCash}
              posCard={summary?.posCard ?? 0}
              posTransfer={summary?.posTransfer ?? 0}
              posTotal={summary?.posTotal ?? 0}
              invoiceCash={invoiceCash}
              invoiceByMethod={invoiceByMethod}
              invoiceTotal={summary?.invoiceTotal ?? 0}
              layawayCash={layawayCash}
              layawayByMethod={layawayByMethod}
              layawayTotal={summary?.layawayTotal ?? 0}
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
                  <span className="text-zinc-400">Gastos</span>
                  <span className="text-rose-300">{formatCop(expenses)}</span>
                </div>
                <div className="my-2 border-t border-zinc-800" />
                <div className="flex justify-between">
                  <span className="text-zinc-300 font-semibold">Total efectivo en caja</span>
                  <span className="text-zinc-100 font-bold">{formatCop(expectedCash)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-300 font-semibold">Total plataformas digitales</span>
                  <span className="text-amber-300 font-bold">{formatCop(totalDigital)}</span>
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

          {/* ── Abrir nueva sesion (disponible para todos al haber caja cerrada) ─── */}
          <article className="rounded-2xl border border-zinc-700 bg-zinc-900/80 p-5">
            <h2 className="text-xl font-semibold text-zinc-100">Abrir nueva sesion</h2>
            <p className="mt-1 text-xs text-zinc-500">
              {isAdmin
                ? 'Define la base en efectivo para la nueva sesion.'
                : `Base de la ultima sesion. El administrador puede ajustarla despues de abrir.`}
            </p>

            {isAdmin ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
            ) : (
              <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex justify-between items-center">
                <span className="text-sm text-zinc-400">Base en efectivo</span>
                <span className="text-lg font-semibold text-amber-300">
                  {formatCop(session.cash_base)}
                </span>
              </div>
            )}

            {openFeedback ? (
              <p className="mt-2 text-xs text-amber-300">{openFeedback}</p>
            ) : null}

            <button
              type="button"
              onClick={() => { void handleOpenFromClosed() }}
              disabled={openMutation.isPending || (isAdmin && !cashBaseInput)}
              className="mt-4 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-70"
            >
              {openMutation.isPending ? 'Abriendo sesion...' : 'Abrir sesion de caja'}
            </button>
          </article>
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-3">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 flex flex-col max-h-[85vh]">
            {/* Cabecera */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
              <h3 className="text-sm font-semibold text-zinc-100">
                {isMultiDay ? 'Resumen del periodo' : 'Resumen del dia'}
              </h3>
              <button
                type="button"
                onClick={() => setShowCloseModal(false)}
                className="h-6 w-6 rounded-full bg-zinc-800 text-zinc-400 hover:text-zinc-100 flex items-center justify-center text-sm leading-none"
              >
                ×
              </button>
            </div>

            {/* Cuerpo con scroll */}
            <div className="overflow-y-auto ghost-scrollbar flex-1 px-3 py-3 space-y-2 text-xs">
              {/* POS */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 space-y-1.5">
                <p className="text-zinc-500 uppercase tracking-wider font-semibold">Ventas POS</p>
                {Object.entries(posByMethod).map(([m, v]) => (
                  <Row key={m} label={INVOICE_METHOD_LABELS[m] ?? m} value={formatCop(v)} />
                ))}
                <div className="border-t border-zinc-800 pt-1.5">
                  <Row label="Total POS" value={formatCop(summary?.posTotal ?? 0)} valueClass="text-emerald-300 font-semibold" />
                </div>
              </div>

              {/* Facturas manuales */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 space-y-1.5">
                <p className="text-zinc-500 uppercase tracking-wider font-semibold">Facturas manuales</p>
                <Row label="Efectivo" value={formatCop(invoiceCash)} />
                {Object.entries(invoiceByMethod).map(([m, v]) => (
                  <Row key={m} label={INVOICE_METHOD_LABELS[m] ?? m} value={formatCop(v)} />
                ))}
                <div className="border-t border-zinc-800 pt-1.5">
                  <Row label="Total facturas" value={formatCop(summary?.invoiceTotal ?? 0)} valueClass="text-amber-300 font-semibold" />
                </div>
              </div>

              {/* Separados */}
              {(summary?.layawayTotal ?? 0) > 0 && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 space-y-1.5">
                  <p className="text-zinc-500 uppercase tracking-wider font-semibold">Separados</p>
                  {layawayCash > 0 && <Row label="Efectivo" value={formatCop(layawayCash)} />}
                  {Object.entries(layawayByMethod).map(([m, v]) => (
                    <Row key={m} label={INVOICE_METHOD_LABELS[m] ?? m} value={formatCop(v)} />
                  ))}
                  <div className="border-t border-zinc-800 pt-1.5">
                    <Row label="Total separados" value={formatCop(summary?.layawayTotal ?? 0)} valueClass="text-sky-300 font-semibold" />
                  </div>
                </div>
              )}

              {/* Gastos + Efectivo esperado */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 space-y-1.5">
                <p className="text-zinc-500 uppercase tracking-wider font-semibold">Cierre</p>
                <Row label="Base apertura" value={formatCop(cashBase)} />
                <Row label="Gastos registrados" value={formatCop(expenses)} valueClass="text-rose-300" />
                <div className="border-t border-zinc-800 pt-1.5">
                  <Row label="Efectivo esperado en caja" value={formatCop(expectedCash)} valueClass="text-zinc-100 font-semibold" />
                </div>
                <div className="border-t border-zinc-800 pt-1.5">
                  <Row
                    label={isMultiDay ? 'Total neto del periodo' : 'Total neto del dia'}
                    value={formatCop((summary?.posTotal ?? 0) + (summary?.invoiceTotal ?? 0) + (summary?.layawayTotal ?? 0) - expenses)}
                    valueClass="text-zinc-100 font-bold"
                  />
                </div>
              </div>

              {closeFeedback ? (
                <p className="text-amber-300 px-1">{closeFeedback}</p>
              ) : null}
            </div>

            {/* Footer con botones */}
            <div className="grid grid-cols-2 gap-2 px-3 py-3 border-t border-zinc-800 shrink-0">
              <button
                type="button"
                onClick={() => setShowCloseModal(false)}
                className="rounded-xl border border-zinc-700 py-2.5 text-xs text-zinc-300 hover:text-zinc-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => { void handleCloseSession() }}
                disabled={closeMutation.isPending}
                className="rounded-xl bg-rose-400 py-2.5 text-xs font-semibold text-zinc-900 disabled:opacity-60"
              >
                {closeMutation.isPending ? 'Cerrando...' : 'Cerrar e imprimir'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── MODAL: historial del mes (admin) ───────────────────────────── */}
      {showHistoryModal ? (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-3">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 flex flex-col max-h-[85vh]">
            {/* Cabecera fija */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
              <h3 className="text-sm font-semibold text-zinc-100">
                {selectedHistSession ? (
                  <button
                    type="button"
                    onClick={() => setSelectedHistSession(null)}
                    className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-100"
                  >
                    <span className="text-base leading-none">‹</span>
                    Historial
                  </button>
                ) : 'Historial del mes'}
              </h3>
              <button
                type="button"
                onClick={() => { setShowHistoryModal(false); setSelectedHistSession(null) }}
                className="h-6 w-6 rounded-full bg-zinc-800 text-zinc-400 hover:text-zinc-100 flex items-center justify-center text-sm leading-none"
              >
                ×
              </button>
            </div>

            {/* Cuerpo con scroll */}
            <div className="overflow-y-auto ghost-scrollbar flex-1 px-3 py-3 space-y-2">
              {selectedHistSession ? (
                /* ── Detalle de sesión ── */
                <div className="space-y-2 text-xs">
                  {/* Encabezado fecha + estado */}
                  <div className="flex items-center justify-between pb-1">
                    <p className="text-sm font-medium text-zinc-200 capitalize">
                      {new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long' }).format(
                        new Date(`${selectedHistSession.session_date}T12:00:00`)
                      )}
                    </p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      selectedHistSession.status === 'closed'
                        ? 'bg-zinc-800 text-zinc-400'
                        : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                    }`}>
                      {selectedHistSession.status === 'closed' ? 'Cerrada' : 'Abierta'}
                    </span>
                  </div>

                  {histSummaryQuery.isLoading ? (
                    <p className="text-zinc-500 py-2">Cargando detalle...</p>
                  ) : (
                    <>
                      {/* POS */}
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 space-y-1.5">
                        <p className="text-zinc-500 uppercase tracking-wider font-semibold">POS</p>
                        <Row label="Base apertura" value={formatCop(selectedHistSession.cash_base)} />
                        <Row label="Efectivo" value={formatCop(histSummary?.posCash ?? 0)} />
                        <Row label="Tarjeta" value={formatCop(histSummary?.posCard ?? 0)} />
                        <Row label="Transferencia" value={formatCop(histSummary?.posTransfer ?? 0)} />
                        <div className="border-t border-zinc-800 pt-1.5">
                          <Row label="Total POS" value={formatCop(histSummary?.posTotal ?? 0)} valueClass="text-emerald-300 font-medium" />
                        </div>
                      </div>

                      {/* Facturas */}
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 space-y-1.5">
                        <p className="text-zinc-500 uppercase tracking-wider font-semibold">Facturas manuales</p>
                        <Row label="Efectivo" value={formatCop(histSummary?.invoiceCash ?? 0)} />
                        {Object.entries(histSummary?.invoiceByMethod ?? {}).map(([m, v]) => (
                          <Row key={m} label={{addi:'Addi',credilondon:'CREDILONDON',dataphone:'Datáfono',bancolombia:'Bancolombia',daviplata:'Daviplata',nequi:'Nequi'}[m] ?? m} value={formatCop(v)} />
                        ))}
                        <div className="border-t border-zinc-800 pt-1.5">
                          <Row label="Total facturas" value={formatCop(histSummary?.invoiceTotal ?? 0)} valueClass="text-amber-300 font-medium" />
                        </div>
                      </div>

                      {/* Separados */}
                      {(histSummary?.layawayTotal ?? 0) > 0 && (
                        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 space-y-1.5">
                          <p className="text-zinc-500 uppercase tracking-wider font-semibold">Separados</p>
                          {(histSummary?.layawayCash ?? 0) > 0 && (
                            <Row label="Efectivo" value={formatCop(histSummary?.layawayCash ?? 0)} />
                          )}
                          {Object.entries(histSummary?.layawayByMethod ?? {}).map(([m, v]) => (
                            <Row key={m} label={{addi:'Addi',credilondon:'CREDILONDON',dataphone:'Datáfono',bancolombia:'Bancolombia',daviplata:'Daviplata',nequi:'Nequi'}[m] ?? m} value={formatCop(v)} />
                          ))}
                          <div className="border-t border-zinc-800 pt-1.5">
                            <Row label="Total separados" value={formatCop(histSummary?.layawayTotal ?? 0)} valueClass="text-sky-300 font-medium" />
                          </div>
                        </div>
                      )}

                      {/* Cierre */}
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 space-y-1.5">
                        <p className="text-zinc-500 uppercase tracking-wider font-semibold">Cierre</p>
                        <Row label="Gastos" value={formatCop(histSummary?.expensesTotal ?? 0)} valueClass="text-rose-300" />
                        <div className="border-t border-zinc-800 pt-1.5">
                          <Row
                            label="Total efectivo en caja"
                            value={formatCop(selectedHistSession.cash_base + (histSummary?.posCash ?? 0) + (histSummary?.invoiceCash ?? 0) + (histSummary?.layawayCash ?? 0) - (histSummary?.expensesTotal ?? 0))}
                            valueClass="text-zinc-100 font-bold"
                          />
                        </div>
                        <Row
                          label="Total plataformas digitales"
                          value={formatCop(
                            (histSummary?.posCard ?? 0) + (histSummary?.posTransfer ?? 0)
                            + Object.values(histSummary?.invoiceByMethod ?? {}).reduce((a, b) => a + b, 0)
                            + Object.values(histSummary?.layawayByMethod ?? {}).reduce((a, b) => a + b, 0)
                          )}
                          valueClass="text-amber-300 font-semibold"
                        />
                      </div>

                      {selectedHistSession.notes_close ? (
                        <p className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-400">
                          Notas: {selectedHistSession.notes_close}
                        </p>
                      ) : null}

                      {/* Boton cierre para sesiones abiertas */}
                      {selectedHistSession.status === 'open' && (
                        <button
                          type="button"
                          onClick={() => { void handleCloseHistSession() }}
                          disabled={closeMutation.isPending}
                          className="w-full rounded-xl bg-rose-400 py-2.5 text-xs font-semibold text-zinc-900 disabled:opacity-50"
                        >
                          {closeMutation.isPending ? 'Cerrando...' : 'Cerrar sesion'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              ) : (
                /* ── Lista de sesiones ── */
                <>
                  {historyQuery.isLoading ? (
                    <p className="text-xs text-zinc-500 py-2">Cargando historial...</p>
                  ) : historySessions.length === 0 ? (
                    <p className="text-xs text-zinc-500 py-2">No hay sesiones este mes.</p>
                  ) : (
                    historySessions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedHistSession(s)}
                        className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-left hover:border-zinc-600 flex items-center justify-between gap-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-zinc-200 capitalize">
                            {new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'short', day: 'numeric', month: 'short' }).format(
                              new Date(`${s.session_date}T12:00:00`)
                            )}
                          </p>
                          <p className="text-xs text-zinc-500">Base: {formatCop(s.cash_base)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            s.status === 'closed'
                              ? 'bg-zinc-800 text-zinc-400'
                              : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                          }`}>
                            {s.status === 'closed' ? 'Cerrada' : 'Abierta'}
                          </span>
                          <span className="text-zinc-600 text-xs">›</span>
                        </div>
                      </button>
                    ))
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <CierreReceipt receiptRef={cierreReceiptRef} data={pendingPrintData ?? cierreReceiptData} />
    </section>
  )
}

// ─── Subcomponente: fila label/valor compacta (usada en modal historial) ────
function Row({ label, value, valueClass = 'text-zinc-200' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-zinc-400">{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
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
  posByMethod: Record<string, number>
  posCash: number
  posCard: number
  posTransfer: number
  posTotal: number
  invoiceCash: number
  invoiceByMethod: Record<string, number>
  invoiceTotal: number
  layawayCash: number
  layawayByMethod: Record<string, number>
  layawayTotal: number
  expenses: number
  expectedCash: number
  isLoading: boolean
}

const INVOICE_METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  addi: 'Addi',
  credilondon: 'CREDILONDON',
  dataphone: 'Datáfono',
  bancolombia: 'Bancolombia',
  daviplata: 'Daviplata',
  nequi: 'Nequi',
}

function SummaryBreakdown({
  cashBase,
  posByMethod,
  posCash: _posCash,
  posCard: _posCard,
  posTransfer: _posTransfer,
  posTotal,
  invoiceCash,
  invoiceByMethod,
  invoiceTotal,
  layawayCash,
  layawayByMethod,
  layawayTotal,
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
              {Object.entries(posByMethod).map(([method, amount]) => (
                <div key={method} className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 flex justify-between text-sm">
                  <span className="text-zinc-400">{INVOICE_METHOD_LABELS[method] ?? method}</span>
                  <span className="text-zinc-200">{formatCop(amount)}</span>
                </div>
              ))}
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

          {/* Separados */}
          {layawayTotal > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                Separados
              </p>
              <div className="space-y-1.5">
                {layawayCash > 0 && (
                  <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 flex justify-between text-sm">
                    <span className="text-zinc-400">Efectivo</span>
                    <span className="text-zinc-200">{formatCop(layawayCash)}</span>
                  </div>
                )}
                {Object.entries(layawayByMethod).map(([method, amount]) => (
                  <div key={method} className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 flex justify-between text-sm">
                    <span className="text-zinc-400">{INVOICE_METHOD_LABELS[method] ?? method}</span>
                    <span className="text-zinc-200">{formatCop(amount)}</span>
                  </div>
                ))}
                <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 flex justify-between text-sm font-medium">
                  <span className="text-zinc-300">Total separados</span>
                  <span className="text-sky-300">{formatCop(layawayTotal)}</span>
                </div>
              </div>
            </div>
          )}

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
