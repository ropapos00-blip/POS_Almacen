import { useEffect, useMemo, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import { formatCop } from '../../../shared/utils/currency'
import {
  formatDateColombia,
  formatDateTimeColombia,
  getTodayIsoDateColombia,
} from '../../../shared/utils/dateTime'
import { useAuthStore } from '../../auth/model/useAuthStore'
import { useSalesQuery, useVoidSaleMutation } from '../model/useSalesQueries'
import type { SaleRow, SalesFilters } from '../model/sales.types'
import { SalesReceipt } from './SalesReceipt'

function statusBadge(status: string) {
  if (status === 'void') {
    return 'bg-rose-500/20 text-rose-300 border-rose-500/30'
  }
  return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
}

export function SalesPage() {
  const user = useAuthStore((state) => state.user)
  const today = getTodayIsoDateColombia()
  const isCashier = user?.role === 'cashier'
  const [saleToVoid, setSaleToVoid] = useState<SaleRow | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidFeedback, setVoidFeedback] = useState<string | null>(null)
  const [filters, setFilters] = useState<SalesFilters>({
    search: '',
    status: 'all',
    fromDate: today,
    toDate: today,
    viewerRole: user?.role,
  })
  const [selectedSale, setSelectedSale] = useState<SaleRow | null>(null)
  const receiptRef = useRef<HTMLDivElement>(null)

  const salesQuery = useSalesQuery(user?.storeId, filters)
  const voidSaleMutation = useVoidSaleMutation(user?.storeId)

  useEffect(() => {
    if (user?.role === 'cashier') {
      setFilters((prev) => ({
        ...prev,
        status: 'all',
        fromDate: today,
        toDate: today,
        viewerRole: 'cashier',
      }))
      return
    }

    setFilters((prev) => ({
      ...prev,
      viewerRole: user?.role,
    }))
  }, [today, user?.role])

  const totals = useMemo(() => {
    const rows = salesQuery.data ?? []
    return {
      count: rows.length,
      gross: rows.reduce((acc, row) => acc + row.grand_total, 0),
    }
  }, [salesQuery.data])

  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: selectedSale?.sale_number ?? 'ticket-venta',
    pageStyle: '@page { size: 56mm auto; margin: 0mm; } html, body { margin: 0 !important; padding: 0 !important; height: auto !important; min-height: 0 !important; background: white !important; }',
  })

  async function confirmVoidSale() {
    if (!saleToVoid || !user?.id) {
      return
    }

    const reason = voidReason.trim()
    if (reason.length < 3) {
      setVoidFeedback('Escribe un motivo de al menos 3 caracteres.')
      return
    }

    setVoidFeedback(null)
    try {
      await voidSaleMutation.mutateAsync({
        saleId: saleToVoid.id,
        actorUserId: user.id,
        reason,
      })
      setSaleToVoid(null)
      setVoidReason('')
    } catch {
      setVoidFeedback('No se pudo anular la venta. Intenta de nuevo.')
    }
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-100">Historial de ventas</h1>
        <p className="mt-2 text-zinc-400">
          {isCashier
            ? 'Vista de cierre de caja: solo ventas del dia.'
            : 'Consulta ventas por fecha, estado y cliente.'}
        </p>
      </header>

      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <input
            value={filters.search}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, search: event.target.value, viewerRole: user?.role }))
            }
            placeholder="Buscar venta o cliente"
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
          />
          {isCashier ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">
              Fecha fija: {formatDateColombia(new Date())}
            </div>
          ) : (
            <>
              <select
                value={filters.status}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    status: event.target.value as SalesFilters['status'],
                    viewerRole: user?.role,
                  }))
                }
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              >
                <option value="all">Todos</option>
                <option value="confirmed">Confirmadas</option>
                <option value="void">Anuladas</option>
              </select>
              <input
                type="date"
                value={filters.fromDate}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, fromDate: event.target.value, viewerRole: user?.role }))
                }
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={filters.toDate}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, toDate: event.target.value, viewerRole: user?.role }))
                }
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              />
            </>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
            <p className="text-xs text-zinc-500">Cantidad ventas</p>
            <p className="text-xl font-semibold text-zinc-100">{totals.count}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
            <p className="text-xs text-zinc-500">Total vendido</p>
            <p className="text-xl font-semibold text-emerald-300">{formatCop(totals.gross)}</p>
          </div>
        </div>
      </article>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
          <ul className="space-y-2">
            {(salesQuery.data ?? []).map((sale) => (
              <li
                key={sale.id}
                className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-zinc-200">{sale.sale_number}</p>
                    <p className="text-xs text-zinc-500">
                      {formatDateTimeColombia(sale.sold_at)} · {sale.customer_name ?? 'Cliente general'}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-1 text-xs ${statusBadge(sale.status)}`}
                  >
                    {sale.status}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-sm text-zinc-400">{sale.sale_items?.length ?? 0} items</p>
                  <p className="font-semibold text-emerald-300">{formatCop(sale.grand_total)}</p>
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedSale(sale)}
                    className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200"
                  >
                    Ver detalle
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSale(sale)
                      void handlePrint()
                    }}
                    className="rounded-md border border-amber-500/40 px-2 py-1 text-xs text-amber-300"
                  >
                    Reimprimir
                  </button>
                  {sale.status === 'confirmed' && (user?.role === 'admin' || user?.role === 'super_admin') ? (
                    <button
                      type="button"
                      onClick={() => {
                        setVoidFeedback(null)
                        setVoidReason('')
                        setSaleToVoid(sale)
                      }}
                      className="rounded-md border border-rose-500/40 px-2 py-1 text-xs text-rose-300"
                    >
                      Anular
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
          <h2 className="text-lg font-semibold text-zinc-100">Detalle</h2>
          {!selectedSale ? (
            <p className="mt-3 text-sm text-zinc-400">Selecciona una venta para ver su detalle.</p>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                <p className="text-sm font-semibold text-zinc-200">{selectedSale.sale_number}</p>
                <p className="text-xs text-zinc-500">{formatDateTimeColombia(selectedSale.sold_at)}</p>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                <p className="text-xs text-zinc-500">Items</p>
                <ul className="mt-2 space-y-1">
                  {(selectedSale.sale_items ?? []).map((item) => (
                    <li key={item.id} className="text-sm text-zinc-200">
                      {item.quantity} x {item.name_snapshot} ({item.sku_snapshot})
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-200">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatCop(selectedSale.subtotal)}</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span>Descuento</span>
                  <span>{formatCop(selectedSale.discount_total)}</span>
                </div>
                <div className="mt-1 flex justify-between font-semibold text-zinc-100">
                  <span>Total</span>
                  <span>{formatCop(selectedSale.grand_total)}</span>
                </div>
              </div>
            </div>
          )}
        </article>
      </div>

      {saleToVoid ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
            <h3 className="text-lg font-semibold text-zinc-100">Anular venta</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Vas a anular la venta {saleToVoid.sale_number}. Esta accion no se puede deshacer.
            </p>

            <label className="mt-4 block space-y-1">
              <span className="text-xs text-zinc-400">Motivo de anulacion</span>
              <textarea
                value={voidReason}
                onChange={(event) => setVoidReason(event.target.value)}
                rows={3}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                placeholder="Ej. cliente solicito cancelacion por error en items"
              />
            </label>

            {voidFeedback ? <p className="mt-3 text-sm text-amber-300">{voidFeedback}</p> : null}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setSaleToVoid(null)
                  setVoidReason('')
                  setVoidFeedback(null)
                }}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  void confirmVoidSale()
                }}
                disabled={voidSaleMutation.isPending}
                className="rounded-lg bg-rose-400 px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-70"
              >
                {voidSaleMutation.isPending ? 'Anulando...' : 'Confirmar anulacion'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <SalesReceipt sale={selectedSale} receiptRef={receiptRef} />
    </section>
  )
}
