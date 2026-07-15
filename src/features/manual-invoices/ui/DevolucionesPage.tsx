import { useEffect, useMemo, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import { formatCop } from '../../../shared/utils/currency'
import { formatDateTimeColombia } from '../../../shared/utils/dateTime'
import { createClientId } from '../../../shared/utils/id'
import {
  formatCopInput,
  parseCopIntegerInput,
  parseIntegerInput,
} from '../../../shared/utils/numberInput'
import { useAuthStore } from '../../auth/model/useAuthStore'
import { usePosVariantsQuery } from '../../pos/model/usePosQueries'
import {
  useCreateManualInvoiceMutation,
  useCreateManualInvoiceExchangeMutation,
  useCreateManualInvoiceReturnMutation,
  useManualInvoicesQuery,
  useUpdateManualInvoiceMutation,
} from '../model/useManualInvoicesQueries'
import type { ManualInvoiceRow, ManualPaymentMethod } from '../model/manualInvoices.types'
import { getManualInvoiceById } from '../services/manualInvoicesService'
import { ManualInvoiceReceipt } from './ManualInvoiceReceipt'

interface ReturnDraftItem {
  manualInvoiceItemId: string
  description: string
  maxQuantity: number
  selected: boolean
  quantity: number
  unitPrice: number
}

interface ExchangeDraftItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  variantId?: string
}

function createExchangeDraftItem(): ExchangeDraftItem {
  return {
    id: createClientId(),
    description: '',
    quantity: 1,
    unitPrice: 0,
  }
}

