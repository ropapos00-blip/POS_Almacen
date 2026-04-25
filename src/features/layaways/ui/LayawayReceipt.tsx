import type { RefObject } from 'react'
import { formatCop } from '../../../shared/utils/currency'
import { useAuthStore } from '../../auth/model/useAuthStore'

export interface LayawayReceiptData {
  customerName: string
  customerPhone: string | null
  startDate: string
  dueDate: string
  items: Array<{ description: string; quantity: number; unitPrice: number }>
  totalAmount: number
  paymentAmount: number
  previouslyPaid: number
  remainingBalance: number
  paymentMethod: string
  paidAt: string
}

function paymentLabel(method: string) {
  switch (method) {
    case 'cash': return 'Efectivo'
    case 'dataphone': return 'Datáfono'
    case 'bancolombia': return 'Bancolombia'
    case 'daviplata': return 'Daviplata'
    case 'nequi': return 'Nequi'
    default: return method
  }
}

function formatDueDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year!, month! - 1, day!).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

export function LayawayReceipt({
  receiptRef,
  data,
}: {
  receiptRef: RefObject<HTMLDivElement | null>
  data: LayawayReceiptData | null
}) {
  const user = useAuthStore((state) => state.user)

  if (!data) return null

  const businessName = user?.storeReceipt?.legalName || user?.storeName || 'POS Retail'
  const hasDetails = Boolean(
    user?.storeReceipt?.taxId ||
    user?.storeReceipt?.taxRegime ||
    user?.storeReceipt?.address ||
    user?.storeReceipt?.city ||
    user?.storeReceipt?.phone,
  )

  return (
    <div className="sr-only">
      <div
        ref={receiptRef}
        className="text-black"
        style={{ width: '56mm', margin: 0, padding: '0 2mm 4mm 2mm', boxSizing: 'border-box', background: 'white' }}
      >
        <h1
          className="store-logo-font text-center text-base font-bold uppercase tracking-[0.08em]"
          style={{ fontFamily: "'Dolce Vita', 'Space Grotesk', sans-serif" }}
        >
          {businessName}
        </h1>
        {user?.storeReceipt?.taxId ? <p className="text-center text-xs">NIT: {user.storeReceipt.taxId}</p> : null}
        {user?.storeReceipt?.taxRegime ? <p className="text-center text-xs">{user.storeReceipt.taxRegime}</p> : null}
        {user?.storeReceipt?.address ? <p className="text-center text-xs">{user.storeReceipt.address}</p> : null}
        {user?.storeReceipt?.city ? <p className="text-center text-xs">{user.storeReceipt.city}</p> : null}
        {user?.storeReceipt?.phone ? <p className="text-center text-xs">{user.storeReceipt.phone}</p> : null}
        {hasDetails ? <p className="my-1 border-t border-dashed border-black" /> : null}

        <p className="text-center text-sm font-bold">RECIBO DE ABONO</p>
        <p className="text-center text-xs">SEPARADO</p>
        <p className="my-1 border-t border-dashed border-black" />

        <p className="text-xs">Fecha: {data.paidAt}</p>
        {user?.fullName ? <p className="text-xs">Cajero: {user.fullName}</p> : null}
        <p className="my-1 border-t border-dashed border-black" />

        <p className="text-xs font-semibold">Cliente: {data.customerName}</p>
        {data.customerPhone ? <p className="text-xs">Tel: {data.customerPhone}</p> : null}

        <div className="mt-2 border-t border-dashed border-black pt-2">
          <p className="mb-1 text-xs font-semibold">Artículos separados:</p>
          {data.items.map((item, i) => (
            <div key={i} className="mb-1 text-xs">
              <p>{item.description}</p>
              <div className="flex justify-between gap-1">
                <span>{item.quantity} x {formatCop(item.unitPrice)}</span>
                <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{formatCop(item.quantity * item.unitPrice)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 border-t border-dashed border-black pt-2 text-xs">
          <div className="flex justify-between gap-2">
            <span>Total separado</span>
            <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{formatCop(data.totalAmount)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span>Abonos previos</span>
            <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{formatCop(data.previouslyPaid)}</span>
          </div>
          <div className="mt-1 flex justify-between gap-2 font-bold">
            <span>Este abono</span>
            <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{formatCop(data.paymentAmount)}</span>
          </div>
          <div className="flex justify-between gap-2 font-bold">
            <span>Saldo pendiente</span>
            <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{formatCop(data.remainingBalance)}</span>
          </div>
        </div>

        <div className="mt-2 border-t border-dashed border-black pt-2 text-xs">
          <p>Pago: {paymentLabel(data.paymentMethod)}</p>
          <p className="mt-1">Inicio: {formatDueDate(data.startDate)}</p>
          <p className="font-semibold">Vence: {formatDueDate(data.dueDate)}</p>
        </div>

        <p className="mt-3 border-t border-dashed border-black pt-2 text-center text-xs">
          Gracias por su preferencia
        </p>
      </div>
    </div>
  )
}
