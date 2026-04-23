import type { RefObject } from 'react'
import { formatCop } from '../../../shared/utils/currency'
import { useAuthStore } from '../../auth/model/useAuthStore'
import type { PaymentMethod, PosCartItem } from '../model/pos.types'

interface SaleReceiptData {
  saleNumber: string
  soldAt: string
  cashierName: string
  customerName: string
  paymentMethod: PaymentMethod
  paymentReference: string
  subtotal: number
  discount: number
  total: number
  items: PosCartItem[]
}

function paymentLabel(method: PaymentMethod) {
  if (method === 'cash') return 'Efectivo'
  if (method === 'card') return 'Tarjeta'
  if (method === 'transfer') return 'Transferencia'
  return 'Mixto'
}

export function SaleReceipt({
  receiptRef,
  data,
}: {
  receiptRef: RefObject<HTMLDivElement | null>
  data: SaleReceiptData | null
}) {
  const user = useAuthStore((state) => state.user)

  if (!data) {
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
      <div ref={receiptRef} className="bg-white text-black" style={{ width: '54mm', padding: '2mm 3mm', boxSizing: 'border-box' }}>
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
        <p className="text-center text-xs">Ticket de venta</p>
        <p className="mt-3 text-xs">Venta: {data.saleNumber}</p>
        <p className="text-xs">Fecha: {data.soldAt}</p>
        <p className="text-xs">Cajero: {data.cashierName}</p>
        {data.customerName ? <p className="text-xs">Cliente: {data.customerName}</p> : null}

        <div className="mt-3 border-t border-dashed border-black pt-2">
          {data.items.map((item) => (
            <div key={item.variantId} className="mb-2 text-xs">
              <p>{item.name}</p>
              <div className="flex justify-between gap-1">
                <span className="text-zinc-500">{item.quantity} x {formatCop(item.unitPrice)}</span>
                <span className="font-medium" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{formatCop(item.quantity * item.unitPrice)}</span>
              </div>
              <p className="text-zinc-400">{item.sku}</p>
            </div>
          ))}
        </div>

        <div className="mt-2 border-t border-dashed border-black pt-2 text-xs">
          <div className="flex justify-between gap-2">
            <span>Subtotal</span>
            <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{formatCop(data.subtotal)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span>Descuento</span>
            <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{formatCop(data.discount)}</span>
          </div>
          <div className="mt-1 flex justify-between gap-2 font-bold">
            <span>Total</span>
            <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{formatCop(data.total)}</span>
          </div>
        </div>

        <div className="mt-2 border-t border-dashed border-black pt-2 text-xs">
          <p>Pago: {paymentLabel(data.paymentMethod)}</p>
          {data.paymentReference ? <p>Ref: {data.paymentReference}</p> : null}
        </div>

        <p className="mt-3 text-center text-xs">Gracias por su compra</p>
      </div>
    </div>
  )
}
