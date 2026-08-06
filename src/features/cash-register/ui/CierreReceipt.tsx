import type { RefObject } from 'react'
import { formatCop } from '../../../shared/utils/currency'
import { useAuthStore } from '../../auth/model/useAuthStore'

const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  addi: 'Addi',
  credilondon: 'CREDILONDON',
  dataphone: 'Datáfono',
  bancolombia: 'Bancolombia',
  daviplata: 'Daviplata',
  nequi: 'Nequi',
}

export interface CierreReceiptData {
  sessionDate: string
  closedAt: string | null
  cashBase: number
  posByMethod: Record<string, number>
  posCash: number
  posCard: number
  posTransfer: number
  posTotal: number
  invoiceCash: number
  invoiceByMethod: Record<string, number>
  invoiceTotal: number
  layawayCash: number
  layawayCard: number
  layawayTransfer: number
  layawayByMethod: Record<string, number>
  layawayTotal: number
  expenses: number
  expectedCash: number
  cashCounted: number
  difference: number
  notesClose: string | null
  cashierName: string
}

export function CierreReceipt({
  receiptRef,
  data,
}: {
  receiptRef: RefObject<HTMLDivElement | null>
  data: CierreReceiptData | null
}) {
  const user = useAuthStore((state) => state.user)

  if (!data) return null

  const businessName = user?.storeReceipt?.legalName || user?.storeName || 'POS Retail'

  const diff = data.difference
  const diffLabel = diff > 0 ? `Sobrante ${formatCop(diff)}` : diff < 0 ? `Faltante ${formatCop(Math.abs(diff))}` : 'Cuadra exacto'

  return (
    <div className="sr-only">
      <div
        ref={receiptRef}
        className="text-black"
        style={{ width: '56mm', margin: 0, padding: '0 2mm 6mm 2mm', boxSizing: 'border-box', background: 'white' }}
      >
        {/* Encabezado tienda */}
        <h1
          className="text-center text-base font-bold uppercase tracking-[0.08em]"
          style={{ fontFamily: "'Dolce Vita', 'Space Grotesk', sans-serif" }}
        >
          {businessName}
        </h1>
        {user?.storeReceipt?.taxId ? <p className="text-center text-xs">NIT: {user.storeReceipt.taxId}</p> : null}
        {user?.storeReceipt?.address ? <p className="text-center text-xs">{user.storeReceipt.address}</p> : null}
        {user?.storeReceipt?.city ? <p className="text-center text-xs">{user.storeReceipt.city}</p> : null}

        <p className="my-1 border-t border-dashed border-black" />
        <p className="text-center text-xs font-semibold">CIERRE DE CAJA</p>
        <p className="mt-2 text-xs">Fecha: {data.sessionDate}</p>
        {data.closedAt ? <p className="text-xs">Hora cierre: {data.closedAt}</p> : null}
        <p className="text-xs">Cajero: {data.cashierName}</p>

        {/* Base */}
        <p className="my-1 border-t border-dashed border-black" />
        <p className="text-xs font-semibold">BASE APERTURA</p>
        <div className="flex justify-between text-xs">
          <span>Efectivo inicial</span>
          <span>{formatCop(data.cashBase)}</span>
        </div>

        {/* Ventas POS */}
        <p className="my-1 border-t border-dashed border-black" />
        <p className="text-xs font-semibold">VENTAS POS</p>
        {Object.entries(data.posByMethod).map(([method, amount]) =>
          amount > 0 ? (
            <div key={method} className="flex justify-between text-xs">
              <span>{METHOD_LABELS[method] ?? method}</span>
              <span>{formatCop(amount)}</span>
            </div>
          ) : null,
        )}
        <div className="flex justify-between text-xs font-bold">
          <span>Total POS</span>
          <span>{formatCop(data.posTotal)}</span>
        </div>

        {/* Facturas manuales */}
        <p className="my-1 border-t border-dashed border-black" />
        <p className="text-xs font-semibold">FACTURAS MANUALES</p>
        {data.invoiceCash > 0 && (
          <div className="flex justify-between text-xs">
            <span>Efectivo</span>
            <span>{formatCop(data.invoiceCash)}</span>
          </div>
        )}
        {Object.entries(data.invoiceByMethod).map(([method, amount]) => (
          <div key={method} className="flex justify-between text-xs">
            <span>{METHOD_LABELS[method] ?? method}</span>
            <span>{formatCop(amount)}</span>
          </div>
        ))}
        <div className="flex justify-between text-xs font-bold">
          <span>Total facturas</span>
          <span>{formatCop(data.invoiceTotal)}</span>
        </div>

        {/* Separados */}
        {data.layawayTotal > 0 && (
          <>
            <p className="my-1 border-t border-dashed border-black" />
            <p className="text-xs font-semibold">SEPARADOS</p>
            {data.layawayCash > 0 && (
              <div className="flex justify-between text-xs">
                <span>Efectivo</span>
                <span>{formatCop(data.layawayCash)}</span>
              </div>
            )}
            {data.layawayCard > 0 && (
              <div className="flex justify-between text-xs">
                <span>Tarjeta</span>
                <span>{formatCop(data.layawayCard)}</span>
              </div>
            )}
            {data.layawayTransfer > 0 && (
              <div className="flex justify-between text-xs">
                <span>Transferencia</span>
                <span>{formatCop(data.layawayTransfer)}</span>
              </div>
            )}
            {Object.entries(data.layawayByMethod).map(([method, amount]) =>
              amount > 0 ? (
                <div key={method} className="flex justify-between text-xs">
                  <span>{METHOD_LABELS[method] ?? method}</span>
                  <span>{formatCop(amount)}</span>
                </div>
              ) : null,
            )}
            <div className="flex justify-between text-xs font-bold">
              <span>Total separados</span>
              <span>{formatCop(data.layawayTotal)}</span>
            </div>
          </>
        )}

        {/* Gastos */}
        {data.expenses > 0 && (
          <>
            <p className="my-1 border-t border-dashed border-black" />
            <p className="text-xs font-semibold">GASTOS</p>
            <div className="flex justify-between text-xs">
              <span>Total gastos</span>
              <span>{formatCop(data.expenses)}</span>
            </div>
          </>
        )}

        {/* Cierre */}
        <p className="my-1 border-t border-dashed border-black" />
        <p className="text-xs font-semibold">RESULTADO</p>
        <div className="flex justify-between text-xs">
          <span>Efectivo esperado</span>
          <span>{formatCop(data.expectedCash)}</span>
        </div>
        {data.cashCounted > 0 && (
          <>
            <div className="flex justify-between text-xs">
              <span>Efectivo contado</span>
              <span>{formatCop(data.cashCounted)}</span>
            </div>
            <p className="my-1 border-t border-dashed border-black" />
            <div className="flex justify-between text-xs font-bold">
              <span>{diff >= 0 ? 'Sobrante' : 'Faltante'}</span>
              <span>{diffLabel}</span>
            </div>
          </>
        )}

        {data.notesClose ? (
          <>
            <p className="my-1 border-t border-dashed border-black" />
            <p className="text-xs">Notas: {data.notesClose}</p>
          </>
        ) : null}

        <p className="my-1 border-t border-dashed border-black" />
        <p className="text-center text-xs">— Cierre registrado —</p>
      </div>
    </div>
  )
}
