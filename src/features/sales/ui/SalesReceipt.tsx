import type { RefObject } from 'react'
import { formatCop } from '../../../shared/utils/currency'
import { useAuthStore } from '../../auth/model/useAuthStore'
import type { SaleRow } from '../model/sales.types'

function paymentLabel(method: string) {
  if (method === 'cash') return 'Efectivo'
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
        {hasBusinessDetails ? <p className="my-1 border-t border-dashed border-black" /> : null}
        <p className="text-center text-xs">Reimpresion de ticket</p>
        <p className="mt-3 text-xs">Venta: {sale.sale_number}</p>
        <p className="text-xs">Fecha: {new Date(sale.sold_at).toLocaleString()}</p>
        {sale.customer_name ? <p className="text-xs">Cliente: {sale.customer_name}</p> : null}

        <div className="mt-3 border-t border-dashed border-black pt-2">
          {(sale.sale_items ?? []).map((item) => (
            <div key={item.id} className="mb-2 text-xs">
              <p>{item.name_snapshot}</p>
              <p>
                {item.quantity} x {formatCop(item.unit_price)} = {formatCop(item.line_total)}
              </p>
              <p>{item.sku_snapshot}</p>
            </div>
          ))}
        </div>

        <div className="mt-2 border-t border-dashed border-black pt-2 text-xs">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatCop(sale.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Descuento</span>
            <span>{formatCop(sale.discount_total)}</span>
          </div>
          <div className="mt-1 flex justify-between font-bold">
            <span>Total</span>
            <span>{formatCop(sale.grand_total)}</span>
          </div>
        </div>

        <div className="mt-2 border-t border-dashed border-black pt-2 text-xs">
          {(sale.sale_payments ?? []).map((payment) => (
            <p key={payment.id}>
              {paymentLabel(payment.method)}: {formatCop(payment.amount)}
            </p>
          ))}
        </div>

        <p className="mt-3 text-center text-xs">Gracias por su compra</p>
      </div>
    </div>
  )
}
