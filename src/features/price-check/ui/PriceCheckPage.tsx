import { useMemo, useState } from 'react'
import { formatCop } from '../../../shared/utils/currency'
import { useAuthStore } from '../../auth/model/useAuthStore'
import { usePriceCheckVariantsQuery } from '../model/usePriceCheckQueries'

function getStock(row: { quantity_on_hand: number }[] | null) {
  return row?.[0]?.quantity_on_hand ?? 0
}

function getProductName(row: Array<{ name: string }> | null) {
  return row?.[0]?.name ?? 'Producto'
}

export function PriceCheckPage() {
  const user = useAuthStore((state) => state.user)
  const [query, setQuery] = useState('')
  const variantsQuery = usePriceCheckVariantsQuery(user?.storeId)

  const filtered = useMemo(() => {
    const source = variantsQuery.data ?? []
    const text = query.trim().toLowerCase()

    if (!text) {
      return source
    }

    return source.filter((row) => {
      const name = getProductName(row.products).toLowerCase()
      return (
        name.includes(text) ||
        row.sku.toLowerCase().includes(text) ||
        row.barcode.toLowerCase().includes(text)
      )
    })
  }, [query, variantsQuery.data])

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-100">Consulta de productos</h1>
        <p className="mt-2 text-zinc-400">
          Consulta precio y existencia sin agregar al carrito.
        </p>
      </header>

      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nombre, SKU o codigo de barras"
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-200"
        />

        <div className="mt-4 space-y-3">
          {filtered.map((item) => {
            const stock = getStock(item.inventory_stock)
            return (
              <div
                key={item.id}
                className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-zinc-200">{getProductName(item.products)}</p>
                    <p className="text-xs text-zinc-500">
                      {item.sku} · {item.size} · {item.color}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">Codigo: {item.barcode}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-zinc-500">Precio</p>
                    <p className="font-semibold text-emerald-300">{formatCop(item.sale_price)}</p>
                    <p className="mt-1 text-xs text-zinc-400">Stock: {stock}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {variantsQuery.isLoading ? (
          <p className="mt-4 text-sm text-zinc-500">Cargando productos...</p>
        ) : null}
        {variantsQuery.error ? (
          <p className="mt-4 text-sm text-rose-400">No se pudieron cargar los productos.</p>
        ) : null}
      </article>
    </section>
  )
}
