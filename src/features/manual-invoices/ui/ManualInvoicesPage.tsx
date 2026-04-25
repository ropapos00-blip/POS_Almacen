import { useEffect, useMemo, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import { formatCop } from '../../../shared/utils/currency'
import { formatDateTimeColombia, getTodayIsoDateColombia } from '../../../shared/utils/dateTime'
import { createClientId } from '../../../shared/utils/id'
import { formatCopInput, parseCopIntegerInput, parseIntegerInput } from '../../../shared/utils/numberInput'
import { useAuthStore } from '../../auth/model/useAuthStore'
import {
  useCreateManualExpenseMutation,
  useDeleteManualExpenseMutation,
  useManualExpenseKpisQuery,
  useManualExpensesQuery,
  useCreateManualInvoiceMutation,
  useManualInvoiceKpisQuery,
  useManualInvoicesQuery,
  useUpdateManualExpenseMutation,
  useUpdateManualInvoiceMutation,
  useVoidManualInvoiceMutation,
  useManualInvoicePaymentKpisQuery,
} from '../model/useManualInvoicesQueries'
import type { ManualExpenseRow, ManualInvoiceRow, ManualPaymentMethod } from '../model/manualInvoices.types'
import { useDiscountPinConfigQuery, usePosVariantsQuery } from '../../pos/model/usePosQueries'
import { validateDiscountPin } from '../../pos/services/discountPinService'
import { useLayawayKpisQuery } from '../../layaways/model/useLayawayQueries'
import { ManualInvoiceReceipt } from './ManualInvoiceReceipt'
import { ExpenseReceipt } from './ExpenseReceipt'
import { CustomerPicker } from '../../customers/ui/CustomerPicker'


interface DraftItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  discount: number
  costPrice?: number
  minSalePrice?: number
  variantId?: string
}

function paymentLabel(method: ManualPaymentMethod) {
  switch (method) {
    case 'cash':
      return 'Efectivo'
    case 'addi':
      return 'Addi'
    case 'credilondon':
      return 'CREDILONDON'
    case 'dataphone':
      return 'Datáfono'
    case 'bancolombia':
      return 'Bancolombia'
    case 'daviplata':
      return 'Daviplata'
    case 'nequi':
      return 'Nequi'
    case 'mixed':
      return 'Mixto'
    default:
      return method
  }
}

function createDraftItem(): DraftItem {
  return {
    id: createClientId(),
    description: '',
    quantity: 1,
    unitPrice: 0,
    discount: 0,
  }
}

function invoiceActionButtonClass(variant: 'print' | 'edit' | 'delete') {
  const base =
    'inline-flex h-8 w-full items-center justify-center rounded-lg border px-3 text-xs font-medium transition-colors'

  if (variant === 'print') {
    return `${base} border-amber-500/50 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20`
  }

  if (variant === 'edit') {
    return `${base} border-sky-500/40 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20`
  }

  return `${base} border-rose-500/50 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20`
}

