import type { RefObject } from 'react'
import { formatCop } from '../../../shared/utils/currency'
import { formatDateTimeColombia } from '../../../shared/utils/dateTime'
import { useAuthStore } from '../../auth/model/useAuthStore'
import type { SaleRow } from '../model/sales.types'

function paymentLabel(method: string) {
  if (method === 'cash') return 'Efectivo'
  if (method === 'addi') return 'Addi'
  if (method === 'credilondon') return 'Crédito London'
  if (method === 'dataphone') return 'Datáfono'
  if (method === 'bancolombia') return 'Bancolombia'
  if (method === 'daviplata') return 'Daviplata'
  if (method === 'nequi') return 'Nequi'
  if (method === 'card') return 'Tarjeta'
  if (method === 'transfer') return 'Transferencia'
  return 'Mixto'
}

export function SalesReceipt({
  sale,
  receiptRef,
}: {
  sale: SaleRow | null
  receiptRef: RefObject<HTMLDivElement | null>
}) {
  const user = useAuthStore((state) => state.user)

  if (!sale) {
    return null
  }

  const businessName = user?.storeReceipt.legalName || user?.storeName || 'POS Retail'
  const hasBusinessDetails = Boolean(
    user?.storeReceipt.taxId ||
      user?.storeReceipt.taxRegime ||
      user?.storeReceipt.address ||
      user?.storeReceipt.city ||
      user?.storeReceipt.phone,
  )

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
        {hasBusinessDetails ? <p className="my-1 border-t border-dashed border-black" /> : null}
        <p className="text-center text-xs">Reimpresion de ticket</p>
        <p className="mt-3 text-xs">Venta: {sale.sale_number}</p>
        <p className="text-xs">Fecha: {formatDateTimeColombia(sale.sold_at)}</p>
        {sale.customer_name ? <p className="text-xs">Cliente: {sale.customer_name}</p> : null}

        <div className="mt-3 border-t border-dashed border-black pt-2">
          {(sale.sale_items ?? []).map((item) => (
            <div key={item.id} className="mb-2 text-xs">
              <p>{item.name_snapshot}</p>
              <div className="flex justify-between gap-1">
                <span className="text-zinc-500">{item.quantity} x {formatCop(item.unit_price)}</span>
                <span className="font-medium" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{formatCop(item.line_total)}</span>
              </div>
              {Number(item.discount_amount ?? 0) > 0 ? (
                <div className="flex justify-between gap-1">
                  <span>Descuento</span>
                  <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{`-${formatCop(Number(item.discount_amount ?? 0))}`}</span>
                </div>
              ) : null}
              <p className="text-zinc-400">{item.sku_snapshot}</p>
            </div>
          ))}
        </div>

        <div className="mt-2 border-t border-dashed border-black pt-2 text-xs">
          <div className="flex justify-between gap-2">
            <span>Subtotal</span>
            <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{formatCop(sale.subtotal)}</span>
          </div>
          {Number(sale.discount_total ?? 0) > 0 ? (
            <div className="flex justify-between gap-2">
              <span>Descuento</span>
              <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{formatCop(sale.discount_total)}</span>
            </div>
          ) : null}
          <div className="mt-1 flex justify-between gap-2 font-bold">
            <span>Total</span>
            <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{formatCop(sale.grand_total)}</span>
          </div>
        </div>

        <div className="mt-2 border-t border-dashed border-black pt-2 text-xs">
          {(sale.sale_payments ?? []).map((payment) => (
            <div key={payment.id} className="flex justify-between gap-2">
              <span>{paymentLabel(payment.method)}</span>
              <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{formatCop(payment.amount)}</span>
            </div>
          ))}
        </div>

        <p className="mt-3 text-center text-xs">Gracias por su compra</p>
      </div>
    </div>
  )
}
