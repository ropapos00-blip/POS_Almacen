import { useEffect, useMemo, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import { formatCop } from '../../../shared/utils/currency'
import { createClientId } from '../../../shared/utils/id'
import { parseDecimalInput, parseIntegerInput } from '../../../shared/utils/numberInput'
import { useAuthStore } from '../../auth/model/useAuthStore'
import {
  useCreateManualInvoiceMutation,
  useManualInvoicesQuery,
} from '../model/useManualInvoicesQueries'
import type { ManualInvoiceRow, ManualPaymentMethod } from '../model/manualInvoices.types'
import { ManualInvoiceReceipt } from './ManualInvoiceReceipt'

interface DraftItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
}

function paymentLabel(method: ManualPaymentMethod) {
  if (method === 'cash') return 'Efectivo'
  if (method === 'card') return 'Tarjeta'
  if (method === 'transfer') return 'Transferencia'
  return 'Mixto'
}

function createDraftItem(): DraftItem {
  return {
    id: createClientId(),
    description: '',
    quantity: 1,
    unitPrice: 0,
  }
}

export function ManualInvoicesPage() {
  const user = useAuthStore((state) => state.user)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [discountTotal, setDiscountTotal] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<ManualPaymentMethod>('cash')
  const [paymentReference, setPaymentReference] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [draftItems, setDraftItems] = useState<DraftItem[]>([createDraftItem()])
  const [selectedInvoice, setSelectedInvoice] = useState<ManualInvoiceRow | null>(null)
  const receiptRef = useRef<HTMLDivElement>(null)

  const invoicesQuery = useManualInvoicesQuery(user?.storeId)
  const createMutation = useCreateManualInvoiceMutation(user?.storeId)

  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: selectedInvoice?.invoice_number ?? 'factura-manual',
  })

  const subtotal = useMemo(() => {
    return draftItems.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0)
  }, [draftItems])

  const total = useMemo(() => {
    return Math.max(0, subtotal - discountTotal)
  }, [discountTotal, subtotal])

  const allowsPaymentReference = paymentMethod === 'card' || paymentMethod === 'transfer'

  useEffect(() => {
    if (!allowsPaymentReference && paymentReference) {
      setPaymentReference('')
    }
  }, [allowsPaymentReference, paymentReference])

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

  const cleanedItemsForValidation = draftItems
    .map((item) => ({
      description: item.description.trim(),
      quantity: Math.max(0, Number(item.quantity || 0)),
      unitPrice: Math.max(0, Number(item.unitPrice || 0)),
    }))
    .filter((item) => item.description && item.quantity > 0)

  const canSubmitInvoice =
    Boolean(user?.storeId && user.id) &&
    cleanedItemsForValidation.length > 0 &&
    discountTotal >= 0 &&
    discountTotal <= subtotal

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

    if (discountTotal > subtotal) {
      setFeedback('El descuento no puede superar el subtotal.')
      return null
    }

    try {
      const result = await createMutation.mutateAsync({
        storeId: user.storeId,
        createdBy: user.id,
        customerName,
        customerPhone,
        discountTotal,
        paymentMethod,
        paymentReference: allowsPaymentReference ? paymentReference : '',
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
        payment_reference: allowsPaymentReference ? paymentReference.trim() || null : null,
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
      setDiscountTotal(0)
      setPaymentMethod('cash')
      setPaymentReference('')
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

  return (
    <section className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <h1 className="text-2xl font-semibold text-zinc-100">Facturacion manual provisional</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Modulo temporal sin afectar inventario. Retirable cuando el inventario este completo.
        </p>

        <div className="mt-5 space-y-2">
          {draftItems.map((item, index) => (
            <div
              key={item.id}
              className="grid gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 md:grid-cols-[1.5fr_90px_120px_auto]"
            >
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
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={item.unitPrice === 0 ? '' : item.unitPrice}
                placeholder="Precio"
                onChange={(event) =>
                  updateDraftItem(
                    item.id,
                    'unitPrice',
                    Math.max(0, parseDecimalInput(event.target.value, 0)),
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
          ))}
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
          <label className="space-y-1">
            <span className="text-xs text-zinc-400">Cliente (opcional)</span>
            <input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-zinc-400">Telefono cliente (opcional)</span>
            <input
              type="tel"
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-zinc-400">Metodo de pago</span>
            <select
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value as ManualPaymentMethod)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            >
              <option value="cash">Efectivo</option>
              <option value="card">Tarjeta</option>
              <option value="transfer">Transferencia</option>
              <option value="mixed">Mixto</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs text-zinc-400">Descuento</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={discountTotal === 0 ? '' : discountTotal}
              placeholder="0"
              onChange={(event) => setDiscountTotal(parseDecimalInput(event.target.value, 0))}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
          </label>

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
      </article>

      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <h2 className="text-lg font-semibold text-zinc-100">Ultimas facturas manuales</h2>
        <p className="mt-1 text-xs text-zinc-500">Temporal para operacion mientras migra inventario</p>

        <ul className="mt-4 space-y-2">
          {(invoicesQuery.data ?? []).map((invoice) => (
            <li key={invoice.id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-200">{invoice.invoice_number}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(invoice.created_at).toLocaleString()} ·{' '}
                    {invoice.customer_name ?? 'Cliente general'}
                    {invoice.customer_phone ? ` · ${invoice.customer_phone}` : ''}
                  </p>
                </div>
                <p className="text-sm font-semibold text-emerald-300">{formatCop(invoice.grand_total)}</p>
              </div>

              <p className="mt-1 text-xs text-zinc-400">
                {paymentLabel(invoice.payment_method)}
                {invoice.payment_reference ? ` · Ref ${invoice.payment_reference}` : ''}
              </p>

              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => selectAndReprint(invoice)}
                  className="rounded-md border border-amber-500/40 px-2 py-1 text-xs text-amber-300"
                >
                  Reimprimir ticket
                </button>
              </div>
            </li>
          ))}
        </ul>
      </article>

      <ManualInvoiceReceipt invoice={selectedInvoice} receiptRef={receiptRef} />
    </section>
  )
}