export function ManualInvoicesPage() {
  const user = useAuthStore((state) => state.user)
  const isAdminUser = user?.role === 'admin' || user?.role === 'super_admin'
  const paymentKpisQuery = useManualInvoicePaymentKpisQuery(user?.storeId, isAdminUser)
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
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [discountAuthorizedBy, setDiscountAuthorizedBy] = useState<string | null>(null)
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinFeedback, setPinFeedback] = useState<string | null>(null)
  const [isPinValidating, setIsPinValidating] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<ManualPaymentMethod>('cash')
  const [paymentReference, setPaymentReference] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [draftItems, setDraftItems] = useState<DraftItem[]>([createDraftItem()])
  const [selectedInvoice, setSelectedInvoice] = useState<ManualInvoiceRow | null>(null)
  const [selectedExpense, setSelectedExpense] = useState<ManualExpenseRow | null>(null)
  const [invoiceForEdit, setInvoiceForEdit] = useState<ManualInvoiceRow | null>(null)
  const [editCustomerName, setEditCustomerName] = useState('')
  const [editCustomerPhone, setEditCustomerPhone] = useState('')
  const [editPaymentMethod, setEditPaymentMethod] = useState<ManualPaymentMethod>('cash')
  const [editPaymentReference, setEditPaymentReference] = useState('')
  const [mixedFirstMethod, setMixedFirstMethod] = useState<ManualPaymentMethod>('cash')
  const [mixedFirstAmount, setMixedFirstAmount] = useState(0)
  const [mixedSecondMethod, setMixedSecondMethod] = useState<ManualPaymentMethod>('addi')
  const [mixedSecondAmount, setMixedSecondAmount] = useState(0)
  const [editMixedFirstMethod, setEditMixedFirstMethod] = useState<ManualPaymentMethod>('cash')
  const [editMixedFirstAmount, setEditMixedFirstAmount] = useState(0)
  const [editMixedSecondMethod, setEditMixedSecondMethod] = useState<ManualPaymentMethod>('addi')
  const [editMixedSecondAmount, setEditMixedSecondAmount] = useState(0)
  const [invoiceForDelete, setInvoiceForDelete] = useState<ManualInvoiceRow | null>(null)
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
  const receiptRef = useRef<HTMLDivElement>(null)
  const expenseReceiptRef = useRef<HTMLDivElement>(null)
  const barcodeRef = useRef<HTMLInputElement>(null)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [barcodeFeedback, setBarcodeFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  const invoicesQuery = useManualInvoicesQuery(user?.storeId)
  const manualKpisQuery = useManualInvoiceKpisQuery(user?.storeId, isAdminUser)
  const layawayKpisQuery = useLayawayKpisQuery(user?.storeId, isAdminUser)
  const expensesQuery = useManualExpensesQuery(user?.storeId)
  const expenseKpisQuery = useManualExpenseKpisQuery(user?.storeId, isAdminUser)
  const createMutation = useCreateManualInvoiceMutation(user?.storeId)
  const updateMutation = useUpdateManualInvoiceMutation(user?.storeId)
  const voidMutation = useVoidManualInvoiceMutation(user?.storeId)
  const createExpenseMutation = useCreateManualExpenseMutation(user?.storeId)
  const updateExpenseMutation = useUpdateManualExpenseMutation(user?.storeId)
  const deleteExpenseMutation = useDeleteManualExpenseMutation(user?.storeId)
  const discountPinQuery = useDiscountPinConfigQuery(user?.storeId)
  const pinRequired =
    discountPinQuery.data?.enabled === true && discountPinQuery.data?.hasPin === true
  const variantsQuery = usePosVariantsQuery(user?.storeId)

  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: selectedInvoice?.invoice_number ?? 'factura-manual',
    pageStyle: '@page { size: 56mm auto; margin: 0mm; } @media print { html { height: auto !important; min-height: 0 !important; overflow: visible !important; } body { margin: 0 !important; padding: 0 !important; height: auto !important; min-height: 0 !important; overflow: visible !important; background: white !important; color: black !important; } }',
  })

  const handlePrintExpense = useReactToPrint({
    contentRef: expenseReceiptRef,
    documentTitle: 'comprobante-gasto',
    pageStyle: '@page { size: 56mm auto; margin: 0mm; } @media print { html { height: auto !important; min-height: 0 !important; overflow: visible !important; } body { margin: 0 !important; padding: 0 !important; height: auto !important; min-height: 0 !important; overflow: visible !important; background: white !important; color: black !important; } }',
  })

  useEffect(() => {
    if (selectedExpense !== null) {
      void handlePrintExpense()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExpense])

  const subtotal = useMemo(() => {
    return draftItems.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0)
  }, [draftItems])

  const totalCost = useMemo(() => {
    return draftItems.reduce((acc, item) => acc + (item.costPrice ?? 0) * item.quantity, 0)
  }, [draftItems])

  const discountTotal = useMemo(() => {
    return draftItems.reduce((acc, item) => acc + (item.discount ?? 0), 0)
  }, [draftItems])

  const maxAllowedDiscount = useMemo(() => {
    return Math.max(0, Number((subtotal - totalCost).toFixed(2)))
  }, [subtotal, totalCost])

  const total = useMemo(() => {
    return Math.max(0, subtotal - discountTotal)
  }, [discountTotal, subtotal])

  const allowsPaymentReference =
    paymentMethod !== 'cash' && paymentMethod !== 'mixed'
  const editAllowsPaymentReference =
    editPaymentMethod !== 'cash' && editPaymentMethod !== 'mixed'

  useEffect(() => {
    if (!allowsPaymentReference && paymentReference) {
      setPaymentReference('')
    }
  }, [allowsPaymentReference, paymentReference])

  useEffect(() => {
    if (!editAllowsPaymentReference && editPaymentReference) {
      setEditPaymentReference('')
    }
  }, [editAllowsPaymentReference, editPaymentReference])

  useEffect(() => {
    if (!barcodeFeedback) return
    const t = setTimeout(() => setBarcodeFeedback(null), 2500)
    return () => clearTimeout(t)
  }, [barcodeFeedback])

  function updateDraftItem(id: string, field: keyof DraftItem, value: string | number) {
    setDraftItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) {
          return item
        }

        return {
          ...item,
          [field]: value,
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

  function addByBarcode(code: string) {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return
    const source = variantsQuery.data ?? []
    const match = source.find(
      (it) => it.barcode.toUpperCase() === trimmed || it.sku.toUpperCase() === trimmed,
    )
    if (!match) {
      setBarcodeFeedback({ type: 'err', msg: `No encontrado en inventario: ${trimmed}` })
      setBarcodeInput('')
      return
    }
    const stock = match.inventory_stock?.[0]?.quantity_on_hand ?? 0
    const existing = draftItems.find((item) => item.variantId === match.id)
    if (existing) {
      if (existing.quantity >= stock) {
        setBarcodeFeedback({ type: 'err', msg: `Stock máximo alcanzado: ${stock} ud.` })
        setBarcodeInput('')
        return
      }
      setDraftItems((prev) =>
        prev.map((item) =>
          item.variantId === match.id ? { ...item, quantity: item.quantity + 1 } : item,
        ),
      )
      setBarcodeFeedback({ type: 'ok', msg: `+1 ${match.products?.name ?? match.sku}` })
      setBarcodeInput('')
      return
    }
    if (stock <= 0) {
      setBarcodeFeedback({ type: 'err', msg: `Sin stock: ${match.products?.name ?? match.sku}` })
      setBarcodeInput('')
      return
    }
    const productName = match.products?.name ?? match.sku
    const parts = [productName, match.size, match.color].filter(Boolean)
    const description = parts.join(' - ')
    setDraftItems((prev) => {
      const emptyIdx = prev.findIndex(
        (item) => !item.variantId && !item.description.trim() && item.unitPrice === 0,
      )
      if (emptyIdx !== -1) {
        return prev.map((item, i) =>
          i === emptyIdx
            ? { ...item, description, unitPrice: Number(match.sale_price), costPrice: Number(match.cost_price), minSalePrice: match.suggested_price != null ? Number(match.suggested_price) : Number(match.sale_price), variantId: match.id }
            : item,
        )
      }
      return [
        ...prev,
        { id: createClientId(), description, quantity: 1, unitPrice: Number(match.sale_price), costPrice: Number(match.cost_price), minSalePrice: match.suggested_price != null ? Number(match.suggested_price) : Number(match.sale_price), variantId: match.id, discount: 0 },
      ]
    })
    setBarcodeFeedback({ type: 'ok', msg: `✓ ${productName} — ${formatCop(Number(match.sale_price))}` })
    setBarcodeInput('')
  }

  const cleanedItemsForValidation = draftItems
    .map((item) => ({
      description: item.description.trim(),
      quantity: Math.max(0, Number(item.quantity || 0)),
      unitPrice: Math.max(0, Number(item.unitPrice || 0)),
      variantId: item.variantId,
    }))
    .filter((item) => item.description && item.quantity > 0)

  const canSubmitInvoice =
    Boolean(user?.storeId && user.id) &&
    cleanedItemsForValidation.length > 0 &&
    discountTotal >= 0 &&
    discountTotal <= maxAllowedDiscount

  async function saveManualInvoice(): Promise<ManualInvoiceRow | null> {
    setFeedback(null)

    if (!user?.storeId || !user.id) {
      setFeedback('Usuario sin tienda activa.')
      return null
    }

    const cleanedItems = cleanedItemsForValidation

    if (cleanedItems.length === 0) {
      setFeedback('Agrega al menos un item con descripcion y cantidad valida.')
      return null
    }

    if (discountTotal < 0) {
      setFeedback('El descuento no puede ser negativo.')
      return null
    }

    if (discountTotal > maxAllowedDiscount) {
      setFeedback(`Descuento inválido. Máximo permitido: ${formatCop(maxAllowedDiscount)}.`)
      return null
    }

    const hasPinZoneDiscount = draftItems.some(item => {
      const freeMax = Math.max(0, (item.unitPrice - (item.minSalePrice ?? item.unitPrice)) * item.quantity)
      return item.discount > freeMax
    })
    if (hasPinZoneDiscount && !discountAuthorizedBy) {
      setFeedback('El descuento requiere autorización (PIN).')
      return null
    }

    if (paymentMethod === 'mixed') {
      const mixedSum = mixedFirstAmount + mixedSecondAmount
      if (Math.abs(mixedSum - total) > 1) {
        setFeedback(`Los montos del pago mixto suman ${formatCop(mixedSum)} pero el total es ${formatCop(total)}. Ajusta los montos.`)
        return null
      }
    }

    try {
      const result = await createMutation.mutateAsync({
        storeId: user.storeId,
        createdBy: user.id,
        customerName,
        customerPhone,
        discountTotal,
        paymentMethod,
        paymentReference: paymentMethod === 'mixed'
          ? `${mixedFirstMethod}:${mixedFirstAmount}:${mixedSecondMethod}:${mixedSecondAmount}`
          : (allowsPaymentReference ? paymentReference : ''),
        items: cleanedItems,
      })

      const createdAt = new Date().toISOString()
      const invoiceRow: ManualInvoiceRow = {
        id: result.invoiceId,
        invoice_number: result.invoiceNumber,
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.trim() || null,
        subtotal,
        discount_total: discountTotal,
        grand_total: total,
        payment_method: paymentMethod,
        payment_reference: paymentMethod === 'mixed'
          ? `${mixedFirstMethod}:${mixedFirstAmount}:${mixedSecondMethod}:${mixedSecondAmount}`
          : (allowsPaymentReference ? paymentReference.trim() || null : null),
        created_at: createdAt,
        manual_invoice_items: cleanedItems.map((item, index) => ({
          id: `${result.invoiceId}-${index}`,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          line_total: item.quantity * item.unitPrice,
        })),
      }

      setSelectedInvoice(invoiceRow)
      setFeedback(`Factura manual creada: ${result.invoiceNumber}`)
      setCustomerName('')
      setCustomerPhone('')
      setDiscountAuthorizedBy(null)
      setPaymentMethod('cash')
      setPaymentReference('')
      setMixedFirstMethod('cash')
      setMixedFirstAmount(0)
      setMixedSecondMethod('addi')
      setMixedSecondAmount(0)
      setDraftItems([createDraftItem()])
      return invoiceRow
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No se pudo crear la factura manual.')
      return null
    }
  }

  async function saveAndPrintManualInvoice() {
    const invoice = await saveManualInvoice()
    if (invoice) {
      setSelectedInvoice(invoice)
      setTimeout(() => {
        void handlePrint()
      }, 0)
    }
  }

  function selectAndReprint(invoice: ManualInvoiceRow) {
    setSelectedInvoice(invoice)
    // Espera un tick para asegurar que el nodo de impresion ya tenga la factura seleccionada.
    setTimeout(() => {
      void handlePrint()
    }, 0)
  }

  function openEditInvoiceModal(invoice: ManualInvoiceRow) {
    setInvoiceForEdit(invoice)
    setEditCustomerName(invoice.customer_name ?? '')
    setEditCustomerPhone(invoice.customer_phone ?? '')
    setEditPaymentMethod(invoice.payment_method)
    if (invoice.payment_method === 'mixed' && invoice.payment_reference) {
      const parts = invoice.payment_reference.split(':')
      if (parts.length === 4 && Number.isFinite(Number(parts[1])) && Number.isFinite(Number(parts[3]))) {
        setEditMixedFirstMethod(parts[0] as ManualPaymentMethod)
        setEditMixedFirstAmount(Number(parts[1]))
        setEditMixedSecondMethod(parts[2] as ManualPaymentMethod)
        setEditMixedSecondAmount(Number(parts[3]))
      } else {
        setEditMixedFirstMethod('cash')
        setEditMixedFirstAmount(0)
        setEditMixedSecondMethod('addi')
        setEditMixedSecondAmount(0)
      }
    }
    setEditPaymentReference(invoice.payment_reference ?? '')
  }

  function closeEditInvoiceModal() {
    setInvoiceForEdit(null)
    setEditCustomerName('')
    setEditCustomerPhone('')
    setEditPaymentMethod('cash')
    setEditPaymentReference('')
    setEditMixedFirstMethod('cash')
    setEditMixedFirstAmount(0)
    setEditMixedSecondMethod('addi')
    setEditMixedSecondAmount(0)
  }

  async function saveInvoiceHeaderEdit() {
    if (!invoiceForEdit || !user?.id) {
      return
    }

    if (editPaymentMethod === 'mixed') {
      const mixedSum = editMixedFirstAmount + editMixedSecondAmount
      const invoiceTotal = invoiceForEdit.grand_total
      if (Math.abs(mixedSum - invoiceTotal) > 1) {
        setFeedback(`Los montos del pago mixto suman ${formatCop(mixedSum)} pero el total de la factura es ${formatCop(invoiceTotal)}. Ajusta los montos.`)
        return
      }
    }

    try {
      await updateMutation.mutateAsync({
        invoiceId: invoiceForEdit.id,
        actorUserId: user.id,
        customerName: editCustomerName,
        customerPhone: editCustomerPhone,
        paymentMethod: editPaymentMethod,
        paymentReference: editPaymentMethod === 'mixed'
          ? `${editMixedFirstMethod}:${editMixedFirstAmount}:${editMixedSecondMethod}:${editMixedSecondAmount}`
          : (editAllowsPaymentReference ? editPaymentReference : ''),
      })

      setFeedback(`Factura ${invoiceForEdit.invoice_number} actualizada.`)
      closeEditInvoiceModal()
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No se pudo editar la factura manual.')
    }
  }

  async function confirmDeleteInvoice() {
    if (!invoiceForDelete || !user?.id) {
      return
    }

    const deletingInvoice = invoiceForDelete

    try {
      await voidMutation.mutateAsync({
        invoiceId: deletingInvoice.id,
        actorUserId: user.id,
        reason: 'Anulada manualmente desde admin',
      })

      if (selectedInvoice?.id === deletingInvoice.id) {
        setSelectedInvoice(null)
      }

      setFeedback(`Factura ${deletingInvoice.invoice_number} eliminada.`)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No se pudo eliminar la factura manual.')
    } finally {
      setInvoiceForDelete(null)
    }
  }

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
      setExpenseFeedback(error instanceof Error ? error.message : 'No se pudo actualizar el gasto.')
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
    <section className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <h1 className="text-2xl font-semibold text-zinc-100">Facturacion manual provisional</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Modulo temporal sin afectar inventario. Retirable cuando el inventario este completo.
        </p>


        {isAdminUser ? (
          <>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <article className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                <p className="text-xs text-zinc-500">Ventas del dia</p>
                <p className="mt-1 text-lg font-semibold text-emerald-300">
                  {formatCop(manualKpisQuery.data?.dayTotal ?? 0)}
                </p>
                <p className="text-xs text-zinc-500">
                  Facturas: {manualKpisQuery.data?.dayCount ?? 0}
                </p>
              </article>
              <article className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                <p className="text-xs text-zinc-500">Ventas del mes</p>
                <p className="mt-1 text-lg font-semibold text-amber-300">
                  {formatCop(manualKpisQuery.data?.monthTotal ?? 0)}
                </p>
                <p className="text-xs text-zinc-500">
                  Facturas: {manualKpisQuery.data?.monthCount ?? 0}
                </p>
              </article>
              <article className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                <p className="text-xs text-zinc-500">Ventas del año</p>
                <p className="mt-1 text-lg font-semibold text-sky-300">
                  {formatCop(manualKpisQuery.data?.yearTotal ?? 0)}
                </p>
                <p className="text-xs text-zinc-500">
                  Facturas: {manualKpisQuery.data?.yearCount ?? 0}
                </p>
              </article>
            </div>
            {/* KPIs separados */}
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <article className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                <p className="text-xs text-zinc-500">Separados del dia</p>
                <p className="mt-1 text-lg font-semibold text-emerald-300">
                  {formatCop(layawayKpisQuery.data?.dayTotal ?? 0)}
                </p>
                <p className="text-xs text-zinc-500">
                  Abonos: {layawayKpisQuery.data?.dayCount ?? 0}
                </p>
              </article>
              <article className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                <p className="text-xs text-zinc-500">Separados del mes</p>
                <p className="mt-1 text-lg font-semibold text-amber-300">
                  {formatCop(layawayKpisQuery.data?.monthTotal ?? 0)}
                </p>
                <p className="text-xs text-zinc-500">
                  Abonos: {layawayKpisQuery.data?.monthCount ?? 0}
                </p>
              </article>
              <article className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                <p className="text-xs text-zinc-500">Separados del año</p>
                <p className="mt-1 text-lg font-semibold text-sky-300">
                  {formatCop(layawayKpisQuery.data?.yearTotal ?? 0)}
                </p>
                <p className="text-xs text-zinc-500">
                  Activos: {layawayKpisQuery.data?.activeCount ?? 0}
                </p>
              </article>
            </div>
            {/* KPIs de cierre de caja por método de pago */}
            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <p className="text-xs text-zinc-400 font-semibold mb-2">Cierre de caja por método de pago</p>
              {paymentKpisQuery.isLoading ? (
                <p className="text-xs text-zinc-500">Cargando cierre de caja...</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="text-zinc-500">
                        <th className="px-2 py-1 text-left">Método</th>
                        <th className="px-2 py-1 text-right">Día</th>
                        <th className="px-2 py-1 text-right">Mes</th>
                        <th className="px-2 py-1 text-right">Año</th>
                      </tr>
                    </thead>
                    <tbody>
                      {['cash','addi','credilondon','dataphone','bancolombia','daviplata','nequi'].map((method) => (
                        <tr key={method}>
                          <td className="px-2 py-1">{paymentLabel(method as ManualPaymentMethod)}</td>
                          <td className="px-2 py-1 text-right">{formatCop(paymentKpisQuery.data?.[method]?.day ?? 0)}</td>
                          <td className="px-2 py-1 text-right">{formatCop(paymentKpisQuery.data?.[method]?.month ?? 0)}</td>
                          <td className="px-2 py-1 text-right">{formatCop(paymentKpisQuery.data?.[method]?.year ?? 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : null}

        {isAdminUser && manualKpisQuery.isLoading ? (
          <p className="mt-2 text-xs text-zinc-500">Cargando KPI provisionales...</p>
        ) : null}

        {/* Barcode scanner — optional inventory lookup */}
        <div className="mt-5 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Buscar en inventario (opcional)</p>
          <div className="flex gap-2">
            <input
              ref={barcodeRef}
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') { addByBarcode(barcodeInput) } }}
              placeholder="Escanea o escribe código de barras…"
              autoComplete="off"
              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => addByBarcode(barcodeInput)}
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-amber-300"
            >
              +
            </button>
          </div>
          {barcodeFeedback && (
            <p className={`mt-2 text-xs font-medium ${
              barcodeFeedback.type === 'ok' ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {barcodeFeedback.msg}
            </p>
          )}
        </div>

        <div className="mt-3 space-y-2">
          {draftItems.map((item, index) => {
            const freeMax = Math.max(0, (item.unitPrice - (item.minSalePrice ?? item.unitPrice)) * item.quantity)
            const costMax = Math.max(0, (item.unitPrice - (item.costPrice ?? 0)) * item.quantity)
            const itemMaxDiscount = (discountAuthorizedBy || user?.role !== 'cashier' || !pinRequired) ? costMax : freeMax
            const lockedForPin = user?.role === 'cashier' && pinRequired && !discountAuthorizedBy && freeMax === 0
            return (
              <div
                key={item.id}
                className={`space-y-2 rounded-xl border p-3 ${
                  item.variantId
                    ? 'border-emerald-700/40 bg-emerald-950/20'
                    : 'border-zinc-800 bg-zinc-950/60'
                }`}
              >
                <div className="grid gap-2 md:grid-cols-[1.5fr_90px_120px_auto]">
                  <input
                    value={item.description}
                    onChange={(event) => updateDraftItem(item.id, 'description', event.target.value)}
                    placeholder={`Descripcion item ${index + 1}`}
                    className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={item.quantity}
                    onChange={(event) =>
                      updateDraftItem(
                        item.id,
                        'quantity',
                        Math.max(1, parseIntegerInput(event.target.value, 1)),
                      )
                    }
                    className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    min={0}
                    value={item.unitPrice === 0 ? '' : formatCopInput(item.unitPrice)}
                    placeholder="Precio"
                    onChange={(event) =>
                      updateDraftItem(
                        item.id,
                        'unitPrice',
                        Math.max(0, parseCopIntegerInput(event.target.value, 0)),
                      )
                    }
                    className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeDraftItem(item.id)}
                    className="rounded-lg border border-rose-500/40 px-3 py-2 text-xs text-rose-300"
                  >
                    Quitar
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 shrink-0">Dcto:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={item.discount === 0 ? '' : formatCopInput(item.discount)}
                    placeholder="0"
                    readOnly={lockedForPin}
                    onClick={() => {
                      if (lockedForPin) {
                        setPinInput('')
                        setPinFeedback(null)
                        setPinModalOpen(true)
                      }
                    }}
                    onChange={(event) => {
                      const raw = parseCopIntegerInput(event.target.value, 0)
                      if (user?.role === 'cashier' && pinRequired && !discountAuthorizedBy && raw > freeMax) {
                        setPinInput('')
                        setPinFeedback(null)
                        setPinModalOpen(true)
                        return
                      }
                      updateDraftItem(item.id, 'discount', Math.min(raw, itemMaxDiscount))
                    }}
                    className="w-28 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 focus:border-amber-400 focus:outline-none read-only:cursor-pointer"
                  />
                  <span className="text-xs text-zinc-500">máx {formatCop(itemMaxDiscount)}</span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={addDraftItem}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
          >
            Agregar item
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <span className="text-xs text-zinc-400">Cliente (opcional)</span>
            <CustomerPicker
              storeId={user?.storeId ?? ''}
              name={customerName}
              phone={customerPhone}
              onSelect={(n, p) => { setCustomerName(n); setCustomerPhone(p) }}
            />
          </div>

          <label className="space-y-1">
            <span className="text-xs text-zinc-400">Metodo de pago</span>
            <select
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value as ManualPaymentMethod)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            >
              <option value="cash">Efectivo</option>
              <option value="addi">Addi</option>
              <option value="credilondon">CREDILONDON</option>
              <option value="dataphone">Datáfono</option>
              <option value="bancolombia">Bancolombia</option>
              <option value="daviplata">Daviplata</option>
              <option value="nequi">Nequi</option>
              <option value="mixed">Mixto</option>
            </select>
          </label>

          {paymentMethod === 'mixed' ? (
            <div className="space-y-2 rounded-xl border border-zinc-700 bg-zinc-950/80 p-3 md:col-span-2">
              <p className="text-xs font-semibold text-zinc-400">Desglose pago mixto</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-xs text-zinc-400">Pago 1 — método</span>
                  <select
                    value={mixedFirstMethod}
                    onChange={(event) => setMixedFirstMethod(event.target.value as ManualPaymentMethod)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  >
                    <option value="cash">Efectivo</option>
                    <option value="addi">Addi</option>
                    <option value="credilondon">CREDILONDON</option>
                    <option value="dataphone">Datáfono</option>
                    <option value="bancolombia">Bancolombia</option>
                    <option value="daviplata">Daviplata</option>
                    <option value="nequi">Nequi</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-zinc-400">Pago 1 — monto</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={mixedFirstAmount === 0 ? '' : formatCopInput(mixedFirstAmount)}
                    placeholder="0"
                    onChange={(event) => setMixedFirstAmount(parseCopIntegerInput(event.target.value, 0))}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-xs text-zinc-400">Pago 2 — método</span>
                  <select
                    value={mixedSecondMethod}
                    onChange={(event) => setMixedSecondMethod(event.target.value as ManualPaymentMethod)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  >
                    <option value="cash">Efectivo</option>
                    <option value="addi">Addi</option>
                    <option value="credilondon">CREDILONDON</option>
                    <option value="dataphone">Datáfono</option>
                    <option value="bancolombia">Bancolombia</option>
                    <option value="daviplata">Daviplata</option>
                    <option value="nequi">Nequi</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-zinc-400">Pago 2 — monto</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={mixedSecondAmount === 0 ? '' : formatCopInput(mixedSecondAmount)}
                    placeholder="0"
                    onChange={(event) => setMixedSecondAmount(parseCopIntegerInput(event.target.value, 0))}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  />
                </label>
              </div>
            </div>
          ) : null}

          {allowsPaymentReference ? (
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs text-zinc-400">Referencia pago (opcional)</span>
              <input
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
                placeholder="Transferencia o datafono"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              />
            </label>
          ) : null}
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
        </div>

        {feedback ? <p className="mt-3 text-sm text-amber-300">{feedback}</p> : null}

        <div className="mt-4">
          <button
            type="button"
            onClick={() => {
              void saveAndPrintManualInvoice()
            }}
            disabled={createMutation.isPending || !canSubmitInvoice}
            className="w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-semibold text-zinc-900 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {createMutation.isPending ? 'Guardando...' : 'Guardar e imprimir ticket'}
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-zinc-100">Gastos provisionales de caja</h2>
            <p className="text-xs text-zinc-500">{todayLabel}</p>
          </div>

          {isAdminUser ? (
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <article className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
                <p className="text-xs text-zinc-500">Gastos del día</p>
                <p className="mt-1 text-lg font-semibold text-rose-300">
                  {formatCop(expenseKpisQuery.data?.dayTotal ?? 0)}
                </p>
                <p className="text-xs text-zinc-500">Movimientos: {expenseKpisQuery.data?.dayCount ?? 0}</p>
              </article>

              <article className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
                <p className="text-xs text-zinc-500">Gastos del mes</p>
                <p className="mt-1 text-lg font-semibold text-rose-300">
                  {formatCop(expenseKpisQuery.data?.monthTotal ?? 0)}
                </p>
                <p className="text-xs text-zinc-500">Movimientos: {expenseKpisQuery.data?.monthCount ?? 0}</p>
              </article>

              <article className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
                <p className="text-xs text-zinc-500">Gastos del año</p>
                <p className="mt-1 text-lg font-semibold text-rose-300">
                  {formatCop(expenseKpisQuery.data?.yearTotal ?? 0)}
                </p>
                <p className="text-xs text-zinc-500">Movimientos: {expenseKpisQuery.data?.yearCount ?? 0}</p>
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

            {expenseFeedback ? <p className="mt-2 text-xs text-amber-300">{expenseFeedback}</p> : null}

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

          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <h3 className="text-sm font-semibold text-zinc-100">Últimos gastos registrados</h3>

            {expensesQuery.isLoading ? (
              <p className="mt-2 text-xs text-zinc-500">Cargando gastos...</p>
            ) : null}

            {!expensesQuery.isLoading && (expensesQuery.data ?? []).length === 0 ? (
              <p className="mt-2 text-xs text-zinc-500">Aún no hay gastos registrados.</p>
            ) : null}

            <div className="mt-2 space-y-2">
              {(expensesQuery.data ?? []).slice(0, 8).map((expense) => (
                <div key={expense.id} className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-zinc-300">
                      {expense.expense_date} · {expense.category?.trim() || 'Sin categoría'}
                    </p>
                    <p className="text-sm font-semibold text-rose-300">{formatCop(expense.amount)}</p>
                  </div>
                  {expense.notes ? <p className="mt-1 text-xs text-zinc-500">{expense.notes}</p> : null}
                  {isAdminUser ? (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setSelectedExpense(expense) }}
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
          </div>
        </div>
      </article>

      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <h2 className="text-lg font-semibold text-zinc-100">Ultimas facturas manuales</h2>
        <p className="mt-1 text-xs text-zinc-500">Temporal para operacion mientras migra inventario</p>

        <ul className="mt-4 space-y-2">
          {(invoicesQuery.data ?? []).map((invoice) => (
            <li key={invoice.id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="break-all text-sm font-semibold text-zinc-200">{invoice.invoice_number}</p>
                  <p className="wrap-break-word text-xs text-zinc-500">
                    {formatDateTimeColombia(invoice.created_at)} ·{' '}
                    {invoice.customer_name ?? 'Cliente general'}
                    {invoice.customer_phone ? ` · ${invoice.customer_phone}` : ''}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-emerald-300">{formatCop(invoice.grand_total)}</p>
              </div>

              <p className="mt-1 text-xs text-zinc-400">
                {paymentLabel(invoice.payment_method)}
                {invoice.payment_reference ? ` · Ref ${invoice.payment_reference}` : ''}
              </p>

              <div className={`mt-3 grid gap-2 ${isAdminUser ? 'sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
                <button
                  type="button"
                  onClick={() => selectAndReprint(invoice)}
                  className={invoiceActionButtonClass('print')}
                >
                  Reimprimir
                </button>
                {isAdminUser ? (
                  <>
                    <button
                      type="button"
                      onClick={() => openEditInvoiceModal(invoice)}
                      className={invoiceActionButtonClass('edit')}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => setInvoiceForDelete(invoice)}
                      className={invoiceActionButtonClass('delete')}
                    >
                      Eliminar
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </article>

      <ManualInvoiceReceipt invoice={selectedInvoice} receiptRef={receiptRef} />
      <ExpenseReceipt expense={selectedExpense} receiptRef={expenseReceiptRef} />

      {pinModalOpen ? (
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
            {pinFeedback ? (
              <p className="mt-3 text-sm text-rose-400">{pinFeedback}</p>
            ) : null}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setPinModalOpen(false); setPinInput(''); setPinFeedback(null) }}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isPinValidating || pinInput.length < 4}
                onClick={async () => {
                  if (!user?.storeId) return
                  setIsPinValidating(true)
                  setPinFeedback(null)
                  try {
                    const valid = await validateDiscountPin(user.storeId, pinInput)
                    if (!valid) { setPinFeedback('Clave incorrecta.'); return }
                    setDiscountAuthorizedBy('PIN')
                    setPinInput('')
                    setPinModalOpen(false)
                  } catch {
                    setPinFeedback('Error al validar la clave.')
                  } finally {
                    setIsPinValidating(false)
                  }
                }}
                className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-70"
              >
                {isPinValidating ? 'Validando...' : 'Autorizar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {invoiceForEdit ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
            <h3 className="text-lg font-semibold text-zinc-100">Editar factura manual</h3>
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

              <label className="space-y-1">
                <span className="text-xs text-zinc-400">Metodo de pago</span>
                <select
                  value={editPaymentMethod}
                  onChange={(event) => setEditPaymentMethod(event.target.value as ManualPaymentMethod)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                >
                  <option value="cash">Efectivo</option>
                  <option value="addi">Addi</option>
                  <option value="credilondon">CREDILONDON</option>
                  <option value="dataphone">Datáfono</option>
                  <option value="bancolombia">Bancolombia</option>
                  <option value="daviplata">Daviplata</option>
                  <option value="nequi">Nequi</option>
                  <option value="mixed">Mixto</option>
                </select>
              </label>

              {editPaymentMethod === 'mixed' ? (
                <div className="space-y-2 rounded-xl border border-zinc-700 bg-zinc-950/80 p-3">
                  <p className="text-xs font-semibold text-zinc-400">Desglose pago mixto</p>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <span className="text-xs text-zinc-400">Pago 1 — método</span>
                      <select
                        value={editMixedFirstMethod}
                        onChange={(event) => setEditMixedFirstMethod(event.target.value as ManualPaymentMethod)}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                      >
                        <option value="cash">Efectivo</option>
                        <option value="addi">Addi</option>
                        <option value="credilondon">CREDILONDON</option>
                        <option value="dataphone">Datáfono</option>
                        <option value="bancolombia">Bancolombia</option>
                        <option value="daviplata">Daviplata</option>
                        <option value="nequi">Nequi</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-zinc-400">Pago 1 — monto</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={editMixedFirstAmount === 0 ? '' : formatCopInput(editMixedFirstAmount)}
                        placeholder="0"
                        onChange={(event) => setEditMixedFirstAmount(parseCopIntegerInput(event.target.value, 0))}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <span className="text-xs text-zinc-400">Pago 2 — método</span>
                      <select
                        value={editMixedSecondMethod}
                        onChange={(event) => setEditMixedSecondMethod(event.target.value as ManualPaymentMethod)}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                      >
                        <option value="cash">Efectivo</option>
                        <option value="addi">Addi</option>
                        <option value="credilondon">CREDILONDON</option>
                        <option value="dataphone">Datáfono</option>
                        <option value="bancolombia">Bancolombia</option>
                        <option value="daviplata">Daviplata</option>
                        <option value="nequi">Nequi</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-zinc-400">Pago 2 — monto</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={editMixedSecondAmount === 0 ? '' : formatCopInput(editMixedSecondAmount)}
                        placeholder="0"
                        onChange={(event) => setEditMixedSecondAmount(parseCopIntegerInput(event.target.value, 0))}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                </div>
              ) : null}

              {editAllowsPaymentReference ? (
                <label className="space-y-1">
                  <span className="text-xs text-zinc-400">Referencia pago (opcional)</span>
                  <input
                    value={editPaymentReference}
                    onChange={(event) => setEditPaymentReference(event.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  />
                </label>
              ) : null}
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
                disabled={updateMutation.isPending}
                className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-70"
              >
                {updateMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {invoiceForDelete ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
            <h3 className="text-lg font-semibold text-zinc-100">Eliminar factura manual</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Seguro que deseas eliminar la factura {invoiceForDelete.invoice_number}? Esta accion la
              deja en cero y no afecta inventario.
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
                disabled={voidMutation.isPending}
                className="rounded-lg bg-rose-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
              >
                {voidMutation.isPending ? 'Eliminando...' : 'Si, eliminar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {expenseForEdit ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
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
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
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
