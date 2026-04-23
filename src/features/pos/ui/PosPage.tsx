import { useMemo, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import { formatCop } from '../../../shared/utils/currency'
import { formatDateTimeColombia } from '../../../shared/utils/dateTime'
import { formatCopInput, parseCopIntegerInput, parseIntegerInput } from '../../../shared/utils/numberInput'
import { useAuthStore } from '../../auth/model/useAuthStore'
import { useCreatePosSaleMutation, usePosVariantsQuery } from '../model/usePosQueries'
import type { PaymentMethod, PosCartItem } from '../model/pos.types'
import { authorizeDiscountOverride } from '../services/posService'
import { SaleReceipt } from './SaleReceipt'

function getStock(row: { quantity_on_hand: number }[] | null) {
  return row?.[0]?.quantity_on_hand ?? 0
}

function getProductName(row: Array<{ name: string }> | null) {
  return row?.[0]?.name ?? 'Producto'
}

export function PosPage() {
  const user = useAuthStore((state) => state.user)
  const [query, setQuery] = useState('')
  const [discount, setDiscount] = useState(0)
  const [customerName, setCustomerName] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [paymentReference, setPaymentReference] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [authorizationFeedback, setAuthorizationFeedback] = useState<string | null>(null)
  const [authorizationModalOpen, setAuthorizationModalOpen] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [isAuthorizingDiscount, setIsAuthorizingDiscount] = useState(false)
  const [discountAuthorizedBy, setDiscountAuthorizedBy] = useState<string | null>(null)
  const [authorizedDiscountValue, setAuthorizedDiscountValue] = useState(0)
  const [cart, setCart] = useState<PosCartItem[]>([])
  const [lastSale, setLastSale] = useState<{
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
  } | null>(null)
  const receiptRef = useRef<HTMLDivElement>(null)

  const variantsQuery = usePosVariantsQuery(user?.storeId)
  const saleMutation = useCreatePosSaleMutation(user?.storeId)
  const handlePrintTicket = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: lastSale?.saleNumber ?? 'ticket-pos',
    pageStyle: '@page { size: 56mm auto; margin: 0mm; } html, body { margin: 0 !important; padding: 0 !important; height: auto !important; min-height: 0 !important; background: white !important; }',
  })

  const filtered = useMemo(() => {
    const source = variantsQuery.data ?? []
    const text = query.trim().toLowerCase()

    if (!text) {
      return source
    }

    return source.filter((row) => {
      const name = getProductName(row.products).toLowerCase()
      return name.includes(text) || row.sku.toLowerCase().includes(text) || row.barcode.toLowerCase().includes(text)
    })
  }, [variantsQuery.data, query])

  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0)
  }, [cart])

  const totalCost = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.costPrice * item.quantity, 0)
  }, [cart])

  const maxAllowedDiscount = useMemo(() => {
    return Math.max(0, Number((subtotal - totalCost).toFixed(2)))
  }, [subtotal, totalCost])

  const total = useMemo(() => {
    return Math.max(0, subtotal - discount)
  }, [subtotal, discount])

  const needsDiscountAuthorization = user?.role === 'cashier' && discount > 0

  const hasValidDiscountAuthorization =
    !needsDiscountAuthorization ||
    (Boolean(discountAuthorizedBy) && discount <= authorizedDiscountValue)

  function addToCart(item: PosCartItem) {
    setCart((prev) => {
      const exists = prev.find((entry) => entry.variantId === item.variantId)
      if (!exists) {
        return [...prev, item]
      }

      return prev.map((entry) => {
        if (entry.variantId !== item.variantId) {
          return entry
        }

        const nextQty = Math.min(entry.stockAvailable, entry.quantity + 1)
        return { ...entry, quantity: nextQty }
      })
    })
  }

  function updateCartQty(variantId: string, qty: number) {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.variantId !== variantId) {
            return item
          }
          return {
            ...item,
            quantity: Math.max(1, Math.min(item.stockAvailable, qty)),
          }
        })
        .filter((item) => item.quantity > 0),
    )
  }

  async function confirmSale() {
    setFeedback(null)

    if (!user?.storeId || !user.id) {
      setFeedback('Usuario sin tienda activa.')
      return
    }

    if (cart.length === 0) {
      setFeedback('Agrega items al carrito antes de confirmar.')
      return
    }

    if (discount > maxAllowedDiscount) {
      setFeedback(`Descuento invalido. Maximo permitido: ${formatCop(maxAllowedDiscount)}.`)
      return
    }

    if (!hasValidDiscountAuthorization) {
      setFeedback('El descuento requiere autorizacion de admin/super admin.')
      setAuthorizationModalOpen(true)
      return
    }

    try {
      const result = await saleMutation.mutateAsync({
        storeId: user.storeId,
        soldBy: user.id,
        discountTotal: Number(discount.toFixed(2)),
        customerName,
        paymentMethod,
        paymentReference,
        items: cart.map((item) => ({
          variant_id: item.variantId,
          quantity: item.quantity,
        })),
      })

      setFeedback(`Venta confirmada: ${result.saleNumber}`)
      setLastSale({
        saleNumber: result.saleNumber,
          soldAt: formatDateTimeColombia(new Date()),
        cashierName: user.fullName,
        customerName: customerName.trim(),
        paymentMethod,
        paymentReference: paymentReference.trim(),
        subtotal,
        discount,
        total,
        items: cart,
      })
      setCart([])
      setCustomerName('')
      setDiscount(0)
      setDiscountAuthorizedBy(null)
      setAuthorizedDiscountValue(0)
      setPaymentReference('')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No se pudo confirmar la venta.')
    }
  }

  async function authorizeDiscount() {
    if (!user?.storeId) {
      setAuthorizationFeedback('No hay tienda activa.')
      return
    }

    setIsAuthorizingDiscount(true)
    setAuthorizationFeedback(null)

    try {
      const result = await authorizeDiscountOverride(user.storeId, adminEmail, adminPassword, discount)
      setDiscountAuthorizedBy(result.adminName)
      setAuthorizedDiscountValue(discount)
      setAuthorizationFeedback(`Descuento autorizado por ${result.adminName}.`)
      setAdminPassword('')
      setAuthorizationModalOpen(false)
      setFeedback(`Descuento autorizado por ${result.adminName}.`)
    } catch (error) {
      setAuthorizationFeedback(
        error instanceof Error ? error.message : 'No se pudo autorizar el descuento.',
      )
    } finally {
      setIsAuthorizingDiscount(false)
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <h1 className="text-2xl font-semibold text-zinc-100">POS</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Busqueda por nombre, SKU o codigo de barras.
        </p>

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nombre, SKU o barcode"
          className="mt-6 w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-200"
        />

        <div className="mt-4 space-y-3">
          {filtered.map((item) => {
            const stock = getStock(item.inventory_stock)
            return (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-zinc-800 px-3 py-2"
              >
                <div>
                  <p className="font-medium text-zinc-200">{getProductName(item.products)}</p>
                  <p className="text-xs text-zinc-500">
                    {item.sku} · {item.size} · {item.color}
                  </p>
                  <p className="text-xs text-zinc-500">Stock: {stock}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-emerald-300">{formatCop(item.sale_price)}</p>
                  <button
                    type="button"
                    disabled={stock <= 0}
                    onClick={() => {
                      addToCart({
                        variantId: item.id,
                        sku: item.sku,
                        name: getProductName(item.products),
                        size: item.size,
                        color: item.color,
                        costPrice: Number(item.cost_price),
                        unitPrice: Number(item.sale_price),
                        stockAvailable: stock,
                        quantity: 1,
                      })
                    }}
                    className="mt-2 rounded-lg bg-amber-400 px-2 py-1 text-xs font-semibold text-zinc-900 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                  >
                    Agregar
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </article>

      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <h2 className="text-xl font-semibold text-zinc-100">Carrito</h2>
        <p className="mt-2 text-sm text-zinc-400">{cart.length} articulos</p>

        <div className="mt-4 space-y-2">
          {cart.map((item) => (
            <div key={item.variantId} className="rounded-lg border border-zinc-800 px-3 py-2">
              <p className="text-sm font-medium text-zinc-200">{item.name}</p>
              <p className="text-xs text-zinc-500">{item.sku}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={item.stockAvailable}
                  value={item.quantity}
                  onChange={(event) =>
                    updateCartQty(item.variantId, parseIntegerInput(event.target.value, 1))
                  }
                  className="w-20 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
                />
                <p className="text-sm font-semibold text-emerald-300">
                  {formatCop(item.unitPrice * item.quantity)}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 space-y-2 text-sm text-zinc-300">
          <label className="block space-y-1">
            <span className="text-xs text-zinc-400">Cliente (opcional)</span>
            <input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-zinc-400">Descuento</span>
            <input
              type="text"
              inputMode="numeric"
              min={0}
              value={discount === 0 ? '' : formatCopInput(discount)}
              placeholder="0"
              onChange={(event) => {
                const nextDiscount = parseCopIntegerInput(event.target.value, 0)
                setDiscount(nextDiscount)
                if (nextDiscount <= 0) {
                  setDiscountAuthorizedBy(null)
                  setAuthorizedDiscountValue(0)
                }
              }}
              max={maxAllowedDiscount}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2"
            />
            <span className="text-xs text-zinc-500">
              Maximo permitido por costo: {formatCop(maxAllowedDiscount)}
            </span>
          </label>

          {needsDiscountAuthorization ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
              {hasValidDiscountAuthorization
                ? `Descuento autorizado por ${discountAuthorizedBy}.`
                : 'Este descuento necesita autorizacion de admin/super admin.'}
              <button
                type="button"
                onClick={() => setAuthorizationModalOpen(true)}
                className="ml-2 rounded border border-amber-500/40 px-2 py-1 font-semibold text-amber-200 hover:bg-amber-500/20"
              >
                Autorizar descuento
              </button>
            </div>
          ) : null}

          <label className="block space-y-1">
            <span className="text-xs text-zinc-400">Metodo de pago</span>
            <select
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2"
            >
              <option value="cash">Efectivo</option>
              <option value="card">Tarjeta</option>
              <option value="transfer">Transferencia</option>
              <option value="mixed">Mixto</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-zinc-400">Referencia pago</span>
            <input
              value={paymentReference}
              onChange={(event) => setPaymentReference(event.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2"
            />
          </label>

          <div className="mt-3 border-t border-zinc-800 pt-3">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCop(subtotal)}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>Descuento</span>
              <span>{formatCop(discount)}</span>
            </div>
            <div className="mt-2 flex justify-between text-base font-semibold text-zinc-100">
              <span>Total</span>
              <span>{formatCop(total)}</span>
            </div>
          </div>
        </div>

        {feedback ? <p className="mt-3 text-sm text-amber-300">{feedback}</p> : null}

        <button
          type="button"
          disabled={saleMutation.isPending || !hasValidDiscountAuthorization}
          onClick={() => {
            void confirmSale()
          }}
          className="mt-6 w-full rounded-xl bg-amber-400 px-4 py-3 font-semibold text-zinc-900 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          {saleMutation.isPending ? 'Procesando...' : 'Confirmar venta'}
        </button>

        <button
          type="button"
          disabled={!lastSale}
          onClick={() => {
            void handlePrintTicket()
          }}
          className="mt-2 w-full rounded-xl border border-zinc-700 px-4 py-3 font-semibold text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Imprimir ticket
        </button>
      </article>

      <SaleReceipt receiptRef={receiptRef} data={lastSale} />

      {authorizationModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
            <h3 className="text-lg font-semibold text-zinc-100">Autorizar descuento</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Un admin o super admin debe autorizar este descuento con su clave.
            </p>

            <label className="mt-4 block space-y-1">
              <span className="text-xs text-zinc-400">Correo admin</span>
              <input
                type="email"
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              />
            </label>

            <label className="mt-3 block space-y-1">
              <span className="text-xs text-zinc-400">Clave admin</span>
              <input
                type="password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              />
            </label>

            {authorizationFeedback ? (
              <p className="mt-3 text-sm text-amber-300">{authorizationFeedback}</p>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAuthorizationModalOpen(false)}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  void authorizeDiscount()
                }}
                disabled={isAuthorizingDiscount}
                className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-70"
              >
                {isAuthorizingDiscount ? 'Validando...' : 'Autorizar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
