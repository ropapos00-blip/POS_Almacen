import { useEffect, useMemo, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import { Package, Plus, Printer, Search, X } from 'lucide-react'
import { formatCop } from '../../../shared/utils/currency'
import { formatCopInput, parseCopIntegerInput } from '../../../shared/utils/numberInput'
import { formatDateTimeColombia } from '../../../shared/utils/dateTime'
import { createClientId } from '../../../shared/utils/id'
import { useAuthStore } from '../../auth/model/useAuthStore'
import { CustomerPicker } from '../../customers/ui/CustomerPicker'
import { useDiscountPinConfigQuery } from '../../pos/model/usePosQueries'
import { validateDiscountPin } from '../../pos/services/discountPinService'
import {
  useAddLayawayPaymentMutation,
  useCancelLayawayMutation,
  useCreateLayawayMutation,
  useLayawaysQuery,
  useUpdateLayawayMutation,
} from '../model/useLayawayQueries'
import { findVariantByBarcode } from '../services/layawayService'
import type { Layaway, LayawayStatus } from '../model/layaway.types'
import { LayawayReceipt } from './LayawayReceipt'
import type { LayawayReceiptData } from './LayawayReceipt'

interface DraftItem {
  id: string
  variantId: string | null
  description: string
  quantity: number
  unitPrice: number
  discount: number
  minSalePrice: number
  costPrice: number
  sku: string
}

function getStatusConfig(status: LayawayStatus) {
  switch (status) {
    case 'active':    return { label: 'Activo',     cls: 'bg-amber-400/20 text-amber-400' }
    case 'completed': return { label: 'Completado', cls: 'bg-green-500/20 text-green-400' }
    case 'cancelled': return { label: 'Cancelado',  cls: 'bg-zinc-700/60 text-zinc-400' }
    case 'expired':   return { label: 'Vencido',    cls: 'bg-red-500/20 text-red-400' }
  }
}

function getDueDateInfo(dueDate: string, status: LayawayStatus) {
  if (status === 'completed' || status === 'cancelled') return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate + 'T00:00:00')
  const diff = Math.ceil((due.getTime() - today.getTime()) / 86_400_000)
  if (diff < 0)  return { text: `Venció hace ${Math.abs(diff)} día${Math.abs(diff) !== 1 ? 's' : ''}`, cls: 'text-red-400' }
  if (diff === 0) return { text: 'Vence hoy', cls: 'text-red-400' }
  if (diff <= 3)  return { text: `Vence en ${diff} día${diff !== 1 ? 's' : ''}`, cls: 'text-amber-400' }
  return { text: `Vence en ${diff} días`, cls: 'text-zinc-500' }
}

function paymentMethodLabel(m: string) {
  switch (m) {
    case 'cash':        return 'Efectivo'
    case 'addi':        return 'Addi'
    case 'credilondon': return 'Crédito London'
    case 'dataphone':   return 'Datáfono'
    case 'bancolombia': return 'Bancolombia'
    case 'daviplata':   return 'Daviplata'
    case 'nequi':       return 'Nequi'
    case 'rapirecarga': return 'Rapirecarga'
    default:            return m
  }
}