export function DevolucionesPage() {
  const user = useAuthStore((state) => state.user)
  const invoicesQuery = useManualInvoicesQuery(user?.storeId)
  const createInvoiceMutation = useCreateManualInvoiceMutation(user?.storeId)
  const returnMutation = useCreateManualInvoiceReturnMutation(user?.storeId)
  const exchangeMutation = useCreateManualInvoiceExchangeMutation(user?.storeId)
  const updateMutation = useUpdateManualInvoiceMutation(user?.storeId)
  const variantsQuery = usePosVariantsQuery(user?.storeId)

  const [feedback, setFeedback] = useState<string | null>(null)
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [invoiceForReturn, setInvoiceForReturn] = useState<ManualInvoiceRow | null>(null)
  const [invoiceForClientEdit, setInvoiceForClientEdit] = useState<ManualInvoiceRow | null>(null)
  const [editCustomerName, setEditCustomerName] = useState('')
  const [editCustomerPhone, setEditCustomerPhone] = useState('')
  const [returnDraftItems, setReturnDraftItems] = useState<ReturnDraftItem[]>([])
  const [exchangeItems, setExchangeItems] = useState<ExchangeDraftItem[]>([createExchangeDraftItem()])
  const [exchangeBarcodeInput, setExchangeBarcodeInput] = useState('')
  const [exchangeBarcodeFeedback, setExchangeBarcodeFeedback] = useState<string | null>(null)
  const exchangeBarcodeRef = useRef<HTMLInputElement>(null)
  const [paymentMethod, setPaymentMethod] = useState<ManualPaymentMethod>('cash')
  const [paymentReference, setPaymentReference] = useState('')
  const [mixedFirstMethod, setMixedFirstMethod] = useState<ManualPaymentMethod>('cash')
  const [mixedFirstAmount, setMixedFirstAmount] = useState(0)
  const [mixedSecondMethod, setMixedSecondMethod] = useState<ManualPaymentMethod>('addi')
  const [mixedSecondAmount, setMixedSecondAmount] = useState(0)
  const [receiptInvoice, setReceiptInvoice] = useState<ManualInvoiceRow | null>(null)
  const [pendingPrint, setPendingPrint] = useState(false)
  const receiptRef = useRef<HTMLDivElement>(null)

  const allowsPaymentReference = paymentMethod !== 'cash' && paymentMethod !== 'mixed'

  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: receiptInvoice?.invoice_number ?? 'factura-manual-cambio',
    pageStyle:
      '@page { size: 56mm auto; margin: 0mm; } @media print { html { height: auto !important; min-height: 0 !important; overflow: visible !important; } body { margin: 0 !important; padding: 0 !important; height: auto !important; min-height: 0 !important; overflow: visible !important; background: white !important; color: black !important; } }',
  })

  useEffect(() => {
    if (!pendingPrint || !receiptInvoice) {
      return
    }

    // Espera a que React monte el recibo en el DOM antes de invocar react-to-print.
    const frame1 = requestAnimationFrame(() => {
      const frame2 = requestAnimationFrame(() => {
        if (!receiptRef.current) {
          setPendingPrint(false)
          setFeedback('No se pudo preparar el recibo para imprimir. Intenta de nuevo.')
          return
        }

        void handlePrint()
        setPendingPrint(false)
      })

      return () => cancelAnimationFrame(frame2)
    })

    return () => cancelAnimationFrame(frame1)
  }, [pendingPrint, receiptInvoice, handlePrint])

  function openReturnInvoiceModal(invoice: ManualInvoiceRow) {
    const baseItems = (invoice.manual_invoice_items ?? []).map((item) => ({
      manualInvoiceItemId: item.id,
      description: item.description,
      maxQuantity: Math.max(0, Number(item.quantity ?? 0)),
      selected: false,
      quantity: 0,
      unitPrice: Math.max(0, Number(item.unit_price ?? 0)),
    }))

    setInvoiceForReturn(invoice)
    setReturnDraftItems(baseItems)
    setExchangeItems([createExchangeDraftItem()])
    setExchangeBarcodeInput('')
    setExchangeBarcodeFeedback(null)
    setPaymentMethod('cash')
    setPaymentReference('')
    setMixedFirstMethod('cash')
    setMixedFirstAmount(0)
    setMixedSecondMethod('addi')
    setMixedSecondAmount(0)
  }

  function openEditClientModal(invoice: ManualInvoiceRow) {
    setInvoiceForClientEdit(invoice)
    setEditCustomerName(invoice.customer_name ?? '')
    setEditCustomerPhone(invoice.customer_phone ?? '')
  }

  function closeEditClientModal() {
    setInvoiceForClientEdit(null)
    setEditCustomerName('')
    setEditCustomerPhone('')
  }

  async function confirmClientEdit() {
    if (!invoiceForClientEdit || !user?.id) {
      return
    }

    if (!editCustomerPhone.trim()) {
      setFeedback('El teléfono del cliente es obligatorio para habilitar devoluciones/cambios.')
      return
    }

    try {
      await updateMutation.mutateAsync({
        invoiceId: invoiceForClientEdit.id,
        actorUserId: user.id,
        customerName: editCustomerName,
        customerPhone: editCustomerPhone,
        paymentMethod: invoiceForClientEdit.payment_method,
        paymentReference: invoiceForClientEdit.payment_reference ?? '',
      })

      setFeedback(`Cliente actualizado en ${invoiceForClientEdit.invoice_number}. Ya puedes hacer devolución/cambio.`)
      closeEditClientModal()
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No se pudo actualizar el cliente de la factura.')
    }
  }

  function closeReturnInvoiceModal() {
    setInvoiceForReturn(null)
    setReturnDraftItems([])
    setExchangeItems([createExchangeDraftItem()])
    setExchangeBarcodeInput('')
    setExchangeBarcodeFeedback(null)
  }

  function updateReturnDraftQuantity(itemId: string, nextQty: number) {
    setReturnDraftItems((prev) =>
      prev.map((item) => {
        if (item.manualInvoiceItemId !== itemId) {
          return item
        }

        const normalizedQty = Math.min(item.maxQuantity, Math.max(0, nextQty))

        return {
          ...item,
          selected: normalizedQty > 0,
          quantity: normalizedQty,
        }
      }),
    )
  }

  function toggleReturnDraftItem(itemId: string, selected: boolean) {
    setReturnDraftItems((prev) =>
      prev.map((item) => {
        if (item.manualInvoiceItemId !== itemId) {
          return item
        }

        return {
          ...item,
          selected,
          quantity: selected ? (item.quantity > 0 ? item.quantity : 1) : 0,
        }
      }),
    )
  }

  function selectAllReturnItems() {
    setReturnDraftItems((prev) =>
      prev.map((item) => ({
        ...item,
        selected: true,
        quantity: item.quantity > 0 ? item.quantity : 1,
      })),
    )
  }

  function clearReturnItemSelection() {
    setReturnDraftItems((prev) =>
      prev.map((item) => ({
        ...item,
        selected: false,
        quantity: 0,
      })),
    )
  }

  const selectedReturnItems = useMemo(
    () => returnDraftItems.filter((item) => item.selected && item.quantity > 0),
    [returnDraftItems],
  )

  const returnDraftTotal = useMemo(() => {
    return selectedReturnItems.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0)
  }, [selectedReturnItems])

  const hasSelectedReturnItems = selectedReturnItems.length > 0

  useEffect(() => {
    if (hasSelectedReturnItems) {
      return
    }

    setExchangeItems([createExchangeDraftItem()])
    setExchangeBarcodeInput('')
    setExchangeBarcodeFeedback(null)
    setPaymentMethod('cash')
    setPaymentReference('')
    setMixedFirstMethod('cash')
    setMixedFirstAmount(0)
    setMixedSecondMethod('addi')
    setMixedSecondAmount(0)
  }, [returnDraftItems])

  const cleanedExchangeItems = useMemo(
    () =>
      exchangeItems
        .map((item) => ({
          description: item.description.trim(),
          quantity: Math.max(0, Number(item.quantity || 0)),
          unitPrice: Math.max(0, Number(item.unitPrice || 0)),
          variantId: item.variantId,
        }))
        .filter((item) => item.description && item.quantity > 0),
    [exchangeItems],
  )

  const exchangeSubtotal = useMemo(
    () => cleanedExchangeItems.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0),
    [cleanedExchangeItems],
  )

  const exchangeCreditToApply = Math.min(returnDraftTotal, exchangeSubtotal)
  const exchangeAdditionalPayment = Math.max(0, exchangeSubtotal - exchangeCreditToApply)

  function updateExchangeItem(id: string, field: keyof ExchangeDraftItem, value: string | number) {
    setExchangeItems((prev) =>
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

  function addExchangeItem() {
    setExchangeItems((prev) => [...prev, createExchangeDraftItem()])
  }

  function removeExchangeItem(id: string) {
    setExchangeItems((prev) => {
      const next = prev.filter((item) => item.id !== id)
      return next.length > 0 ? next : [createExchangeDraftItem()]
    })
  }

  function addExchangeByBarcode(code: string) {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return

    const source = variantsQuery.data ?? []
    const match = source.find(
      (it) => it.barcode.toUpperCase() === trimmed || it.sku.toUpperCase() === trimmed,
    )

    if (!match) {
      setExchangeBarcodeFeedback(`No encontrado en inventario: ${trimmed}`)
      return
    }

    const stock = match.inventory_stock?.[0]?.quantity_on_hand ?? 0
    if (stock <= 0) {
      setExchangeBarcodeFeedback(`Sin stock: ${match.products?.name ?? match.sku}`)
      return
    }

    const productName = match.products?.name ?? match.sku
    const parts = [productName, match.size, match.color].filter(Boolean)
    const description = parts.join(' - ')

    const existing = exchangeItems.find((item) => item.variantId === match.id)
    if (existing) {
      if (existing.quantity >= stock) {
        setExchangeBarcodeFeedback(`Stock máximo alcanzado: ${stock} ud.`)
        return
      }
      setExchangeItems((prev) =>
        prev.map((item) =>
          item.variantId === match.id ? { ...item, quantity: item.quantity + 1 } : item,
        ),
      )
      setExchangeBarcodeInput('')
      setExchangeBarcodeFeedback(`+1 ${productName}`)
      return
    }

    setExchangeItems((prev) => {
      const emptyIdx = prev.findIndex((item) => !item.variantId && !item.description.trim() && item.unitPrice === 0)
      if (emptyIdx !== -1) {
        return prev.map((item, idx) =>
          idx === emptyIdx
            ? {
                ...item,
                description,
                quantity: 1,
                unitPrice: Number(match.sale_price),
                variantId: match.id,
              }
            : item,
        )
      }
      return [
        ...prev,
        {
          id: createClientId(),
          description,
          quantity: 1,
          unitPrice: Number(match.sale_price),
          variantId: match.id,
        },
      ]
    })
    setExchangeBarcodeInput('')
    setExchangeBarcodeFeedback(`✓ ${productName}`)
  }

  async function confirmReturnInvoice() {
    if (!invoiceForReturn || !user?.id) {
      return
    }

    if (!invoiceForReturn.customer_phone?.trim()) {
      setFeedback(
        'Esta factura no tiene teléfono de cliente. Para devolver/cambiar, primero edita la factura y asigna un teléfono.',
      )
      return
    }

    const returnItems = selectedReturnItems.map((item) => ({
        manualInvoiceItemId: item.manualInvoiceItemId,
        quantity: item.quantity,
      }))

    if (returnItems.length === 0) {
      setFeedback('Selecciona al menos un item para devolver.')
      return
    }

    if (cleanedExchangeItems.length === 0) {
      try {
        const result = await returnMutation.mutateAsync({
          invoiceId: invoiceForReturn.id,
          actorUserId: user.id,
          items: returnItems,
        })

        setFeedback(
          `Devolución ${result.returnNumber} registrada. Saldo a favor generado: ${formatCop(result.creditAmount)}.`,
        )
        closeReturnInvoiceModal()
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : 'No se pudo registrar la devolución.')
      }
      return
    }

    if (exchangeAdditionalPayment > 0 && paymentMethod === 'mixed') {
      const mixedSum = mixedFirstAmount + mixedSecondAmount
      if (Math.abs(mixedSum - exchangeAdditionalPayment) > 1) {
        setFeedback(
          `Los montos mixtos suman ${formatCop(mixedSum)} y el excedente a cobrar es ${formatCop(exchangeAdditionalPayment)}.`,
        )
        return
      }
    }

    if (exchangeAdditionalPayment <= 0) {
      setPaymentMethod('cash')
      setPaymentReference('')
    }

    try {
      const result = await exchangeMutation.mutateAsync({
        sourceInvoiceId: invoiceForReturn.id,
        actorUserId: user.id,
        customerName: invoiceForReturn.customer_name ?? undefined,
        customerPhone: invoiceForReturn.customer_phone ?? undefined,
        paymentMethod: exchangeAdditionalPayment > 0 ? paymentMethod : 'cash',
        paymentReference:
          exchangeAdditionalPayment > 0
            ? paymentMethod === 'mixed'
              ? `${mixedFirstMethod}:${mixedFirstAmount}:${mixedSecondMethod}:${mixedSecondAmount}`
              : allowsPaymentReference
                ? paymentReference
                : ''
            : '',
        applyReturnCredit: exchangeCreditToApply,
        returnItems,
        newItems: cleanedExchangeItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          variantId: item.variantId,
        })),
      })

      if (user?.storeId) {
        const printedInvoice = await getManualInvoiceById(user.storeId, result.newInvoiceId)
        setReceiptInvoice(printedInvoice)
        setPendingPrint(true)
      }

      setFeedback(
        `Cambio aplicado. Nueva factura: ${result.newInvoiceNumber}. Excedente cobrado: ${formatCop(result.additionalPayment)}. Saldo restante: ${formatCop(result.remainingCredit)}.`,
      )
      closeReturnInvoiceModal()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'No se pudo registrar el cambio.'

      // Fallback operativo: si el RPC de cambio falla en BD, ejecutar devolucion + factura nueva con saldo aplicado.
      const shouldUseFallbackFlow =
        errorMessage.includes('[42702]') ||
        errorMessage.toLowerCase().includes('customer_phone') ||
        errorMessage.toLowerCase().includes('create_manual_invoice_exchange_transaction')

      if (!shouldUseFallbackFlow) {
        setFeedback(errorMessage)
        return
      }

      try {
        const returnResult = await returnMutation.mutateAsync({
          invoiceId: invoiceForReturn.id,
          actorUserId: user.id,
          items: returnItems,
        })

        const creditToApply = Math.min(Math.max(0, Number(returnResult.creditAmount ?? 0)), exchangeSubtotal)

        const invoiceResult = await createInvoiceMutation.mutateAsync({
          storeId: user.storeId,
          createdBy: user.id,
          customerName: invoiceForReturn.customer_name ?? '',
          customerPhone: invoiceForReturn.customer_phone ?? '',
          discountTotal: 0,
          applyCreditAmount: creditToApply,
          paymentMethod: exchangeAdditionalPayment > 0 ? paymentMethod : 'cash',
          paymentReference:
            exchangeAdditionalPayment > 0
              ? paymentMethod === 'mixed'
                ? `${mixedFirstMethod}:${mixedFirstAmount}:${mixedSecondMethod}:${mixedSecondAmount}`
                : allowsPaymentReference
                  ? paymentReference
                  : ''
              : '',
          items: cleanedExchangeItems.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            variantId: item.variantId,
          })),
        })

        if (user?.storeId) {
          const printedInvoice = await getManualInvoiceById(user.storeId, invoiceResult.invoiceId)
          setReceiptInvoice(printedInvoice)
          setPendingPrint(true)
        }

        const remainingCredit = Math.max(0, Number(returnResult.creditAmount ?? 0) - creditToApply)

        setFeedback(
          `Cambio aplicado (modo seguro). Devolución: ${returnResult.returnNumber}. Nueva factura: ${invoiceResult.invoiceNumber}. Excedente cobrado: ${formatCop(exchangeAdditionalPayment)}. Saldo restante: ${formatCop(remainingCredit)}.`,
        )
        closeReturnInvoiceModal()
      } catch (fallbackError) {
        setFeedback(
          fallbackError instanceof Error
            ? fallbackError.message
            : 'No se pudo registrar el cambio en modo seguro.',
        )
      }
    }
  }

  const filteredInvoices = (invoicesQuery.data ?? []).filter((invoice) => {
    if (!invoiceSearch.trim()) return true
    const q = invoiceSearch.trim().toLowerCase()
    return (
      invoice.invoice_number.toLowerCase().includes(q) ||
      (invoice.customer_name ?? '').toLowerCase().includes(q) ||
      (invoice.customer_phone ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-100">Cambios</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Módulo separado para devoluciones y cambios. Cada devolución regresa inventario y crea saldo a favor.
        </p>
      </header>

      {feedback ? <p className="text-sm text-amber-300">{feedback}</p> : null}

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
        <input
          type="text"
          placeholder="Buscar factura por número, nombre o celular…"
          value={invoiceSearch}
          onChange={(e) => setInvoiceSearch(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-400 focus:outline-none"
        />

        <ul className="ghost-scrollbar mt-3 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {filteredInvoices.map((invoice) => (
            <li key={invoice.id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="break-all text-sm font-semibold text-zinc-200">{invoice.invoice_number}</p>
                    {invoice.exchange_role === 'changed_original' ? (
                      <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                        Cambiada
                      </span>
                    ) : null}
                    {invoice.exchange_role === 'replacement' ? (
                      <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                        Factura de cambio
                      </span>
                    ) : null}
                  </div>
                  <p className="wrap-break-word text-xs text-zinc-500">
                    {formatDateTimeColombia(invoice.created_at)} · {invoice.customer_name ?? 'Cliente general'}
                    {invoice.customer_phone ? ` · ${invoice.customer_phone}` : ''}
                  </p>
                  {invoice.customer_phone ? (
                    <p className="mt-1 text-[11px] text-emerald-300">
                      Saldo a favor disponible: {formatCop(invoice.customer_credit_balance ?? 0)}
                    </p>
                  ) : null}
                  {invoice.exchange_role === 'changed_original' ? (
                    <p className="mt-1 text-[11px] text-amber-300">
                      Cambiada por: {invoice.linked_exchange_invoice_number ?? 'Factura relacionada'}
                    </p>
                  ) : null}
                  {invoice.exchange_role === 'replacement' ? (
                    <p className="mt-1 text-[11px] text-emerald-300">
                      Cambio de: {invoice.linked_exchange_invoice_number ?? 'Factura original'}
                    </p>
                  ) : null}
                </div>
                <p className="shrink-0 text-sm font-semibold text-emerald-300">{formatCop(invoice.grand_total)}</p>
              </div>

              <div className="mt-3">
                {invoice.customer_phone ? (
                  <button
                    type="button"
                    onClick={() => openReturnInvoiceModal(invoice)}
                    disabled={invoice.exchange_role === 'changed_original'}
                    className="inline-flex h-8 w-full items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-500"
                  >
                    {invoice.exchange_role === 'changed_original' ? 'Ya fue cambiada' : 'Crear devolución'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => openEditClientModal(invoice)}
                    className="inline-flex h-8 w-full items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-medium text-zinc-300 transition-colors hover:border-amber-500/40 hover:text-amber-200"
                  >
                    Agregar teléfono para habilitar devolución/cambio
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {invoiceForClientEdit ? (
        <div className="fixed inset-0 z-60 flex items-start justify-center overflow-y-auto bg-black/70 p-4 py-8">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
            <h3 className="text-lg font-semibold text-zinc-100">Editar cliente de factura</h3>
            <p className="mt-1 text-xs text-zinc-500">{invoiceForClientEdit.invoice_number}</p>

            <div className="mt-4 space-y-3">
              <label className="space-y-1">
                <span className="text-xs text-zinc-400">Nombre (opcional)</span>
                <input
                  value={editCustomerName}
                  onChange={(event) => setEditCustomerName(event.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-zinc-400">Teléfono (obligatorio)</span>
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
                onClick={closeEditClientModal}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  void confirmClientEdit()
                }}
                disabled={updateMutation.isPending}
                className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-70"
              >
                {updateMutation.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {invoiceForReturn ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-3 pt-6 sm:p-4 sm:pt-10">
          <div className="ghost-scrollbar w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-4 sm:p-5">
            <h3 className="text-lg font-semibold text-zinc-100">Registrar devolución</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Factura {invoiceForReturn.invoice_number}. Lo devuelto regresa a inventario y queda como saldo a favor.
            </p>

            <div className="ghost-scrollbar mt-4 max-h-[35vh] space-y-2 overflow-y-auto pr-1 sm:max-h-80">
              <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={selectAllReturnItems}
                  className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                >
                  Seleccionar todos
                </button>
                <button
                  type="button"
                  onClick={clearReturnItemSelection}
                  className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  Limpiar selección
                </button>
              </div>
              {returnDraftItems.map((item) => (
                <button
                  key={item.manualInvoiceItemId}
                  type="button"
                  onClick={() => toggleReturnDraftItem(item.manualInvoiceItemId, !item.selected)}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${
                    item.selected
                      ? 'border-amber-500/50 bg-amber-500/10'
                      : 'border-zinc-800 bg-zinc-950/70 hover:border-zinc-700'
                  }`}
                  aria-pressed={item.selected}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-medium text-zinc-200">{item.description}</p>
                    <p className="text-xs text-zinc-500">Máx: {item.maxQuantity}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-xs text-zinc-400">
                      Cantidad devolver
                      <input
                        type="number"
                        min={0}
                        max={item.maxQuantity}
                        value={item.quantity}
                        onChange={(event) =>
                          updateReturnDraftQuantity(
                            item.manualInvoiceItemId,
                            Math.max(0, parseIntegerInput(event.target.value, 0)),
                          )
                        }
                        disabled={!item.selected}
                        className="w-20 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-right text-xs text-zinc-100"
                        onClick={(event) => event.stopPropagation()}
                      />
                    </label>
                    <p className="text-sm font-semibold text-amber-200">
                      {formatCop(item.quantity * item.unitPrice)}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {hasSelectedReturnItems ? (
              <div className="mt-4 space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Artículos de cambio</p>

                <div className="flex flex-wrap gap-2">
                  <input
                    ref={exchangeBarcodeRef}
                    type="text"
                    value={exchangeBarcodeInput}
                    onChange={(event) => setExchangeBarcodeInput(event.target.value.toUpperCase())}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        addExchangeByBarcode(exchangeBarcodeInput)
                      }
                    }}
                    placeholder="Escanea o escribe código de barras"
                    className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => addExchangeByBarcode(exchangeBarcodeInput)}
                    className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-amber-300"
                  >
                    +
                  </button>
                </div>
                {exchangeBarcodeFeedback ? (
                  <p className="text-xs text-amber-300">{exchangeBarcodeFeedback}</p>
                ) : null}

                <div className="ghost-scrollbar max-h-52 space-y-2 overflow-y-auto pr-1">
                  {exchangeItems.map((item) => (
                    <div key={item.id} className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/70 p-2">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1.6fr_90px_120px_auto]">
                        <input
                          value={item.description}
                          onChange={(event) => updateExchangeItem(item.id, 'description', event.target.value)}
                          placeholder="Descripción"
                          className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs"
                        />
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(event) =>
                            updateExchangeItem(
                              item.id,
                              'quantity',
                              Math.max(1, parseIntegerInput(event.target.value, 1)),
                            )
                          }
                          className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs"
                        />
                        <input
                          type="text"
                          inputMode="numeric"
                          value={item.unitPrice === 0 ? '' : formatCopInput(item.unitPrice)}
                          onChange={(event) =>
                            updateExchangeItem(item.id, 'unitPrice', Math.max(0, parseCopIntegerInput(event.target.value, 0)))
                          }
                          placeholder="Precio"
                          className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => removeExchangeItem(item.id)}
                          className="rounded-lg border border-rose-500/40 px-2 py-2 text-xs text-rose-300"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addExchangeItem}
                  className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200"
                >
                  Agregar artículo
                </button>

                <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 text-xs text-zinc-300">
                  <div className="flex justify-between">
                    <span>Total devuelto</span>
                    <span>{formatCop(returnDraftTotal)}</span>
                  </div>
                  <div className="mt-1 flex justify-between">
                    <span>Total artículos cambio</span>
                    <span>{formatCop(exchangeSubtotal)}</span>
                  </div>
                  <div className="mt-1 flex justify-between">
                    <span>Saldo aplicado al cambio</span>
                    <span>{formatCop(exchangeCreditToApply)}</span>
                  </div>
                  <div className="mt-2 flex justify-between text-sm font-semibold text-amber-200">
                    <span>Excedente a cobrar</span>
                    <span>{formatCop(exchangeAdditionalPayment)}</span>
                  </div>
                </div>

                {exchangeAdditionalPayment > 0 ? (
                  <div className="space-y-2">
                    <label className="space-y-1">
                      <span className="text-xs text-zinc-400">Método de pago del excedente</span>
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
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <select
                          value={mixedFirstMethod}
                          onChange={(event) => setMixedFirstMethod(event.target.value as ManualPaymentMethod)}
                          className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs"
                        >
                          <option value="cash">Efectivo</option>
                          <option value="addi">Addi</option>
                          <option value="credilondon">CREDILONDON</option>
                          <option value="dataphone">Datáfono</option>
                          <option value="bancolombia">Bancolombia</option>
                          <option value="daviplata">Daviplata</option>
                          <option value="nequi">Nequi</option>
                        </select>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={mixedFirstAmount === 0 ? '' : formatCopInput(mixedFirstAmount)}
                          onChange={(event) => setMixedFirstAmount(parseCopIntegerInput(event.target.value, 0))}
                          placeholder="Monto pago 1"
                          className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs"
                        />
                        <select
                          value={mixedSecondMethod}
                          onChange={(event) => setMixedSecondMethod(event.target.value as ManualPaymentMethod)}
                          className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs"
                        >
                          <option value="cash">Efectivo</option>
                          <option value="addi">Addi</option>
                          <option value="credilondon">CREDILONDON</option>
                          <option value="dataphone">Datáfono</option>
                          <option value="bancolombia">Bancolombia</option>
                          <option value="daviplata">Daviplata</option>
                          <option value="nequi">Nequi</option>
                        </select>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={mixedSecondAmount === 0 ? '' : formatCopInput(mixedSecondAmount)}
                          onChange={(event) => setMixedSecondAmount(parseCopIntegerInput(event.target.value, 0))}
                          placeholder="Monto pago 2"
                          className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs"
                        />
                      </div>
                    ) : null}

                    {allowsPaymentReference ? (
                      <input
                        value={paymentReference}
                        onChange={(event) => setPaymentReference(event.target.value)}
                        placeholder="Referencia del pago (opcional)"
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="flex items-center justify-between text-sm text-zinc-300">
                <span>Total saldo a favor generado</span>
                <span className="font-semibold text-amber-200">{formatCop(returnDraftTotal)}</span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={closeReturnInvoiceModal}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  void confirmReturnInvoice()
                }}
                disabled={
                  returnMutation.isPending ||
                  createInvoiceMutation.isPending ||
                  exchangeMutation.isPending ||
                  returnDraftTotal <= 0
                }
                className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-amber-300 disabled:opacity-70"
              >
                {returnMutation.isPending || createInvoiceMutation.isPending || exchangeMutation.isPending
                  ? 'Procesando...'
                  : cleanedExchangeItems.length > 0
                    ? 'Confirmar cambio'
                    : 'Confirmar devolución'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ManualInvoiceReceipt invoice={receiptInvoice} receiptRef={receiptRef} />
    </section>
  )
}
