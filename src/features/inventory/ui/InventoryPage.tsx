import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useAuthStore } from '../../auth/model/useAuthStore'
import { stockAdjustmentSchema } from '../model/inventory.schemas'
import { useAdjustStockMutation, useInventoryStockQuery } from '../model/useInventoryQueries'
import type { StockAdjustmentInput } from '../model/inventory.types'

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Operacion no completada.'
}

export function InventoryPage() {
  const user = useAuthStore((state) => state.user)
  const [feedback, setFeedback] = useState<string | null>(null)

  const stockQuery = useInventoryStockQuery(user?.storeId)
  const adjustMutation = useAdjustStockMutation(user?.storeId, user?.id)

  const form = useForm<StockAdjustmentInput>({
    resolver: zodResolver(stockAdjustmentSchema),
    defaultValues: {
      stockId: '',
      variantId: '',
      currentQuantity: 0,
      delta: 0,
      reason: '',
    },
  })

  const selectedStockId = useWatch({
    control: form.control,
    name: 'stockId',
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setFeedback(null)
    try {
      await adjustMutation.mutateAsync(values)
      setFeedback('Ajuste registrado y movimiento guardado.')
      form.reset({ stockId: '', variantId: '', currentQuantity: 0, delta: 0, reason: '' })
    } catch (error) {
      setFeedback(getErrorMessage(error))
    }
  })

  if (!user?.storeId) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <h1 className="text-2xl font-semibold text-zinc-100">Inventario</h1>
        <p className="mt-2 text-zinc-400">No hay tienda activa asociada al usuario.</p>
      </section>
    )
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-100">Inventario</h1>
        <p className="mt-2 text-zinc-400">
          Control de stock por variante con trazabilidad de ajustes.
        </p>
        {feedback ? <p className="mt-2 text-sm text-amber-300">{feedback}</p> : null}
      </header>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
          <h2 className="text-lg font-semibold text-zinc-100">Stock por variante</h2>
          <ul className="mt-4 space-y-2">
            {(stockQuery.data ?? []).map((row) => {
              const productName = row.product_variants?.products?.name ?? 'Producto'
              const selected = selectedStockId === row.id
              return (
                <li
                  key={row.id}
                  className={`rounded-xl border px-3 py-3 ${
                    selected
                      ? 'border-amber-400 bg-amber-400/10'
                      : 'border-zinc-800 bg-zinc-950/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-zinc-200">{productName}</p>
                      <p className="text-xs text-zinc-500">
                        SKU: {row.product_variants?.sku} · {row.product_variants?.size} ·{' '}
                        {row.product_variants?.color}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-zinc-500">Stock actual</p>
                      <p className="text-lg font-semibold text-emerald-300">
                        {row.quantity_on_hand}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="mt-3 rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                    onClick={() => {
                      form.reset({
                        stockId: row.id,
                        variantId: row.variant_id,
                        currentQuantity: row.quantity_on_hand,
                        delta: 0,
                        reason: '',
                      })
                    }}
                  >
                    Ajustar este stock
                  </button>
                </li>
              )
            })}
          </ul>
        </article>

        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
          <h2 className="text-lg font-semibold text-zinc-100">Ajuste manual</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Usa positivo para ingreso y negativo para salida.
          </p>

          <form className="mt-4 space-y-3" onSubmit={onSubmit}>
            <input type="hidden" {...form.register('stockId')} />
            <input type="hidden" {...form.register('variantId')} />
            <input type="hidden" {...form.register('currentQuantity', { valueAsNumber: true })} />

            <label className="block space-y-1">
              <span className="text-xs text-zinc-400">Delta</span>
              <input
                type="number"
                {...form.register('delta', { valueAsNumber: true })}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs text-zinc-400">Motivo</span>
              <textarea
                {...form.register('reason')}
                className="min-h-20 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
              />
            </label>

            {form.formState.errors.delta ? (
              <p className="text-xs text-rose-400">{form.formState.errors.delta.message}</p>
            ) : null}
            {form.formState.errors.reason ? (
              <p className="text-xs text-rose-400">{form.formState.errors.reason.message}</p>
            ) : null}
            {form.formState.errors.stockId ? (
              <p className="text-xs text-rose-400">Selecciona primero una variante.</p>
            ) : null}

            <button
              type="submit"
              disabled={adjustMutation.isPending}
              className="w-full rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-900 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {adjustMutation.isPending ? 'Guardando...' : 'Guardar ajuste'}
            </button>
          </form>
        </article>
      </div>
    </section>
  )
}
