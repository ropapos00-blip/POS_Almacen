import type { RefObject } from 'react'
import { formatCop } from '../../../shared/utils/currency'
import { formatDateTimeColombia } from '../../../shared/utils/dateTime'
import { useAuthStore } from '../../auth/model/useAuthStore'
import type { ManualInvoiceRow, ManualPaymentMethod } from '../model/manualInvoices.types'

function paymentLabel(method: ManualPaymentMethod) {
  switch (method) {
    case 'cash':
      return 'Efectivo'
    case 'addi':
      return 'Addi'
    case 'credilondon':
      return 'Crédito London'
    case 'dataphone':
      return 'Datáfono'
    case 'bancolombia':
      return 'Bancolombia'
    case 'daviplata':
      return 'Daviplata'
    case 'nequi':
      return 'Nequi'
    case 'rapirecarga':
      return 'Rapirecarga'
    case 'mixed':
      return 'Mixto'
    default:
      return method
  }
}

function parseMixedPaymentReference(reference: string | null) {
  if (!reference) return null
  const parts = reference.split(':')
  if (parts.length !== 4) return null
  const firstMethod = parts[0] as ManualPaymentMethod
  const firstAmount = Number(parts[1])
  const secondMethod = parts[2] as ManualPaymentMethod
  const secondAmount = Number(parts[3])
  if (!Number.isFinite(firstAmount) || !Number.isFinite(secondAmount)) return null
  return {
    firstMethod,
    firstAmount,
    secondMethod,
    secondAmount,
  }
}

export function ManualInvoiceReceipt({
  receiptRef,
  invoice,
}: {
  receiptRef: RefObject<HTMLDivElement | null>
  invoice: ManualInvoiceRow | null
}) {
  const user = useAuthStore((state) => state.user)

  if (!invoice) {
    return null
  }

  const businessName = user?.storeReceipt.legalName || user?.storeName || 'POS Retail'
  const mixedPayment = invoice.payment_method === 'mixed'
    ? parseMixedPaymentReference(invoice.payment_reference)
    : null

  return (
    <div className="sr-only">
      <div ref={receiptRef} className="text-black" style={{ width: '56mm', margin: 0, padding: '0 2mm 4mm 2mm', boxSizing: 'border-box', background: 'white' }}>
        <h1
          className="store-logo-font text-center text-base font-bold uppercase tracking-[0.08em]"
          style={{ fontFamily: "'Dolce Vita', 'Space Grotesk', sans-serif" }}
        >
          {businessName}
        </h1>
        {user?.storeReceipt.taxId ? <p className="text-center text-xs">NIT: {user.storeReceipt.taxId}</p> : null}
        {user?.storeReceipt.taxRegime ? (
          <p className="text-center text-xs">{user.storeReceipt.taxRegime}</p>
        ) : null}
        {user?.storeReceipt.address ? <p className="text-center text-xs">{user.storeReceipt.address}</p> : null}
        {user?.storeReceipt.city ? <p className="text-center text-xs">{user.storeReceipt.city}</p> : null}
        {user?.storeReceipt.phone ? <p className="text-center text-xs">{user.storeReceipt.phone}</p> : null}

        <p className="mt-2 text-center text-xs">Ticket de venta</p>
        <p className="mt-3 text-xs">Venta: {invoice.invoice_number}</p>
        <p className="text-xs">Fecha: {formatDateTimeColombia(invoice.created_at)}</p>
        {invoice.customer_name ? <p className="text-xs">Cliente: {invoice.customer_name}</p> : null}
        {invoice.customer_phone ? <p className="text-xs">Telefono: {invoice.customer_phone}</p> : null}

        <div className="mt-3 border-t border-dashed border-black pt-2">
          {(invoice.manual_invoice_items ?? []).map((item) => (
            <div key={item.id} className="mb-2 text-xs">
              <p>{item.description}</p>
              <div className="flex justify-between gap-1">
                <span className="text-zinc-500">{item.quantity} x {formatCop(item.unit_price)}</span>
                <span className="font-medium" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{formatCop(item.line_total)}</span>
              </div>
              {(Number(item.discount_amount ?? 0) > 0) ? (
                <div className="flex justify-between gap-1">
                  <span>Descuento</span>
                  <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{`-${formatCop(Number(item.discount_amount ?? 0))}`}</span>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-2 border-t border-dashed border-black pt-2 text-xs">
          <div className="flex justify-between gap-2">
            <span>Subtotal</span>
            <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{formatCop(invoice.subtotal)}</span>
          </div>
          {Number(invoice.discount_total ?? 0) > 0 ? (
            <div className="flex justify-between gap-2">
              <span>Descuento</span>
              <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{formatCop(invoice.discount_total)}</span>
            </div>
          ) : null}
          <div className="mt-1 flex justify-between gap-2 font-bold">
            <span>Total</span>
            <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{formatCop(invoice.grand_total)}</span>
          </div>
        </div>

        <div className="mt-2 border-t border-dashed border-black pt-2 text-xs">
          <p>Pago: {paymentLabel(invoice.payment_method)}</p>
          {mixedPayment ? (
            <>
              <p>Detalle de pago:</p>
              <div className="flex justify-between gap-2">
                <span>{paymentLabel(mixedPayment.firstMethod)}</span>
                <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{formatCop(mixedPayment.firstAmount)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>{paymentLabel(mixedPayment.secondMethod)}</span>
                <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{formatCop(mixedPayment.secondAmount)}</span>
              </div>
            </>
          ) : null}
          {invoice.payment_method !== 'mixed' && invoice.payment_reference ? <p>Ref: {invoice.payment_reference}</p> : null}
        </div>

        <p className="mt-3 text-center text-xs">Gracias por su compra</p>
      </div>
    </div>
  )
}
