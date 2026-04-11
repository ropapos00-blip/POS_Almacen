import { useEffect, useMemo, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { formatCop } from '../../../shared/utils/currency'
import { useAuthStore } from '../../auth/model/useAuthStore'
import {
  useCreateWholesaleInvoiceMutation,
  useUpdateWholesaleInvoiceHeaderMutation,
  useVoidWholesaleInvoiceMutation,
  useWholesaleReferenceOptionsQuery,
  useRegisterWholesalePaymentMutation,
  useWholesaleInvoicesQuery,
} from '../model/useWholesaleQueries'
import type {
  WholesalePaymentChannel,
  WholesaleInvoiceRow,
  WholesalePaymentMethod,
} from '../model/wholesale.types'
import { WholesaleInvoiceLetter } from './WholesaleInvoiceLetter'

interface DraftItem {
  id: string
  variantId: string
  reference: string
  productName: string
  stockAvailable: number
  quantity: number
  unitPrice: number
}

function createDraftItem(): DraftItem {
  return {
    id: crypto.randomUUID(),
    variantId: '',
    reference: '',
    productName: '',
    stockAvailable: 0,
    quantity: 0,
    unitPrice: 0,
  }
}

function plusDaysIso(baseIsoDate: string, days: number) {
  const date = new Date(`${baseIsoDate}T00:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function portfolioPriority(invoice: WholesaleInvoiceRow) {
  if (invoice.status === 'overdue') return 0
  if (invoice.balance_due > 0 && invoice.status !== 'void') return 1
  return 2
}

function paymentLabel(method: WholesalePaymentMethod) {
  if (method === 'cash') return 'Efectivo'
  if (method === 'card') return 'Tarjeta'
  if (method === 'transfer') return 'Transferencia'
  if (method === 'mixed') return 'Mixto'
  return 'Credito'
}

function invoiceActionButtonClass(variant: 'print' | 'edit' | 'delete' | 'view' | 'pay') {
  const base = 'inline-flex h-8 items-center justify-center rounded-lg border px-3 text-xs font-medium transition-colors'

  if (variant === 'print') {
    return `${base} border-amber-500/50 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20`
  }

  if (variant === 'edit') {
    return `${base} border-sky-500/40 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20`
  }

  if (variant === 'delete') {
    return `${base} border-rose-500/50 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20`
  }

  if (variant === 'pay') {
    return `${base} border-emerald-500/50 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20`
  }

  return `${base} border-zinc-700 bg-zinc-900/60 text-zinc-200 hover:bg-zinc-800`
}

export function WholesalePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isDashboardView = location.pathname === '/confeccion/dashboard'
  const isSalesView = location.pathname === '/confeccion/ventas'
  const isCarteraView = location.pathname === '/confeccion/cartera'
  const today = new Date().toISOString().slice(0, 10)
  const user = useAuthStore((state) => state.user)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [discountTotal, setDiscountTotal] = useState(0)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [paymentFeedback, setPaymentFeedback] = useState<string | null>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<WholesaleInvoiceRow | null>(null)
  const [selectedPortfolioInvoice, setSelectedPortfolioInvoice] = useState<WholesaleInvoiceRow | null>(null)
  const [invoiceForPayment, setInvoiceForPayment] = useState<WholesaleInvoiceRow | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethodForAbono, setPaymentMethodForAbono] = useState<WholesalePaymentChannel>('cash')
  const [paymentReferenceForAbono, setPaymentReferenceForAbono] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [searchText, setSearchText] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState('all')
  const [portfolioFilter, setPortfolioFilter] = useState<'all' | 'receivable' | 'overdue' | 'paid'>('overdue')
  const [draftItems, setDraftItems] = useState<DraftItem[]>([createDraftItem()])
  const [invoiceForEdit, setInvoiceForEdit] = useState<WholesaleInvoiceRow | null>(null)
  const [editCustomerName, setEditCustomerName] = useState('')
  const [editCustomerPhone, setEditCustomerPhone] = useState('')
  const [invoiceForDelete, setInvoiceForDelete] = useState<WholesaleInvoiceRow | null>(null)
  const [showMissingProductModal, setShowMissingProductModal] = useState(false)

  useEffect(() => {
    if (!isCarteraView) {
      return
    }

    const customerFromQuery = (searchParams.get('customer') ?? '').trim()
    if (!customerFromQuery) {
      return
    }

    setSelectedCustomer(customerFromQuery)
    setSearchText(customerFromQuery)
  }, [isCarteraView, searchParams])

  const printRef = useRef<HTMLDivElement>(null)
  const invoicesQuery = useWholesaleInvoicesQuery(user?.storeId)
  const referenceOptionsQuery = useWholesaleReferenceOptionsQuery(user?.storeId)
  const createMutation = useCreateWholesaleInvoiceMutation(user?.storeId)
  const updateInvoiceMutation = useUpdateWholesaleInvoiceHeaderMutation(user?.storeId)
  const voidInvoiceMutation = useVoidWholesaleInvoiceMutation(user?.storeId, user?.id)
  const paymentMutation = useRegisterWholesalePaymentMutation(user?.storeId)

  const referenceByCode = useMemo(() => {
    const map = new Map<string, { variantId: string; productName: string; unitPrice: number; quantityOnHand: number }>()
    ;(referenceOptionsQuery.data ?? []).forEach((item) => {
      map.set(item.reference.trim().toLowerCase(), {
        variantId: item.variantId,
        productName: item.productName,
        unitPrice: item.unitPrice,
        quantityOnHand: item.quantityOnHand,
      })
    })
    return map
  }, [referenceOptionsQuery.data])

  useEffect(() => {
    if (!isCarteraView) {
      return
    }

    const quickPay = searchParams.get('quickPay') === '1'
    const customerFromQuery = (searchParams.get('customer') ?? '').trim()
    if (!quickPay || !customerFromQuery) {
      return
    }

    const candidates = (invoicesQuery.data ?? [])
      .filter((row) => (row.customer_name ?? '').trim() === customerFromQuery)
      .filter((row) => row.status !== 'void' && row.balance_due > 0)
      .sort((a, b) => {
        const aOverdue = a.status === 'overdue' ? 1 : 0
        const bOverdue = b.status === 'overdue' ? 1 : 0
        if (aOverdue !== bOverdue) {
          return bOverdue - aOverdue
        }

        const aDate = a.due_date ? new Date(`${a.due_date}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER
        const bDate = b.due_date ? new Date(`${b.due_date}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER
        if (aDate !== bDate) {
          return aDate - bDate
        }

        return new Date(a.issued_at).getTime() - new Date(b.issued_at).getTime()
      })

    if (candidates.length === 0) {
      setFeedback(`No hay facturas pendientes para ${customerFromQuery}.`)
      navigate(`/confeccion/cartera?customer=${encodeURIComponent(customerFromQuery)}`, {
        replace: true,
      })
      return
    }

    openPaymentModal(candidates[0])
    navigate(`/confeccion/cartera?customer=${encodeURIComponent(customerFromQuery)}`, {
      replace: true,
    })
  }, [invoicesQuery.data, isCarteraView, navigate, searchParams])

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: selectedInvoice?.invoice_number ?? 'factura-confeccion',
  })

  const subtotal = useMemo(() => {
    return draftItems.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0)
  }, [draftItems])

  const total = useMemo(() => {
    return Math.max(0, subtotal - discountTotal)
  }, [discountTotal, subtotal])

  const dashboardKpis = useMemo(() => {
    const rows = invoicesQuery.data ?? []
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const sevenDaysAhead = new Date(now)
    sevenDaysAhead.setDate(now.getDate() + 7)

    const monthRows = rows.filter((row) => new Date(row.issued_at) >= startOfMonth)
    const activeRows = rows.filter((row) => row.status !== 'void')
    const receivableRows = activeRows.filter((row) => row.balance_due > 0)
    const overdueRows = receivableRows.filter((row) => row.status === 'overdue')
    const dueSoonRows = receivableRows.filter((row) => {
      if (!row.due_date || row.status === 'overdue') {
        return false
      }

      const due = new Date(`${row.due_date}T00:00:00`)
      return due >= new Date(`${today}T00:00:00`) && due <= sevenDaysAhead
    })

    return {
      invoicesMonth: monthRows.length,
      salesMonth: monthRows.reduce((acc, row) => acc + row.grand_total, 0),
      collectedMonth: monthRows.reduce((acc, row) => acc + row.paid_total, 0),
      receivableTotal: receivableRows.reduce((acc, row) => acc + row.balance_due, 0),
      overdueTotal: overdueRows.reduce((acc, row) => acc + row.balance_due, 0),
      dueSoonTotal: dueSoonRows.reduce((acc, row) => acc + row.balance_due, 0),
    }
  }, [invoicesQuery.data, today])

  const dashboardFollowUpCustomers = useMemo(() => {
    const rows = invoicesQuery.data ?? []
    const map = new Map<
      string,
      {
        customerName: string
        balanceDue: number
        overdueCount: number
        dueSoonCount: number
        invoicesCount: number
      }
    >()

    rows
      .filter((row) => row.status !== 'void' && row.balance_due > 0)
      .forEach((row) => {
        const key = (row.customer_name ?? 'Cliente general').trim() || 'Cliente general'
        const current = map.get(key) ?? {
          customerName: key,
          balanceDue: 0,
          overdueCount: 0,
          dueSoonCount: 0,
          invoicesCount: 0,
        }

        current.balanceDue += row.balance_due
        current.invoicesCount += 1

        if (row.status === 'overdue') {
          current.overdueCount += 1
        } else if (row.due_date) {
          const due = new Date(`${row.due_date}T00:00:00`)
          const now = new Date(`${today}T00:00:00`)
          const seven = new Date(now)
          seven.setDate(now.getDate() + 7)
          if (due >= now && due <= seven) {
            current.dueSoonCount += 1
          }
        }

        map.set(key, current)
      })

    return Array.from(map.values())
      .filter((row) => row.overdueCount > 0 || row.dueSoonCount > 0)
      .sort((a, b) => b.balanceDue - a.balanceDue)
  }, [invoicesQuery.data, today])

  const customerOptions = useMemo(() => {
    const rows = invoicesQuery.data ?? []
    const unique = new Set<string>()

    rows.forEach((row) => {
      const label = (row.customer_name ?? '').trim()
      if (label) {
        unique.add(label)
      }
    })

    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'es'))
  }, [invoicesQuery.data])

  const filteredInvoices = useMemo(() => {
    const rows = invoicesQuery.data ?? []

    return rows
      .filter((invoice) => {
      const query = searchText.trim().toLowerCase()
      const textMatch =
        query.length === 0 ||
        (invoice.invoice_number ?? '').toLowerCase().includes(query) ||
        (invoice.customer_name ?? '').toLowerCase().includes(query) ||
        (invoice.customer_phone ?? '').toLowerCase().includes(query)

      if (!textMatch) {
        return false
      }

      if (selectedCustomer !== 'all' && invoice.customer_name !== selectedCustomer) {
        return false
      }

      if (portfolioFilter === 'receivable' && invoice.balance_due <= 0) {
        return false
      }

      if (portfolioFilter === 'overdue' && invoice.status !== 'overdue') {
        return false
      }

      if (portfolioFilter === 'paid' && invoice.status !== 'paid') {
        return false
      }

      return true
      })
      .sort((a, b) => {
        const priorityDiff = portfolioPriority(a) - portfolioPriority(b)
        if (priorityDiff !== 0) {
          return priorityDiff
        }

        const aDue = a.due_date ? new Date(`${a.due_date}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER
        const bDue = b.due_date ? new Date(`${b.due_date}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER
        if (aDue !== bDue) {
          return aDue - bDue
        }

        return new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime()
      })
  }, [invoicesQuery.data, portfolioFilter, searchText, selectedCustomer])

  const salesRecentInvoices = useMemo(() => {
    const rows = invoicesQuery.data ?? []
    return [...rows].sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime())
  }, [invoicesQuery.data])

  const currentPortfolioByCustomer = useMemo(() => {
    const map = new Map<
      string,
      { customerName: string; totalBalance: number; invoicesCount: number; overdueCount: number }
    >()

    filteredInvoices
      .filter((row) => row.balance_due > 0 && row.status !== 'void')
      .forEach((row) => {
        const key = (row.customer_name ?? 'Cliente general').trim() || 'Cliente general'
        const current = map.get(key) ?? {
          customerName: key,
          totalBalance: 0,
          invoicesCount: 0,
          overdueCount: 0,
        }

        current.totalBalance += row.balance_due
        current.invoicesCount += 1
        if (row.status === 'overdue') {
          current.overdueCount += 1
        }

        map.set(key, current)
      })

    return Array.from(map.values()).sort((a, b) => b.totalBalance - a.totalBalance)
  }, [filteredInvoices])

  function exportPortfolioCsv() {
    const rows = filteredInvoices
    if (rows.length === 0) {
      setFeedback('No hay registros para exportar con los filtros actuales.')
      return
    }

    const headers = [
      'Factura',
      'Cliente',
      'Telefono',
      'Fecha',
      'Vencimiento',
      'Estado',
      'Total',
      'Abonado',
      'Saldo',
      'Metodo',
    ]

    const escapeCsv = (value: string | number | null) => {
      const raw = value == null ? '' : String(value)
      const escaped = raw.replaceAll('"', '""')
      return `"${escaped}"`
    }

    const lines = [
      headers.map((h) => escapeCsv(h)).join(','),
      ...rows.map((row) =>
        [
          row.invoice_number,
          row.customer_name,
          row.customer_phone,
          new Date(row.issued_at).toISOString(),
          row.due_date,
          row.status,
          row.grand_total,
          row.paid_total,
          row.balance_due,
          row.payment_method,
        ]
          .map((cell) => escapeCsv(cell))
          .join(','),
      ),
    ]

    const csvContent = `\uFEFF${lines.join('\n')}`
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)
    link.href = url
    link.download = `cartera-confeccion-${stamp}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  function updateDraftQuantity(id: string, quantity: number) {
    setDraftItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) {
          return item
        }

        return {
          ...item,
          quantity: Math.max(0, quantity),
        }
      }),
    )
  }

  function updateDraftReference(id: string, rawReference: string) {
    const reference = rawReference.trim()
    const selected = referenceByCode.get(reference.toLowerCase())

    setDraftItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) {
          return item
        }

        if (!selected) {
          return {
            ...item,
            reference,
            variantId: '',
            productName: '',
            stockAvailable: 0,
            unitPrice: 0,
          }
        }

        return {
          ...item,
          reference,
          variantId: selected.variantId,
          productName: selected.productName,
          stockAvailable: selected.quantityOnHand,
          unitPrice: selected.unitPrice,
          quantity: item.quantity <= 0 ? 0 : Math.min(item.quantity, selected.quantityOnHand),
        }
      }),
    )
  }

  function addDraftItem() {
    setDraftItems((prev) => [...prev, createDraftItem()])
  }

  function removeDraftItem(id: string) {
    setDraftItems((prev) => {
      const next = prev.filter((item) => item.id !== id)
      return next.length === 0 ? [createDraftItem()] : next
    })
  }

  const cleanedItemsForValidation = draftItems
    .map((item) => ({
      variantId: item.variantId,
      reference: item.reference,
      productName: item.productName,
      stockAvailable: item.stockAvailable,
      quantity: Math.max(0, Number(item.quantity || 0)),
      unitPrice: Math.max(0, Number(item.unitPrice || 0)),
    }))
    .filter((item) => item.variantId && item.quantity > 0)

  const hasInvalidStockRequest = cleanedItemsForValidation.some(
    (item) => item.quantity > item.stockAvailable,
  )

  const canSubmit =
    Boolean(user?.storeId && user.id) &&
    cleanedItemsForValidation.length > 0 &&
    !hasInvalidStockRequest &&
    discountTotal >= 0 &&
    discountTotal <= subtotal

  async function saveInvoice(): Promise<WholesaleInvoiceRow | null> {
    setFeedback(null)

    if (!user?.storeId || !user.id) {
      setFeedback('Usuario sin tienda activa.')
      return null
    }

    if (cleanedItemsForValidation.length === 0) {
      setFeedback('Agrega al menos una referencia valida para facturar.')
      return null
    }

    if (hasInvalidStockRequest) {
      setFeedback('Alguna referencia supera la cantidad disponible en inventario.')
      return null
    }

    try {
      const result = await createMutation.mutateAsync({
        storeId: user.storeId,
        createdBy: user.id,
        customerName,
        customerPhone,
        discountTotal,
        paymentMethod: 'credit',
        isCredit: true,
        dueDate: null,
        items: cleanedItemsForValidation.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
        })),
      })

      const issuedAt = new Date().toISOString()
      const dueDate = plusDaysIso(issuedAt.slice(0, 10), 30)
      const invoice: WholesaleInvoiceRow = {
        id: result.invoiceId,
        invoice_number: result.invoiceNumber,
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.trim() || null,
        issued_at: issuedAt,
        due_date: dueDate,
        subtotal,
        discount_total: discountTotal,
        grand_total: total,
        paid_total: 0,
        balance_due: total,
        is_credit: true,
        status: 'issued',
        payment_method: 'credit',
        payment_reference: null,
        notes: null,
        wholesale_invoice_items: cleanedItemsForValidation.map((item, index) => ({
          id: `${result.invoiceId}-${index}`,
          variant_id: item.variantId,
          reference: item.reference,
          description: item.productName,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          line_total: item.quantity * item.unitPrice,
        })),
        wholesale_payments: null,
      }

      setSelectedInvoice(invoice)
      setFeedback(`Factura de confeccion creada: ${result.invoiceNumber}`)
      setCustomerName('')
      setCustomerPhone('')
      setDiscountTotal(0)
      setDraftItems([createDraftItem()])
      return invoice
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No se pudo crear la factura de confeccion.')
      return null
    }
  }

  async function saveAndPrintInvoice() {
    const invoice = await saveInvoice()
    if (!invoice) {
      return
    }

    setSelectedInvoice(invoice)
    setTimeout(() => {
      void handlePrint()
    }, 0)
  }

  function handleSaveAndPrintClick() {
    if (cleanedItemsForValidation.length === 0 || total <= 0) {
      setShowMissingProductModal(true)
      return
    }

    void saveAndPrintInvoice()
  }

  function reprint(invoice: WholesaleInvoiceRow) {
    setSelectedInvoice(invoice)
    setTimeout(() => {
      void handlePrint()
    }, 0)
  }

  function openPaymentModal(invoice: WholesaleInvoiceRow) {
    setSelectedPortfolioInvoice(invoice)
    setInvoiceForPayment(invoice)
    setPaymentFeedback(null)
    setPaymentAmount(invoice.balance_due > 0 ? String(invoice.balance_due) : '')
    setPaymentMethodForAbono('cash')
    setPaymentReferenceForAbono('')
    setPaymentNotes('')
  }

  function closePaymentModal() {
    setInvoiceForPayment(null)
    setPaymentFeedback(null)
    setPaymentAmount('')
    setPaymentMethodForAbono('cash')
    setPaymentReferenceForAbono('')
    setPaymentNotes('')
  }

  function openEditInvoiceModal(invoice: WholesaleInvoiceRow) {
    setInvoiceForEdit(invoice)
    setEditCustomerName(invoice.customer_name ?? '')
    setEditCustomerPhone(invoice.customer_phone ?? '')
  }

  function closeEditInvoiceModal() {
    setInvoiceForEdit(null)
    setEditCustomerName('')
    setEditCustomerPhone('')
  }

  async function saveInvoiceHeaderEdit() {
    if (!invoiceForEdit) {
      return
    }

    try {
      await updateInvoiceMutation.mutateAsync({
        invoiceId: invoiceForEdit.id,
        customerName: editCustomerName,
        customerPhone: editCustomerPhone,
      })
      setFeedback(`Factura ${invoiceForEdit.invoice_number} actualizada.`)
      closeEditInvoiceModal()
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No se pudo editar la factura.')
    }
  }

  async function confirmDeleteInvoice() {
    if (!invoiceForDelete) {
      return
    }

    const deletingInvoiceNumber = invoiceForDelete.invoice_number
    const deletingInvoiceId = invoiceForDelete.id

    try {
      await voidInvoiceMutation.mutateAsync(deletingInvoiceId)
      setFeedback(`Factura ${deletingInvoiceNumber} anulada.`)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No se pudo eliminar la factura.')
    } finally {
      setInvoiceForDelete(null)
    }
  }

  async function confirmPayment() {
    if (!invoiceForPayment || !user?.id) {
      return
    }

    const amount = Number(paymentAmount)

    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentFeedback('El valor del abono debe ser mayor a cero.')
      return
    }

    if (amount > invoiceForPayment.balance_due) {
      setPaymentFeedback('El abono no puede superar el saldo deudor.')
      return
    }

    try {
      await paymentMutation.mutateAsync({
        invoiceId: invoiceForPayment.id,
        actorUserId: user.id,
        amount,
        paymentMethod: paymentMethodForAbono,
        paymentReference: paymentReferenceForAbono,
        notes: paymentNotes,
      })

      setFeedback(`Abono registrado para factura ${invoiceForPayment.invoice_number}.`)
      closePaymentModal()
    } catch (error) {
      setPaymentFeedback(
        error instanceof Error ? error.message : 'No se pudo registrar el abono de confeccion.',
      )
    }
  }

  return (
    <section className={isSalesView ? 'grid gap-6 xl:grid-cols-[1.35fr_1fr]' : 'space-y-6'}>
      {isDashboardView ? (
        <>
          <header className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
            <h1 className="text-2xl font-semibold text-zinc-100">Dash Confeccion</h1>
            <p className="mt-2 text-sm text-zinc-400">
              KPI de confeccion y clientes para seguimiento de cartera.
            </p>
          </header>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
              <p className="text-xs text-zinc-500">Facturas del mes</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-100">{dashboardKpis.invoicesMonth}</p>
            </article>
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
              <p className="text-xs text-zinc-500">Ventas del mes</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-100">{formatCop(dashboardKpis.salesMonth)}</p>
            </article>
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
              <p className="text-xs text-zinc-500">Recaudado del mes</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-300">{formatCop(dashboardKpis.collectedMonth)}</p>
            </article>
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
              <p className="text-xs text-zinc-500">Cartera total</p>
              <p className="mt-2 text-2xl font-semibold text-amber-300">{formatCop(dashboardKpis.receivableTotal)}</p>
            </article>
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
              <p className="text-xs text-zinc-500">Cartera vencida</p>
              <p className="mt-2 text-2xl font-semibold text-rose-300">{formatCop(dashboardKpis.overdueTotal)}</p>
            </article>
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
              <p className="text-xs text-zinc-500">Por vencer (7 dias)</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-100">{formatCop(dashboardKpis.dueSoonTotal)}</p>
            </article>
          </div>

          <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
            <h2 className="text-lg font-semibold text-zinc-100">Clientes para seguimiento</h2>
            <p className="mt-1 text-xs text-zinc-500">Vencidos o por vencer para gestionar cobro.</p>
            <div className="mt-3 space-y-2">
              {dashboardFollowUpCustomers.length === 0 ? (
                <p className="text-sm text-zinc-500">No hay clientes con cartera vencida o por vencer.</p>
              ) : (
                dashboardFollowUpCustomers.map((row) => (
                  <div key={row.customerName} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                    <p className="text-sm font-medium text-zinc-200">{row.customerName}</p>
                    <p className="text-xs text-zinc-500">
                      {row.invoicesCount} facturas · {row.overdueCount} vencidas · {row.dueSoonCount} por vencer
                    </p>
                    <p className="mt-1 text-sm font-semibold text-amber-300">Saldo {formatCop(row.balanceDue)}</p>
                    <button
                      type="button"
                      onClick={() => {
                        navigate(`/confeccion/cartera?customer=${encodeURIComponent(row.customerName)}`)
                      }}
                      className="mt-2 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200"
                    >
                      Ir a cartera de este cliente
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigate(
                          `/confeccion/cartera?customer=${encodeURIComponent(row.customerName)}&quickPay=1`,
                        )
                      }}
                      className="ml-2 mt-2 rounded-md border border-emerald-500/40 px-2 py-1 text-xs text-emerald-300"
                    >
                      Registrar abono rapido
                    </button>
                  </div>
                ))
              )}
            </div>
          </article>
        </>
      ) : null}

      {isSalesView ? (
      <>
      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <h1 className="text-2xl font-semibold text-zinc-100">Sub POS Confeccion</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Factura en formato carta para confeccion y cartera, separada del POS retail.
        </p>

        <div className="mt-5 space-y-2">
          {draftItems.map((item, index) => (
            <div
              key={item.id}
              className="grid gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 md:grid-cols-[1.4fr_90px_120px_100px_auto]"
            >
              <input
                list="wholesale-reference-options"
                value={item.reference}
                onChange={(event) => updateDraftReference(item.id, event.target.value)}
                placeholder={`Referencia ${index + 1}`}
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              />
              <input
                type="number"
                min={0}
                value={item.quantity === 0 ? '' : item.quantity}
                placeholder="0"
                max={Math.max(1, item.stockAvailable)}
                onChange={(event) => updateDraftQuantity(item.id, Number(event.target.value || 0))}
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={formatCop(item.unitPrice)}
                readOnly
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300"
              />
              <input
                type="number"
                value={item.stockAvailable}
                readOnly
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300"
              />
              <button
                type="button"
                onClick={() => removeDraftItem(item.id)}
                className="rounded-lg border border-rose-500/40 px-3 py-2 text-xs text-rose-300"
              >
                Quitar
              </button>
              {item.productName ? (
                <p className="md:col-span-5 text-xs text-zinc-500">{item.productName}</p>
              ) : null}
              {item.reference && !item.variantId ? (
                <p className="md:col-span-5 text-xs text-rose-300">
                  Referencia no encontrada. Selecciona una referencia existente.
                </p>
              ) : null}
              {item.variantId && item.quantity > item.stockAvailable ? (
                <p className="md:col-span-5 text-xs text-rose-300">
                  Cantidad solicitada supera disponible ({item.stockAvailable}).
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <datalist id="wholesale-reference-options">
          {(referenceOptionsQuery.data ?? []).map((item) => (
            <option key={item.variantId} value={item.reference}>
              {item.productName}
            </option>
          ))}
        </datalist>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={addDraftItem}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
          >
            Agregar referencia
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-zinc-400">Cliente</span>
            <input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-zinc-400">Telefono cliente</span>
            <input
              type="tel"
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-zinc-400">Condicion de pago</span>
            <input
              value="Credito automatico a 30 dias"
              readOnly
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-zinc-400">Descuento (COP)</span>
            <input
              type="number"
              min={0}
              step={1}
              value={discountTotal === 0 ? '' : discountTotal}
              placeholder="0"
              onChange={(event) => setDiscountTotal(Math.max(0, Math.round(Number(event.target.value || 0))))}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
          </label>

          <p className="md:col-span-2 text-xs text-zinc-500">
            La fecha de vencimiento se asigna automaticamente a 30 dias desde la emision.
          </p>
        </div>

        <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-200">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatCop(subtotal)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>Descuento</span>
            <span>{formatCop(discountTotal)}</span>
          </div>
          <div className="mt-2 flex justify-between text-base font-semibold text-zinc-100">
            <span>Total</span>
            <span>{formatCop(total)}</span>
          </div>
          <div className="mt-1 flex justify-between text-xs text-zinc-400">
            <span>Saldo deudor</span>
            <span>{formatCop(total)}</span>
          </div>
        </div>

        {referenceOptionsQuery.isLoading ? (
          <p className="mt-2 text-xs text-zinc-500">Cargando referencias de inventario...</p>
        ) : null}

        {feedback ? <p className="mt-3 text-sm text-amber-300">{feedback}</p> : null}

        <div className="mt-4">
          <button
            type="button"
            onClick={handleSaveAndPrintClick}
            disabled={createMutation.isPending}
            className="w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-semibold text-zinc-900 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {createMutation.isPending ? 'Guardando...' : 'Guardar e imprimir factura carta'}
          </button>
        </div>
      </article>
      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <h2 className="text-lg font-semibold text-zinc-100">Facturas confeccion recientes</h2>
        <p className="mt-1 text-xs text-zinc-500">Ultimas ventas creadas desde Confeccion</p>
        <ul className="mt-4 space-y-2">
          {salesRecentInvoices.slice(0, 30).map((invoice) => (
            <li key={invoice.id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-200">{invoice.invoice_number}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(invoice.issued_at).toLocaleString()} · {invoice.customer_name ?? 'Cliente general'}
                  </p>
                </div>
                <p className="text-sm font-semibold text-emerald-300">{formatCop(invoice.grand_total)}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => reprint(invoice)}
                  className={invoiceActionButtonClass('print')}
                >
                  Reimprimir carta
                </button>
                {invoice.status !== 'void' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => openEditInvoiceModal(invoice)}
                      className={invoiceActionButtonClass('edit')}
                    >
                      Editar factura
                    </button>
                    <button
                      type="button"
                      onClick={() => setInvoiceForDelete(invoice)}
                      className={invoiceActionButtonClass('delete')}
                    >
                      Eliminar factura
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </article>
      </>
      ) : null}

      {isCarteraView ? (
      <>
      <header className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <h1 className="text-2xl font-semibold text-zinc-100">Cartera Confeccion</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Gestion de cartera vigente, vencida y registro de abonos por cliente.
        </p>
      </header>

      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <h2 className="text-lg font-semibold text-zinc-100">Facturas confeccion recientes</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Sub modulo separado del POS retail. Se priorizan vencidas (rojo) para cobro.
        </p>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Buscar por nombre de cliente, factura o telefono"
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
          />
          <select
            value={selectedCustomer}
            onChange={(event) => setSelectedCustomer(event.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
          >
            <option value="all">Todos los clientes</option>
            {customerOptions.map((customer) => (
              <option key={customer} value={customer}>
                {customer}
              </option>
            ))}
          </select>
          <select
            value={portfolioFilter}
            onChange={(event) =>
              setPortfolioFilter(event.target.value as 'all' | 'receivable' | 'overdue' | 'paid')
            }
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
          >
            <option value="all">Todos</option>
            <option value="receivable">Con saldo</option>
            <option value="overdue">Vencidas</option>
            <option value="paid">Pagadas</option>
          </select>
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={exportPortfolioCsv}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
          >
            Exportar cartera CSV (Excel)
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
          <h3 className="text-sm font-semibold text-zinc-100">Cartera vigente por cliente</h3>
          <div className="mt-2 space-y-2">
            {currentPortfolioByCustomer.length === 0 ? (
              <p className="text-xs text-zinc-500">No hay cartera vigente para los filtros actuales.</p>
            ) : (
              currentPortfolioByCustomer.map((row) => (
                <div key={row.customerName} className="rounded-md border border-zinc-800 px-2 py-2 text-xs">
                  <p className="text-zinc-200">{row.customerName}</p>
                  <p className="text-zinc-500">
                    {row.invoicesCount} facturas · {row.overdueCount} vencidas
                  </p>
                  <p className="font-semibold text-amber-300">Saldo {formatCop(row.totalBalance)}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <ul className="mt-4 space-y-2">
          {filteredInvoices.map((invoice) => (
            <li
              key={invoice.id}
              className={`rounded-lg border px-3 py-2 ${
                invoice.status === 'overdue'
                  ? 'border-rose-500/50 bg-rose-950/25'
                  : 'border-zinc-800 bg-zinc-950/60'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-200">{invoice.invoice_number}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(invoice.issued_at).toLocaleString()} · {invoice.customer_name ?? 'Cliente general'}
                  </p>
                </div>
                <p className="text-sm font-semibold text-emerald-300">{formatCop(invoice.grand_total)}</p>
              </div>

              <p className={`mt-1 text-xs ${invoice.status === 'overdue' ? 'text-rose-200' : 'text-zinc-400'}`}>
                {paymentLabel(invoice.payment_method)} · Estado: {invoice.status} · Saldo:{' '}
                {formatCop(invoice.balance_due)}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedPortfolioInvoice(invoice)}
                  className={invoiceActionButtonClass('view')}
                >
                  Ver cartera
                </button>
                <button
                  type="button"
                  onClick={() => reprint(invoice)}
                  className={invoiceActionButtonClass('print')}
                >
                  Reimprimir carta
                </button>
                {invoice.status !== 'void' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => openEditInvoiceModal(invoice)}
                      className={invoiceActionButtonClass('edit')}
                    >
                      Editar factura
                    </button>
                    <button
                      type="button"
                      onClick={() => setInvoiceForDelete(invoice)}
                      className={invoiceActionButtonClass('delete')}
                    >
                      Eliminar factura
                    </button>
                  </>
                ) : null}
                {invoice.balance_due > 0 && invoice.status !== 'void' ? (
                  <button
                    type="button"
                    onClick={() => openPaymentModal(invoice)}
                    className={invoiceActionButtonClass('pay')}
                  >
                    Registrar abono
                  </button>
                ) : null}
              </div>

              {invoice.wholesale_payments && invoice.wholesale_payments.length > 0 ? (
                <p className="mt-2 text-[11px] text-zinc-500">
                  Ultimo abono: {formatCop(invoice.wholesale_payments[0].amount)} el{' '}
                  {new Date(invoice.wholesale_payments[0].paid_at).toLocaleDateString()}
                </p>
              ) : null}
            </li>
          ))}
        </ul>

        {selectedPortfolioInvoice ? (
          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
            <h3 className="text-sm font-semibold text-zinc-100">
              Detalle de cartera · {selectedPortfolioInvoice.invoice_number}
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              Cliente: {selectedPortfolioInvoice.customer_name ?? 'Cliente general'}
            </p>
            <p className="text-xs text-zinc-500">
              Total: {formatCop(selectedPortfolioInvoice.grand_total)} · Abonado:{' '}
              {formatCop(selectedPortfolioInvoice.paid_total)} · Saldo:{' '}
              {formatCop(selectedPortfolioInvoice.balance_due)}
            </p>

            <div className="mt-3 space-y-2">
              {(selectedPortfolioInvoice.wholesale_payments ?? []).length === 0 ? (
                <p className="text-xs text-zinc-500">Sin abonos registrados.</p>
              ) : (
                (selectedPortfolioInvoice.wholesale_payments ?? []).map((payment) => (
                  <div key={payment.id} className="rounded-md border border-zinc-800 px-2 py-2 text-xs">
                    <p className="text-zinc-200">
                      {new Date(payment.paid_at).toLocaleString()} · {payment.payment_method}
                    </p>
                    <p className="text-emerald-300">{formatCop(payment.amount)}</p>
                    {payment.payment_reference ? (
                      <p className="text-zinc-500">Ref: {payment.payment_reference}</p>
                    ) : null}
                    {payment.notes ? <p className="text-zinc-500">Nota: {payment.notes}</p> : null}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </article>
      </>
      ) : null}

      {!isDashboardView && !isSalesView && !isCarteraView ? (
        <header className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
          <h1 className="text-2xl font-semibold text-zinc-100">Confeccion</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Selecciona Dash Confeccion, Confeccion o Cartera desde el lateral.
          </p>
        </header>
      ) : null}

      <WholesaleInvoiceLetter invoice={selectedInvoice} printRef={printRef} />

      {invoiceForEdit ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
            <h3 className="text-lg font-semibold text-zinc-100">Editar factura</h3>
            <p className="mt-2 text-sm text-zinc-400">Factura {invoiceForEdit.invoice_number}</p>

            <div className="mt-4 grid gap-3">
              <label className="space-y-1">
                <span className="text-xs text-zinc-400">Cliente</span>
                <input
                  value={editCustomerName}
                  onChange={(event) => setEditCustomerName(event.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-zinc-400">Telefono cliente</span>
                <input
                  type="tel"
                  value={editCustomerPhone}
                  onChange={(event) => setEditCustomerPhone(event.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeEditInvoiceModal}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  void saveInvoiceHeaderEdit()
                }}
                disabled={updateInvoiceMutation.isPending}
                className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-70"
              >
                {updateInvoiceMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {invoiceForDelete ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
            <h3 className="text-lg font-semibold text-zinc-100">Eliminar factura</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Seguro que deseas eliminar la factura {invoiceForDelete.invoice_number}? Esta accion anula la factura y devuelve el stock a confeccion.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setInvoiceForDelete(null)}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  void confirmDeleteInvoice()
                }}
                disabled={voidInvoiceMutation.isPending}
                className="rounded-lg bg-rose-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
              >
                {voidInvoiceMutation.isPending ? 'Eliminando...' : 'Si, eliminar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {invoiceForPayment ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
            <h3 className="text-lg font-semibold text-zinc-100">Registrar abono</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Factura {invoiceForPayment.invoice_number} · Saldo {formatCop(invoiceForPayment.balance_due)}
            </p>

            <div className="mt-4 grid gap-3">
              <label className="space-y-1">
                <span className="text-xs text-zinc-400">Valor del abono</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={paymentAmount}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-zinc-400">Metodo</span>
                <select
                  value={paymentMethodForAbono}
                  onChange={(event) => setPaymentMethodForAbono(event.target.value as WholesalePaymentChannel)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                >
                  <option value="cash">Efectivo</option>
                  <option value="card">Tarjeta</option>
                  <option value="transfer">Transferencia</option>
                  <option value="mixed">Mixto</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs text-zinc-400">Referencia (opcional)</span>
                <input
                  value={paymentReferenceForAbono}
                  onChange={(event) => setPaymentReferenceForAbono(event.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-zinc-400">Nota (opcional)</span>
                <textarea
                  rows={2}
                  value={paymentNotes}
                  onChange={(event) => setPaymentNotes(event.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                />
              </label>
            </div>

            {paymentFeedback ? <p className="mt-3 text-sm text-amber-300">{paymentFeedback}</p> : null}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closePaymentModal}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  void confirmPayment()
                }}
                disabled={paymentMutation.isPending}
                className="rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-70"
              >
                {paymentMutation.isPending ? 'Guardando...' : 'Confirmar abono'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showMissingProductModal ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
            <h3 className="text-lg font-semibold text-zinc-100">No se puede guardar</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Debes agregar minimo un producto valido para generar la factura.
            </p>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowMissingProductModal(false)}
                className="w-full rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-900"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}