export function LayawaysPage() {
  const user = useAuthStore((state) => state.user)

  // ── Queries / Mutations ─────────────────────────────────────────────
  const layawaysQuery = useLayawaysQuery(user?.storeId)
  const createMutation = useCreateLayawayMutation(user?.storeId)
  const paymentMutation = useAddLayawayPaymentMutation(user?.storeId)
  const cancelMutation = useCancelLayawayMutation(user?.storeId)
  const updateMutation = useUpdateLayawayMutation(user?.storeId)
  const discountPinQuery = useDiscountPinConfigQuery(user?.storeId)

  // ── Search / filter ─────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<LayawayStatus | 'all'>('active')

  const filteredLayaways = useMemo(() => {
    const all = layawaysQuery.data ?? []
    return all.filter((l) => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false
      if (!searchTerm.trim()) return true
      const term = searchTerm.toLowerCase()
      return (
        l.customer_name.toLowerCase().includes(term) ||
        (l.customer_phone ?? '').toLowerCase().includes(term)
      )
    })
  }, [layawaysQuery.data, searchTerm, statusFilter])

  // ── Panel state ─────────────────────────────────────────────────────
  const [panel, setPanel] = useState<'idle' | 'create' | 'detail'>('idle')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selectedLayaway = useMemo(
    () => (selectedId ? (layawaysQuery.data ?? []).find((l) => l.id === selectedId) ?? null : null),
    [selectedId, layawaysQuery.data],
  )

  // ── Create form state ───────────────────────────────────────────────
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [initialAmountRaw, setInitialAmountRaw] = useState('')
  const [initialMethod, setInitialMethod] = useState('cash')
  const [draftItems, setDraftItems] = useState<DraftItem[]>([])
  const [barcodeInput, setBarcodeInput] = useState('')
  const [barcodeFeedback, setBarcodeFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [createFeedback, setCreateFeedback] = useState<string | null>(null)
  const barcodeRef = useRef<HTMLInputElement>(null)

  // ── Discount PIN state ──────────────────────────────────────────────
  const [discountAuthorizedBy, setDiscountAuthorizedBy] = useState<string | null>(null)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [isAuthorizingPin, setIsAuthorizingPin] = useState(false)
  const [authFeedback, setAuthFeedback] = useState<string | null>(null)

  // ── Payment form state ──────────────────────────────────────────────
  const [payAmountRaw, setPayAmountRaw] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [payNotes, setPayNotes] = useState('')
  const [payFeedback, setPayFeedback] = useState<string | null>(null)

  // ── Cancel confirm ──────────────────────────────────────────────────
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null)

  // ── Edit customer ───────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editFeedback, setEditFeedback] = useState<string | null>(null)

  // ── Print ───────────────────────────────────────────────────────────
  const [lastReceipt, setLastReceipt] = useState<LayawayReceiptData | null>(null)
  const [shouldPrint, setShouldPrint] = useState(false)
  const receiptRef = useRef<HTMLDivElement>(null)
  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: 'recibo-abono-separado',
    pageStyle:
      '@page { size: 56mm auto; margin: 0mm; } html, body { margin: 0 !important; padding: 0 !important; height: auto !important; min-height: 0 !important; background: white !important; }',
  })

  // Trigger print after receipt state is committed to DOM
  useEffect(() => {
    if (!shouldPrint) return
    setShouldPrint(false)
    handlePrint()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPrint])

  // Auto-clear barcode feedback
  useEffect(() => {
    if (!barcodeFeedback) return
    const t = setTimeout(() => setBarcodeFeedback(null), 2500)
    return () => clearTimeout(t)
  }, [barcodeFeedback])

  // ── Handlers ────────────────────────────────────────────────────────
  function openCreate() {
    setNewName('')
    setNewPhone('')
    setInitialAmountRaw('')
    setInitialMethod('cash')
    setDraftItems([])
    setBarcodeInput('')
    setBarcodeFeedback(null)
    setCreateFeedback(null)
    setDiscountAuthorizedBy(null)
    setSelectedId(null)
    setPanel('create')
  }

  function openDetail(layaway: Layaway) {
    setSelectedId(layaway.id)
    setPayAmountRaw('')
    setPayMethod('cash')
    setPayNotes('')
    setPayFeedback(null)
    setConfirmCancelId(null)
    setEditingId(null)
    setEditFeedback(null)
    setPanel('detail')
  }

  async function handleBarcodeLookup(barcode: string) {
    if (!barcode.trim() || !user?.storeId) return
    setIsLookingUp(true)
    try {
      const match = await findVariantByBarcode(user.storeId, barcode)
      if (!match) {
        setBarcodeFeedback({ type: 'err', msg: `No encontrado: ${barcode}` })
        setBarcodeInput('')
        return
      }
      const stock = match.inventory_stock?.[0]?.quantity_on_hand ?? 0
      if (stock <= 0) {
        setBarcodeFeedback({ type: 'err', msg: `Sin stock: ${match.products?.name ?? match.sku}` })
        setBarcodeInput('')
        return
      }
      const productName = match.products?.name ?? match.sku
      const parts = [productName, match.size, match.color].filter(Boolean)
      const description = parts.join(' - ')
      setDraftItems((prev) => {
        const existing = prev.find((item) => item.variantId === match.id)
        if (existing) {
          return prev.map((item) =>
            item.variantId === match.id ? { ...item, quantity: item.quantity + 1 } : item,
          )
        }
        return [
          ...prev,
          {
            id: createClientId(),
            variantId: match.id,
            description,
            quantity: 1,
            unitPrice: Number(match.sale_price),
            discount: 0,
            minSalePrice: match.suggested_price != null ? Number(match.suggested_price) : Number(match.sale_price),
            costPrice: Number(match.cost_price),
            sku: match.sku,
          },
        ]
      })
      setBarcodeFeedback({ type: 'ok', msg: `✓ ${description} — ${formatCop(Number(match.sale_price))}` })
      setBarcodeInput('')
    } catch (err) {
      setBarcodeFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Error de búsqueda' })
    } finally {
      setIsLookingUp(false)
      barcodeRef.current?.focus()
    }
  }

  function addManualItem() {
    setDraftItems((prev) => [
      ...prev,
      { id: createClientId(), variantId: null, description: '', quantity: 1, unitPrice: 0, discount: 0, minSalePrice: 0, costPrice: 0, sku: '' },
    ])
  }

  function updateDraftItem(id: string, field: 'description' | 'quantity' | 'unitPrice' | 'discount', value: string | number) {
    setDraftItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    )
  }

  function removeDraftItem(id: string) {
    setDraftItems((prev) => prev.filter((item) => item.id !== id))
  }

  async function authorizeDiscount() {
    if (!user?.storeId) return
    if (!pinInput) { setAuthFeedback('Ingresa la clave.'); return }
    setIsAuthorizingPin(true)
    setAuthFeedback(null)
    try {
      const valid = await validateDiscountPin(user.storeId, pinInput)
      if (!valid) { setAuthFeedback('Clave incorrecta.'); return }
      setDiscountAuthorizedBy('PIN')
      setPinInput('')
      setAuthModalOpen(false)
    } catch (e) {
      setAuthFeedback(e instanceof Error ? e.message : 'Error al validar.')
    } finally {
      setIsAuthorizingPin(false)
    }
  }

  async function handleCreateLayaway() {
    if (!user?.storeId || !user.id) return
    if (!newName.trim()) { setCreateFeedback('Ingresa el nombre del cliente.'); return }
    if (draftItems.length === 0) { setCreateFeedback('Agrega al menos un artículo.'); return }
    if (draftItems.some((i) => !i.description.trim())) { setCreateFeedback('Todos los artículos deben tener descripción.'); return }
    if (draftItems.some((i) => i.unitPrice <= 0)) { setCreateFeedback('Todos los artículos deben tener precio mayor a 0.'); return }

    const initialAmount = parseCopIntegerInput(initialAmountRaw, 0)
    if (initialAmount <= 0) { setCreateFeedback('El abono inicial es obligatorio.'); return }
    if (initialAmount > createTotal) { setCreateFeedback(`El abono no puede superar el total (${formatCop(createTotal)}).`); return }

    // Safety: if PIN zone discount without authorization, block (only for cashiers; admins are exempt)
    const pinRequired = discountPinQuery.data?.enabled === true && discountPinQuery.data?.hasPin === true
    if (pinRequired && !discountAuthorizedBy && user?.role === 'cashier') {
      const hasPinZone = draftItems.some((item) => {
        const freeMax = Math.max(0, (item.unitPrice - item.minSalePrice) * item.quantity)
        return item.discount > freeMax
      })
      if (hasPinZone) { setCreateFeedback('Hay descuentos que requieren autorización. Ingresa la clave PIN.'); return }
    }
    setCreateFeedback(null)

    const today = new Date()
    const dueD = new Date(today)
    dueD.setDate(dueD.getDate() + 20)
    const startDateISO = today.toISOString().split('T')[0]!
    const dueDateISO = dueD.toISOString().split('T')[0]!

    try {
      const newId = await createMutation.mutateAsync({
        storeId: user.storeId,
        customerName: newName.trim(),
        customerPhone: newPhone.trim(),
        notes: null,
        createdBy: user.id,
        items: draftItems.map((item) => ({
          variantId: item.variantId,
          description: item.description.trim(),
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: Number(item.discount ?? 0),
        })),
      })

      await paymentMutation.mutateAsync({
        layawayId: newId,
        amount: initialAmount,
        paymentMethod: initialMethod,
        notes: null,
        createdBy: user.id,
      })

      const receiptData: LayawayReceiptData = {
        customerName: newName.trim(),
        customerPhone: newPhone.trim() || null,
        startDate: startDateISO,
        dueDate: dueDateISO,
        items: draftItems.map((item) => ({
          description: item.description.trim(),
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: Number(item.discount ?? 0),
        })),
        totalAmount: createTotal,
        paymentAmount: initialAmount,
        previouslyPaid: 0,
        remainingBalance: createTotal - initialAmount,
        paymentMethod: initialMethod,
        paidAt: formatDateTimeColombia(new Date()),
      }

      setLastReceipt(receiptData)
      setShouldPrint(true)
      setDiscountAuthorizedBy(null)
      setSelectedId(newId)
      setPayAmountRaw('')
      setPayMethod('cash')
      setPayFeedback(null)
      setConfirmCancelId(null)
      setPanel('detail')
    } catch (err) {
      setCreateFeedback(err instanceof Error ? err.message : 'Error al crear el separado.')
    }
  }

  function handleAddPayment() {
    if (!user?.id || !selectedLayaway) return
    const amount = parseCopIntegerInput(payAmountRaw, 0)
    if (amount <= 0) { setPayFeedback('El monto del abono debe ser mayor a 0.'); return }
    const pending = selectedLayaway.total_amount - selectedLayaway.paid_amount
    if (amount > pending) { setPayFeedback(`El abono supera el saldo: ${formatCop(pending)}.`); return }
    setPayFeedback(null)

    const receiptData: LayawayReceiptData = {
      customerName: selectedLayaway.customer_name,
      customerPhone: selectedLayaway.customer_phone,
      startDate: selectedLayaway.created_at.split('T')[0]!,
      dueDate: selectedLayaway.due_date,
      items: selectedLayaway.layaway_items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unit_price,
      })),
      totalAmount: selectedLayaway.total_amount,
      paymentAmount: amount,
      previouslyPaid: selectedLayaway.paid_amount,
      remainingBalance: pending - amount,
      paymentMethod: payMethod,
      paidAt: formatDateTimeColombia(new Date()),
    }

    paymentMutation.mutate(
      {
        layawayId: selectedLayaway.id,
        amount,
        paymentMethod: payMethod,
        notes: payNotes.trim(),
        createdBy: user.id,
      },
      {
        onSuccess: () => {
          setLastReceipt(receiptData)
          setShouldPrint(true)
          setPayAmountRaw('')
          setPayNotes('')
          setPayFeedback(null)
        },
        onError: (err) => {
          setPayFeedback(err instanceof Error ? err.message : 'Error al registrar el abono.')
        },
      },
    )
  }

  function handleCancelLayaway(layawayId: string) {
    cancelMutation.mutate(layawayId, {
      onSuccess: () => {
        setConfirmCancelId(null)
        setPanel('idle')
        setSelectedId(null)
      },
      onError: (err) => {
        setPayFeedback(err instanceof Error ? err.message : 'Error al cancelar.')
        setConfirmCancelId(null)
      },
    })
  }

  function handleSaveEdit() {
    if (!editingId) return
    if (!editName.trim()) { setEditFeedback('El nombre es obligatorio.'); return }
    setEditFeedback(null)
    updateMutation.mutate(
      { id: editingId, customerName: editName.trim(), customerPhone: editPhone.trim() },
      {
        onSuccess: () => setEditingId(null),
        onError: (err) => setEditFeedback(err instanceof Error ? err.message : 'Error al guardar.'),
      },
    )
  }

  // ── Computed ────────────────────────────────────────────────────────
  const pinRequired = discountPinQuery.data?.enabled === true && discountPinQuery.data?.hasPin === true
  const createTotal = draftItems.reduce((acc, item) => acc + item.unitPrice * item.quantity - item.discount, 0)
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin'

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-zinc-100">Separados</h1>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300"
        >
          <Plus size={16} />
          Nuevo separado
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
        {/* ── LEFT: List ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Buscar por nombre o teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {(['all', 'active', 'completed', 'cancelled'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                  statusFilter === s
                    ? 'bg-amber-400 text-zinc-950'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                {s === 'all' ? 'Todos' : getStatusConfig(s as LayawayStatus).label}
              </button>
            ))}
          </div>

          {layawaysQuery.isLoading ? (
            <p className="py-4 text-center text-sm text-zinc-500">Cargando...</p>
          ) : filteredLayaways.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 p-6 text-center text-sm text-zinc-500">
              {searchTerm ? 'Sin resultados para esa búsqueda.' : 'No hay separados registrados.'}
            </div>
          ) : (
            <div className="ghost-scrollbar space-y-2 overflow-y-auto pr-1" style={{ maxHeight: 'calc(100vh - 280px)' }}>
              {filteredLayaways.map((l) => {
                const sc = getStatusConfig(l.status)
                const dueDsp = getDueDateInfo(l.due_date, l.status)
                const pending = l.total_amount - l.paid_amount
                const isSelected = selectedId === l.id && panel === 'detail'
                return (
                  <div
                    key={l.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openDetail(l)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openDetail(l) }}
                    className={`w-full cursor-pointer rounded-xl border p-4 text-left transition ${
                      isSelected
                        ? 'border-amber-400 bg-zinc-900'
                        : 'border-zinc-800 bg-zinc-950 hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-zinc-100">
                          {l.customer_name}
                        </p>
                        {l.customer_phone ? (
                          <p className="text-xs text-zinc-500">{l.customer_phone}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {l.layaway_payments.length > 0 ? (() => {
                          const firstPmt = [...l.layaway_payments].sort(
                            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
                          )[0]!
                          return (
                            <button
                              type="button"
                              title="Reimprimir recibo inicial"
                              onClick={(e) => {
                                e.stopPropagation()
                                setLastReceipt({
                                  customerName: l.customer_name,
                                  customerPhone: l.customer_phone,
                                  startDate: l.created_at.split('T')[0]!,
                                  dueDate: l.due_date,
                                  items: l.layaway_items.map((i) => ({
                                    description: i.description,
                                    quantity: i.quantity,
                                    unitPrice: i.unit_price,
                                  })),
                                  totalAmount: l.total_amount,
                                  paymentAmount: firstPmt.amount,
                                  previouslyPaid: 0,
                                  remainingBalance: l.total_amount - firstPmt.amount,
                                  paymentMethod: firstPmt.payment_method,
                                  paidAt: firstPmt.created_at,
                                })
                                setShouldPrint(true)
                              }}
                              className="rounded-lg border border-zinc-700 p-1 text-zinc-500 transition hover:border-amber-400/60 hover:text-amber-400"
                            >
                              <Printer size={12} />
                            </button>
                          )
                        })() : null}
                        {isAdmin && l.status === 'active' ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              openDetail(l)
                              setEditingId(l.id)
                              setEditName(l.customer_name)
                              setEditPhone(l.customer_phone ?? '')
                              setEditFeedback(null)
                              setConfirmCancelId(null)
                            }}
                            className="rounded-lg border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400 transition hover:border-amber-400/60 hover:text-amber-400"
                          >
                            Editar
                          </button>
                        ) : null}
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sc.cls}`}>
                          {sc.label}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <span className="text-zinc-500">
                        {l.layaway_items.length} ítem{l.layaway_items.length !== 1 ? 's' : ''}
                      </span>
                      <span className="font-medium text-zinc-200">{formatCop(l.total_amount)}</span>
                    </div>
                    {pending > 0 ? (
                      <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                        <span className="text-zinc-500">Pagado: {formatCop(l.paid_amount)}</span>
                        <span className="font-semibold text-amber-400">Debe: {formatCop(pending)}</span>
                      </div>
                    ) : null}
                    {dueDsp ? (
                      <p className={`mt-1 text-xs ${dueDsp.cls}`}>{dueDsp.text}</p>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── RIGHT: Panel ───────────────────────────────────────────── */}
        <div>
          {/* Idle state */}
          {panel === 'idle' && (
            <div className="flex min-h-75 items-center justify-center rounded-2xl border border-dashed border-zinc-800 text-zinc-600">
              <div className="text-center">
                <Package size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Selecciona un separado o crea uno nuevo</p>
              </div>
            </div>
          )}

          {/* ── CREATE FORM ─────────────────────────────────────────── */}
          {panel === 'create' && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6 backdrop-blur">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-base font-semibold text-zinc-100">Nuevo separado</h2>
                <button
                  type="button"
                  onClick={() => setPanel('idle')}
                  className="rounded-lg p-1 text-zinc-500 hover:text-zinc-300"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Customer */}
              <div className="mb-4">
                <label className="mb-1 block text-xs text-zinc-400">Cliente *</label>
                {user?.storeId ? (
                  <CustomerPicker
                    storeId={user.storeId}
                    name={newName}
                    phone={newPhone}
                    autoFocus
                    onSelect={(name, phone) => {
                      setNewName(name)
                      setNewPhone(phone)
                    }}
                  />
                ) : null}
              </div>

              {/* Barcode scanner */}
              <div className="mb-4">
                <label className="mb-1 block text-xs text-zinc-400">Escanear código de barras</label>
                <input
                  ref={barcodeRef}
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleBarcodeLookup(barcodeInput)
                  }}
                  placeholder="Escanea o escribe el código y presiona Enter..."
                  disabled={isLookingUp}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none disabled:opacity-50"
                />
                {barcodeFeedback ? (
                  <p className={`mt-1 text-xs ${barcodeFeedback.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
                    {barcodeFeedback.msg}
                  </p>
                ) : null}
              </div>

              {/* Items table */}
              {draftItems.length > 0 ? (
                <div className="ghost-scrollbar mb-4 overflow-x-auto rounded-xl border border-zinc-800">
                  <div className="grid grid-cols-[1fr_48px_96px_88px_24px] border-b border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-500">
                    <span>Descripción</span>
                    <span className="text-center">Cant.</span>
                    <span className="text-right">Precio</span>
                    <span className="text-right">Dcto</span>
                    <span />
                  </div>
                  {draftItems.map((item) => {
                    const freeMax = Math.max(0, (item.unitPrice - item.minSalePrice) * item.quantity)
                    const costMax = Math.max(0, (item.unitPrice - item.costPrice) * item.quantity)
                    const effectiveMax = (discountAuthorizedBy || user?.role !== 'cashier' || !pinRequired) ? costMax : freeMax
                    const lockedForPin = user?.role === 'cashier' && pinRequired && !discountAuthorizedBy && freeMax === 0
                    return (
                    <div
                      key={item.id}
                      className="grid grid-cols-[1fr_48px_96px_88px_24px] items-center border-b border-zinc-800/50 px-3 py-2 last:border-0"
                    >
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateDraftItem(item.id, 'description', e.target.value)}
                        placeholder="Descripción"
                        className="w-full bg-transparent text-xs text-zinc-100 placeholder:text-zinc-700 focus:outline-none"
                      />
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) =>
                          updateDraftItem(item.id, 'quantity', Math.max(1, parseInt(e.target.value) || 1))
                        }
                        className="w-full bg-transparent text-center text-xs text-zinc-100 focus:outline-none"
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={item.unitPrice === 0 ? '' : formatCopInput(item.unitPrice)}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, '')
                          updateDraftItem(item.id, 'unitPrice', raw ? parseInt(raw, 10) : 0)
                        }}
                        placeholder="0"
                        className="w-full bg-transparent text-right text-xs text-zinc-100 placeholder:text-zinc-700 focus:outline-none"
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={item.discount === 0 ? '' : formatCopInput(item.discount)}
                        readOnly={lockedForPin}
                        onClick={() => {
                          if (lockedForPin) {
                            setPinInput('')
                            setAuthFeedback(null)
                            setAuthModalOpen(true)
                          }
                        }}
                        onChange={(e) => {
                          const raw = parseCopIntegerInput(e.target.value, 0)
                          if (user?.role === 'cashier' && pinRequired && !discountAuthorizedBy && raw > freeMax) {
                            setPinInput('')
                            setAuthFeedback(null)
                            setAuthModalOpen(true)
                            return
                          }
                          updateDraftItem(item.id, 'discount', Math.min(raw, effectiveMax))
                        }}
                        className="w-full bg-transparent text-right text-xs text-zinc-100 placeholder:text-zinc-700 focus:outline-none read-only:cursor-pointer read-only:text-zinc-600"
                      />
                      <button
                        type="button"
                        onClick={() => removeDraftItem(item.id)}
                        className="flex justify-center text-zinc-700 transition hover:text-red-400"
                      >
                        <X size={13} />
                      </button>
                    </div>
                    )
                  })}
                </div>
              ) : null}

              <div className="mb-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={addManualItem}
                  className="text-xs text-zinc-500 underline transition hover:text-amber-400"
                >
                  + Agregar ítem manual
                </button>
                {draftItems.length > 0 ? (
                  <span className="text-sm font-semibold text-zinc-100">
                    Total: {formatCop(createTotal)}
                  </span>
                ) : null}
              </div>

              {/* Initial payment (mandatory) */}
              <div className="mb-4">
                <label className="mb-1 block text-xs font-medium text-zinc-400">
                  Abono inicial <span className="text-amber-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="$ 0"
                    value={initialAmountRaw ? formatCopInput(parseCopIntegerInput(initialAmountRaw, 0)) : ''}
                    onChange={(e) => setInitialAmountRaw(e.target.value.replace(/\D/g, ''))}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none"
                  />
                  <select
                    value={initialMethod}
                    onChange={(e) => setInitialMethod(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-400 focus:outline-none"
                  >
                    <option value="cash">Efectivo</option>
                    <option value="addi">Addi</option>
                    <option value="credilondon">Crédito London</option>
                    <option value="dataphone">Datáfono</option>
                    <option value="bancolombia">Bancolombia</option>
                    <option value="daviplata">Daviplata</option>
                    <option value="nequi">Nequi</option>
                    <option value="rapirecarga">Rapirecarga</option>
                  </select>
                </div>
              </div>

              <p className="mb-4 text-xs text-zinc-500">
                Plazo: <span className="text-zinc-300">20 días desde hoy</span>
              </p>

              {createFeedback ? (
                <p className="mb-3 rounded-lg bg-red-900/30 px-3 py-2 text-xs text-red-400">
                  {createFeedback}
                </p>
              ) : null}

              <button
                type="button"
                onClick={() => { void handleCreateLayaway() }}
                disabled={createMutation.isPending || paymentMutation.isPending}
                className="w-full rounded-xl bg-amber-400 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50"
              >
                {(createMutation.isPending || paymentMutation.isPending) ? 'Creando...' : 'Crear separado'}
              </button>
            </div>
          )}

          {/* ── DETAIL VIEW ─────────────────────────────────────────── */}
          {panel === 'detail' && selectedLayaway && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6 backdrop-blur">
              {/* Header */}
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-zinc-100">
                    {selectedLayaway.customer_name}
                  </h2>
                  {selectedLayaway.customer_phone ? (
                    <p className="text-sm text-zinc-400">{selectedLayaway.customer_phone}</p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-zinc-600">
                    Creado: {formatDateTimeColombia(selectedLayaway.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {selectedLayaway.layaway_payments.length > 0 ? (() => {
                    const firstPayment = [...selectedLayaway.layaway_payments].sort(
                      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
                    )[0]!
                    return (
                      <button
                        type="button"
                        title="Reimprimir recibo inicial"
                        onClick={() => {
                          setLastReceipt({
                            customerName: selectedLayaway.customer_name,
                            customerPhone: selectedLayaway.customer_phone,
                            startDate: selectedLayaway.created_at.split('T')[0]!,
                            dueDate: selectedLayaway.due_date,
                            items: selectedLayaway.layaway_items.map((i) => ({
                              description: i.description,
                              quantity: i.quantity,
                              unitPrice: i.unit_price,
                              discountAmount: Number(i.discount_amount ?? 0),
                            })),
                            totalAmount: selectedLayaway.total_amount,
                            paymentAmount: firstPayment.amount,
                            previouslyPaid: 0,
                            remainingBalance: selectedLayaway.total_amount - firstPayment.amount,
                            paymentMethod: firstPayment.payment_method,
                            paidAt: firstPayment.created_at,
                          })
                          setShouldPrint(true)
                        }}
                        className="rounded-lg border border-zinc-700 p-1.5 text-zinc-500 transition hover:border-amber-400/60 hover:text-amber-400"
                      >
                        <Printer size={14} />
                      </button>
                    )
                  })() : null}
                  {isAdmin && selectedLayaway.status === 'active' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(selectedLayaway.id)
                        setEditName(selectedLayaway.customer_name)
                        setEditPhone(selectedLayaway.customer_phone ?? '')
                        setEditFeedback(null)
                        setConfirmCancelId(null)
                      }}
                      className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-400 transition hover:border-amber-400/60 hover:text-amber-400"
                    >
                      Editar
                    </button>
                  ) : null}
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusConfig(selectedLayaway.status).cls}`}
                  >
                    {getStatusConfig(selectedLayaway.status).label}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPanel('idle')}
                    className="rounded-lg p-1 text-zinc-500 hover:text-zinc-300"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Inline edit form (admin only) */}
              {editingId === selectedLayaway.id ? (
                <div className="mb-4 rounded-xl border border-amber-400/30 bg-zinc-900 p-4">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-amber-400">
                    Editar cliente
                  </p>
                  <div className="mb-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-zinc-400">Nombre *</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-zinc-400">Teléfono</label>
                      <input
                        type="text"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                  </div>
                  {editFeedback ? (
                    <p className="mb-3 rounded-lg bg-red-900/30 px-3 py-2 text-xs text-red-400">
                      {editFeedback}
                    </p>
                  ) : null}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      disabled={updateMutation.isPending}
                      className="flex-1 rounded-lg bg-amber-400 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50"
                    >
                      {updateMutation.isPending ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="flex-1 rounded-lg bg-zinc-800 py-2 text-sm text-zinc-300 transition hover:bg-zinc-700"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Due date */}
              {(() => {
                const d = getDueDateInfo(selectedLayaway.due_date, selectedLayaway.status)
                return d ? (
                  <p className={`mb-4 text-sm font-medium ${d.cls}`}>
                    {d.text} —{' '}
                    {new Date(selectedLayaway.due_date + 'T00:00:00').toLocaleDateString('es-CO', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                ) : null
              })()}

              {/* Summary cards */}
              <div className="mb-5 grid grid-cols-3 gap-3 rounded-xl border border-zinc-800 p-4">
                <div className="text-center">
                  <p className="text-xs text-zinc-500">Total</p>
                  <p className="text-sm font-bold text-zinc-100">
                    {formatCop(selectedLayaway.total_amount)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-zinc-500">Pagado</p>
                  <p className="text-sm font-bold text-green-400">
                    {formatCop(selectedLayaway.paid_amount)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-zinc-500">Pendiente</p>
                  <p className="text-sm font-bold text-amber-400">
                    {formatCop(selectedLayaway.total_amount - selectedLayaway.paid_amount)}
                  </p>
                </div>
              </div>

              {/* Items */}
              <div className="mb-5">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Artículos
                </p>
                <div className="overflow-hidden rounded-xl border border-zinc-800">
                  {selectedLayaway.layaway_items.map((item) => (
                    <div
                      key={item.id}
                      className="border-b border-zinc-800/50 px-4 py-3 last:border-0"
                    >
                      <div className="min-w-0 text-sm text-zinc-200">{item.description}</div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <p className="text-xs text-zinc-500">{item.quantity} × {formatCop(item.unit_price)}</p>
                        <span className="ml-4 shrink-0 text-sm font-medium text-zinc-100">
                          {formatCop(item.quantity * item.unit_price)}
                        </span>
                      </div>
                      {Number(item.discount_amount ?? 0) > 0 ? (
                        <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                          <span className="text-zinc-500">Descuento</span>
                          <span className="text-zinc-300">{`-${formatCop(Number(item.discount_amount ?? 0))}`}</span>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment history */}
              {selectedLayaway.layaway_payments.length > 0 ? (
                <div className="mb-5">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                    Abonos ({selectedLayaway.layaway_payments.length})
                  </p>
                  <div className="space-y-2">
                    {selectedLayaway.layaway_payments.map((p) => {
                      const paymentsOrdered = [...selectedLayaway.layaway_payments].sort(
                        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
                      )
                      const sortedIdx = paymentsOrdered.findIndex((x) => x.id === p.id)
                      const previouslyPaid = paymentsOrdered
                        .slice(0, sortedIdx)
                        .reduce((sum, x) => sum + x.amount, 0)
                      return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-lg border border-zinc-800 px-4 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium text-zinc-200">{formatCop(p.amount)}</p>
                          <p className="text-xs text-zinc-500">
                            {paymentMethodLabel(p.payment_method)} ·{' '}
                            {formatDateTimeColombia(p.created_at)}
                          </p>
                          {p.notes ? <p className="text-xs text-zinc-600">{p.notes}</p> : null}
                        </div>
                        <button
                          type="button"
                          title="Reimprimir recibo"
                          onClick={() => {
                            setLastReceipt({
                              customerName: selectedLayaway.customer_name,
                              customerPhone: selectedLayaway.customer_phone,
                              startDate: selectedLayaway.created_at.split('T')[0]!,
                              dueDate: selectedLayaway.due_date,
                              items: selectedLayaway.layaway_items.map((i) => ({
                                description: i.description,
                                quantity: i.quantity,
                                unitPrice: i.unit_price,
                                discountAmount: Number(i.discount_amount ?? 0),
                              })),
                              totalAmount: selectedLayaway.total_amount,
                              paymentAmount: p.amount,
                              previouslyPaid,
                              remainingBalance: selectedLayaway.total_amount - previouslyPaid - p.amount,
                              paymentMethod: p.payment_method,
                              paidAt: p.created_at,
                            })
                            setShouldPrint(true)
                          }}
                          className="shrink-0 rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-amber-400 transition-colors"
                        >
                          <Printer size={14} />
                        </button>
                      </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              {/* Add payment form */}
              {selectedLayaway.status === 'active' ? (
                <div className="rounded-xl border border-zinc-700 p-4">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-400">
                    Registrar abono
                  </p>
                  <div className="mb-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-zinc-500">Monto *</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="$ 0"
                        value={payAmountRaw ? formatCopInput(parseCopIntegerInput(payAmountRaw, 0)) : ''}
                        onChange={(e) => setPayAmountRaw(e.target.value.replace(/\D/g, ''))}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-zinc-500">Forma de pago</label>
                      <select
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-400 focus:outline-none"
                      >
                        <option value="cash">Efectivo</option>
                        <option value="addi">Addi</option>
                        <option value="credilondon">Crédito London</option>
                        <option value="dataphone">Datáfono</option>
                        <option value="bancolombia">Bancolombia</option>
                        <option value="daviplata">Daviplata</option>
                        <option value="nequi">Nequi</option>
                        <option value="rapirecarga">Rapirecarga</option>
                      </select>
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="mb-1 block text-xs text-zinc-500">Notas (opcional)</label>
                    <input
                      type="text"
                      value={payNotes}
                      onChange={(e) => setPayNotes(e.target.value)}
                      placeholder="Observaciones..."
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  {payFeedback ? (
                    <p className="mb-3 rounded-lg bg-red-900/30 px-3 py-2 text-xs text-red-400">
                      {payFeedback}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleAddPayment}
                    disabled={paymentMutation.isPending}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50"
                  >
                    <Printer size={15} />
                    {paymentMutation.isPending ? 'Registrando...' : 'Registrar e imprimir recibo'}
                  </button>
                </div>
              ) : null}

              {/* Cancel (admin only) */}
              {isAdmin && selectedLayaway.status === 'active' ? (
                <div className="mt-4">
                  {confirmCancelId === selectedLayaway.id ? (
                    <div className="rounded-xl border border-red-900/40 bg-red-950/30 p-4">
                      <p className="mb-3 text-sm text-red-300">
                        ¿Cancelar este separado? El inventario será restaurado.
                      </p>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => handleCancelLayaway(selectedLayaway.id)}
                          disabled={cancelMutation.isPending}
                          className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
                        >
                          {cancelMutation.isPending ? 'Cancelando...' : 'Sí, cancelar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmCancelId(null)}
                          className="flex-1 rounded-lg bg-zinc-800 py-2 text-sm text-zinc-300 transition hover:bg-zinc-700"
                        >
                          No
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmCancelId(selectedLayaway.id)}
                      className="w-full rounded-xl border border-zinc-800 py-2 text-sm text-zinc-600 transition hover:border-red-900/60 hover:text-red-400"
                    >
                      Anular separado
                    </button>
                  )}
                </div>
              ) : null}

              {selectedLayaway.notes ? (
                <p className="mt-4 text-xs text-zinc-600">Nota: {selectedLayaway.notes}</p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Hidden receipt for printing */}
      <LayawayReceipt receiptRef={receiptRef} data={lastReceipt} />

      {/* PIN authorization modal */}
      {authModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
            <h3 className="text-lg font-semibold text-zinc-100">Autorizar descuento</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Ingresa la clave de descuento configurada por el administrador.
            </p>
            <label className="mt-4 block space-y-1">
              <span className="text-xs text-zinc-400">Clave de descuento</span>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                autoComplete="new-password"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="mínimo 4 dígitos"
                autoFocus
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none"
              />
            </label>
            {authFeedback ? (
              <p className="mt-3 text-sm text-rose-400">{authFeedback}</p>
            ) : null}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setAuthModalOpen(false); setPinInput(''); setAuthFeedback(null) }}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => { void authorizeDiscount() }}
                disabled={isAuthorizingPin || pinInput.length < 4}
                className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-70"
              >
                {isAuthorizingPin ? 'Validando...' : 'Autorizar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
