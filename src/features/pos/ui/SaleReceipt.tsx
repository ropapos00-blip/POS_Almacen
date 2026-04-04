import type { RefObject } from 'react'
import { formatCop } from '../../../shared/utils/currency'
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
  if (!data) {
    return null
  }

  return (
    <div className="sr-only">
      <div ref={receiptRef} className="w-75 bg-white p-4 text-black">
        <h1 className="text-center text-lg font-bold">POS Retail</h1>
        <p className="text-center text-xs">Ticket de venta</p>
        <p className="mt-3 text-xs">Venta: {data.saleNumber}</p>
        <p className="text-xs">Fecha: {data.soldAt}</p>
        <p className="text-xs">Cajero: {data.cashierName}</p>
        {data.customerName ? <p className="text-xs">Cliente: {data.customerName}</p> : null}

        <div className="mt-3 border-t border-dashed border-black pt-2">
          {data.items.map((item) => (
            <div key={item.variantId} className="mb-2 text-xs">
              <p>{item.name}</p>
              <p>
                {item.quantity} x {formatCop(item.unitPrice)} ={' '}
                {formatCop(item.quantity * item.unitPrice)}
              </p>
              <p>{item.sku}</p>
            </div>
          ))}
        </div>

        <div className="mt-2 border-t border-dashed border-black pt-2 text-xs">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatCop(data.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Descuento</span>
            <span>{formatCop(data.discount)}</span>
          </div>
          <div className="mt-1 flex justify-between font-bold">
            <span>Total</span>
            <span>{formatCop(data.total)}</span>
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
