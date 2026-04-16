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
      return 'CREDILONDON'
    case 'dataphone':
      return 'Datáfono'
    case 'bancolombia':
      return 'Bancolombia'
    case 'daviplata':
      return 'Daviplata'
    case 'nequi':
      return 'Nequi'
    default:
      return method
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

  return (
    <div className="sr-only">
      <div ref={receiptRef} className="w-75 bg-white p-4 text-black">
        <h1
          className="store-logo-font text-center text-xl font-bold uppercase tracking-[0.08em]"
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
              <p>
                {item.quantity} x {formatCop(item.unit_price)} = {formatCop(item.line_total)}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-2 border-t border-dashed border-black pt-2 text-xs">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatCop(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Descuento</span>
            <span>{formatCop(invoice.discount_total)}</span>
          </div>
          <div className="mt-1 flex justify-between font-bold">
            <span>Total</span>
            <span>{formatCop(invoice.grand_total)}</span>
          </div>
        </div>

        <div className="mt-2 border-t border-dashed border-black pt-2 text-xs">
          <p>Pago: {paymentLabel(invoice.payment_method)}</p>
          {invoice.payment_reference ? <p>Ref: {invoice.payment_reference}</p> : null}
        </div>

        <p className="mt-3 text-center text-xs">Gracias por su compra</p>
      </div>
    </div>
  )
}
