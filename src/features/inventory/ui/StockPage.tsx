import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../../auth/model/useAuthStore'
import { formatCop } from '../../../shared/utils/currency'
import { useInventoryItemsQuery, useAdjustStockMutation } from '../model/useInventoryQueries'
import type { InventoryItemRow } from '../model/inventory.types'
export function StockPage() {
  const user = useAuthStore((s) => s.user)
  const storeId = user?.storeId
  const { data: items = [], isLoading } = useInventoryItemsQuery(storeId)
  const adjustMutation = useAdjustStockMutation(storeId, user?.id)

  const [barcode, setBarcode] = useState('')
  const [found, setFound] = useState<InventoryItemRow | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [qty, setQty] = useState(1)
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  const barcodeInputRef = useRef<HTMLInputElement>(null)

  // Auto-focus on mount
  useEffect(() => {
    barcodeInputRef.current?.focus()
  }, [])

  function search(value: string) {
    const trimmed = value.trim().toUpperCase()
    if (!trimmed) return
    const match = items.find(
      (it) => it.barcode.toUpperCase() === trimmed || it.reference.toUpperCase() === trimmed,
    )
    if (match) {
      setFound(match)
      setNotFound(false)
      setQty(1)
      setFeedback(null)
    } else {
      setFound(null)
      setNotFound(true)
    }
  }

  async function handleAdd() {
    if (!found || qty <= 0) return
    setFeedback(null)
    try {
      await adjustMutation.mutateAsync({
        stockId: found.stockId,
        variantId: found.variantId,
        currentQuantity: found.quantity,
        delta: qty,
        reason: `Entrada manual: +${qty}`,
      })
      const updated: InventoryItemRow = { ...found, quantity: found.quantity + qty }
      setFeedback({ type: 'ok', msg: `Stock actualizado: ${found.quantity} → ${found.quantity + qty}` })
      setFound(updated)
    } catch (e) {
      setFeedback({ type: 'err', msg: e instanceof Error ? e.message : 'Error al ajustar stock.' })
    }
  }

  function handleClear() {
    setBarcode('')
    setFound(null)
    setNotFound(false)
    setFeedback(null)
    setQty(1)
    barcodeInputRef.current?.focus()
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-zinc-100">Entrada de Stock</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Escanea o escribe el código de barras para agregar unidades al inventario.
        </p>
      </header>

      {/* Scanner input */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
        <label className="mb-2 block text-sm font-medium text-zinc-300">
          Código de barras / Referencia
        </label>
        <div className="flex gap-2">
          <input
            ref={barcodeInputRef}
            type="text"
            value={barcode}
            onChange={(e) => {
              setBarcode(e.target.value.toUpperCase())
              setNotFound(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                search(barcode)
              }
            }}
            placeholder="Escanea o escribe y presiona Enter"
            className="flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => search(barcode)}
            className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-amber-300"
          >
            Buscar
          </button>
          {(found || notFound) && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-xl border border-zinc-700 px-4 py-2.5 text-sm text-zinc-400 hover:bg-zinc-800"
            >
              Limpiar
            </button>
          )}
        </div>

        {isLoading && (
          <p className="mt-3 text-xs text-zinc-500">Cargando inventario…</p>
        )}

        {notFound && (
          <p className="mt-3 rounded-lg bg-rose-500/20 px-3 py-2 text-sm text-rose-300">
            No se encontró ningún producto con ese código.
          </p>
        )}
      </div>

      {/* Product card */}
      {found && (
        <div className="rounded-2xl border border-amber-500/30 bg-zinc-900/70 p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-amber-400">Producto encontrado</p>
              <h2 className="mt-1 text-xl font-semibold text-zinc-100">{found.description}</h2>
              <p className="mt-0.5 font-mono text-sm text-zinc-400">{found.reference}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-zinc-500">Precio venta</p>
              <p className="text-lg font-bold text-amber-300">{formatCop(found.salePrice)}</p>
              <p className="text-xs text-zinc-500">Costo: {formatCop(found.costPrice)}</p>
            </div>
          </div>

          {/* Stock counter */}
          <div className="flex flex-wrap items-center justify-center gap-4 rounded-xl border border-zinc-800 bg-zinc-950 px-5 py-4">
            <div className="text-center">
              <p className="text-xs text-zinc-500">Stock actual</p>
              <p className="text-3xl font-bold text-zinc-100">{found.quantity}</p>
            </div>
            <div className="text-2xl text-zinc-600">+</div>
            <div className="text-center">
              <p className="text-xs text-zinc-500">Agregar</p>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-24 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1 text-center text-2xl font-bold text-amber-300 focus:border-amber-400 focus:outline-none"
              />
            </div>
            <div className="text-2xl text-zinc-600">=</div>
            <div className="text-center">
              <p className="text-xs text-zinc-500">Nuevo total</p>
              <p className="text-3xl font-bold text-emerald-400">{found.quantity + qty}</p>
            </div>
          </div>

          {feedback && (
            <p
              className={`rounded-lg px-3 py-2 text-sm ${
                feedback.type === 'ok'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/20 text-rose-300'
              }`}
            >
              {feedback.msg}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              disabled={adjustMutation.isPending || qty <= 0}
              onClick={() => void handleAdd()}
              className="rounded-xl bg-amber-400 px-6 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-amber-300 disabled:opacity-50"
            >
              {adjustMutation.isPending ? 'Guardando…' : `Agregar ${qty}`}
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="rounded-xl border border-zinc-700 px-5 py-2.5 text-sm text-zinc-400 hover:bg-zinc-800"
            >
              Nuevo escaneo
            </button>
          </div>
        </div>
      )}

    </section>
  )
}
