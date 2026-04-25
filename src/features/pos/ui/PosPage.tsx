import { useEffect, useMemo, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import { formatCop } from '../../../shared/utils/currency'
import { formatDateTimeColombia } from '../../../shared/utils/dateTime'
import { formatCopInput, parseCopIntegerInput, parseIntegerInput } from '../../../shared/utils/numberInput'
import { useAuthStore } from '../../auth/model/useAuthStore'
import { useCreatePosSaleMutation, usePosVariantsQuery } from '../model/usePosQueries'
import type { PaymentMethod, PosPaymentMethod, PosCartItem } from '../model/pos.types'
import { authorizeDiscountOverride } from '../services/posService'
import { SaleReceipt } from './SaleReceipt'
import { CustomerPicker } from '../../customers/ui/CustomerPicker'

function getStock(row: { quantity_on_hand: number }[] | null) {
  return row?.[0]?.quantity_on_hand ?? 0
}

function getProductName(row: { name: string } | null) {
  return row?.name ?? 'Producto'
}

export function PosPage() {
  const user = useAuthStore((state) => state.user)
  const [discount, setDiscount] = useState(0)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
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
  const [mixedFirstMethod, setMixedFirstMethod] = useState<PosPaymentMethod>('cash')
  const [mixedFirstAmount, setMixedFirstAmount] = useState(0)
  const [mixedSecondMethod, setMixedSecondMethod] = useState<PosPaymentMethod>('addi')
  const [mixedSecondAmount, setMixedSecondAmount] = useState(0)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [barcodeFeedback, setBarcodeFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const barcodeRef = useRef<HTMLInputElement>(null)
  const [lastSale, setLastSale] = useState<{
    saleNumber: string
    soldAt: string
    cashierName: string
    customerName: string
    paymentMethod: PaymentMethod
    paymentReference: string
    mixedFirstMethod?: PosPaymentMethod
    mixedFirstAmount?: number
    mixedSecondMethod?: PosPaymentMethod
    mixedSecondAmount?: number
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

  useEffect(() => {
    barcodeRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!barcodeFeedback) return
    const t = setTimeout(() => setBarcodeFeedback(null), 2000)
    return () => clearTimeout(t)
  }, [barcodeFeedback])

  useEffect(() => {
    if (lastSale) {
      handlePrintTicket()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSale])

  function addByBarcode(code: string) {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return
    const source = variantsQuery.data ?? []
    const match = source.find(
      (it) => it.barcode.toUpperCase() === trimmed || it.sku.toUpperCase() === trimmed,
    )
    if (!match) {
      setBarcodeFeedback({ type: 'err', msg: `No encontrado: ${trimmed}` })
      setBarcodeInput('')
      return
    }
    const stock = getStock(match.inventory_stock)
    if (stock <= 0) {
      setBarcodeFeedback({ type: 'err', msg: `Sin stock: ${getProductName(match.products)}` })
      setBarcodeInput('')
      return
    }
    const existingCartItem = cart.find((e) => e.variantId === match.id)
    if (existingCartItem && existingCartItem.quantity >= existingCartItem.stockAvailable) {
      setBarcodeFeedback({ type: 'err', msg: `Stock máximo alcanzado: ${existingCartItem.stockAvailable} ud.` })
      setBarcodeInput('')
      return
    }
    addToCart({
      variantId: match.id,
      sku: match.sku,
      name: getProductName(match.products),
      size: match.size,
      color: match.color,
      costPrice: Number(match.cost_price),
      unitPrice: Number(match.sale_price),
      stockAvailable: stock,
      quantity: 1,
    })
    setBarcodeFeedback({ type: 'ok', msg: `+1 ${getProductName(match.products)}` })
    setBarcodeInput('')
  }

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

  function removeFromCart(variantId: string) {
    setCart((prev) => prev.filter((item) => item.variantId !== variantId))
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

    if (paymentMethod === 'mixed') {
      const mixedSum = mixedFirstAmount + mixedSecondAmount
      if (Math.abs(mixedSum - total) > 1) {
        setFeedback(`Los montos del pago mixto suman ${formatCop(mixedSum)} pero el total es ${formatCop(total)}. Ajusta los montos.`)
        return
      }
    }

    try {
      const result = await saleMutation.mutateAsync({
        storeId: user.storeId,
        soldBy: user.id,
        discountTotal: Number(discount.toFixed(2)),
        customerName,
        paymentMethod,
        paymentReference,
        mixedFirstMethod: paymentMethod === 'mixed' ? mixedFirstMethod : undefined,
        mixedFirstAmount: paymentMethod === 'mixed' ? mixedFirstAmount : undefined,
        mixedSecondMethod: paymentMethod === 'mixed' ? mixedSecondMethod : undefined,
        mixedSecondAmount: paymentMethod === 'mixed' ? mixedSecondAmount : undefined,
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
        mixedFirstMethod: paymentMethod === 'mixed' ? mixedFirstMethod : undefined,
        mixedFirstAmount: paymentMethod === 'mixed' ? mixedFirstAmount : undefined,
        mixedSecondMethod: paymentMethod === 'mixed' ? mixedSecondMethod : undefined,
        mixedSecondAmount: paymentMethod === 'mixed' ? mixedSecondAmount : undefined,
        subtotal,
        discount,
        total,
        items: cart,
      })
      setCart([])
      setCustomerName('')
      setCustomerPhone('')
      setDiscount(0)
      setDiscountAuthorizedBy(null)
      setAuthorizedDiscountValue(0)
      setPaymentReference('')
      setMixedFirstMethod('cash')
      setMixedFirstAmount(0)
      setMixedSecondMethod('addi')
      setMixedSecondAmount(0)
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
    <section className="space-y-0">
      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 space-y-4">
        <h1 className="text-2xl font-semibold text-zinc-100">POS</h1>

        {/* Cliente */}
        <div className="space-y-1">
          <span className="text-xs text-zinc-400">Cliente (opcional)</span>
          <CustomerPicker
            storeId={user?.storeId ?? ''}
            name={customerName}
            phone={customerPhone}
            onSelect={(n, p) => { setCustomerName(n); setCustomerPhone(p) }}
          />
        </div>

        {/* Barcode scanner */}
        <div className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Escáner</p>
          <div className="flex gap-2">
            <input
              ref={barcodeRef}
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  addByBarcode(barcodeInput)
                }
              }}
              placeholder="Escanea el código de barras…"
              autoComplete="off"
              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => addByBarcode(barcodeInput)}
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-amber-300"
            >
              +
            </button>
          </div>
          {barcodeFeedback && (
            <p
              className={`mt-2 text-xs font-medium ${
                barcodeFeedback.type === 'ok' ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {barcodeFeedback.msg}
            </p>
          )}
        </div>

        {/* Cart items */}
        {cart.length > 0 && (
          <div className="space-y-2">
            {cart.map((item) => (
              <div
                key={item.variantId}
                className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2"
              >
                <p className="min-w-0 flex-1 truncate text-sm text-zinc-200">{item.name}</p>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={item.stockAvailable}
                  value={item.quantity}
                  onChange={(e) =>
                    updateCartQty(item.variantId, parseIntegerInput(e.target.value, 1))
                  }
                  className="w-16 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-center text-sm text-zinc-100 focus:border-amber-400 focus:outline-none"
                />
                <p className="w-28 shrink-0 text-right text-sm font-semibold text-emerald-300">
                  {formatCop(item.unitPrice * item.quantity)}
                </p>
                <button
                  type="button"
                  onClick={() => removeFromCart(item.variantId)}
                  className="shrink-0 rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Payment + totals */}
        <div className="space-y-3 border-t border-zinc-800 pt-4 text-sm text-zinc-300">
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs text-zinc-400">Método de pago</span>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-400 focus:outline-none"
              >
                <option value="cash">Efectivo</option>
                <option value="addi">Addi</option>
                <option value="credilondon">CREDILONDON</option>
                <option value="dataphone">Datáfono</option>
                <option value="bancolombia">Bancolombia</option>
                <option value="daviplata">Daviplata</option>
                <option value="nequi">Nequi</option>
                <option value="mixed">Mixto</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-zinc-400">Descuento</span>
              <input
                type="text"
                inputMode="numeric"
                value={discount === 0 ? '' : formatCopInput(discount)}
                placeholder="0"
                onChange={(e) => {
                  const next = parseCopIntegerInput(e.target.value, 0)
                  setDiscount(next)
                  if (next <= 0) {
                    setDiscountAuthorizedBy(null)
                    setAuthorizedDiscountValue(0)
                  }
                }}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-400 focus:outline-none"
              />
              <span className="text-xs text-zinc-500">
                Máx: {formatCop(maxAllowedDiscount)}
              </span>
            </label>
          </div>

          {paymentMethod === 'mixed' ? (
            <div className="rounded-xl border border-zinc-700 bg-zinc-950/80 p-3 space-y-3">
              <p className="text-xs font-semibold text-zinc-400">Desglose pago mixto</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs text-zinc-400">Pago 1 — método</span>
                  <select
                    value={mixedFirstMethod}
                    onChange={(e) => setMixedFirstMethod(e.target.value as PosPaymentMethod)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-400 focus:outline-none"
                  >
                    <option value="cash">Efectivo</option>
                    <option value="addi">Addi</option>
                    <option value="credilondon">CREDILONDON</option>
                    <option value="dataphone">Datáfono</option>
                    <option value="bancolombia">Bancolombia</option>
                    <option value="daviplata">Daviplata</option>
                    <option value="nequi">Nequi</option>
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-zinc-400">Pago 1 — monto</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={mixedFirstAmount === 0 ? '' : formatCopInput(mixedFirstAmount)}
                    placeholder="0"
                    onChange={(e) => setMixedFirstAmount(parseCopIntegerInput(e.target.value, 0))}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-400 focus:outline-none"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs text-zinc-400">Pago 2 — método</span>
                  <select
                    value={mixedSecondMethod}
                    onChange={(e) => setMixedSecondMethod(e.target.value as PosPaymentMethod)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-400 focus:outline-none"
                  >
                    <option value="cash">Efectivo</option>
                    <option value="addi">Addi</option>
                    <option value="credilondon">CREDILONDON</option>
                    <option value="dataphone">Datáfono</option>
                    <option value="bancolombia">Bancolombia</option>
                    <option value="daviplata">Daviplata</option>
                    <option value="nequi">Nequi</option>
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-zinc-400">Pago 2 — monto</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={mixedSecondAmount === 0 ? '' : formatCopInput(mixedSecondAmount)}
                    placeholder="0"
                    onChange={(e) => setMixedSecondAmount(parseCopIntegerInput(e.target.value, 0))}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-400 focus:outline-none"
                  />
                </label>
              </div>
            </div>
          ) : null}

          {needsDiscountAuthorization ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
              {hasValidDiscountAuthorization
                ? `Descuento autorizado por ${discountAuthorizedBy}.`
                : 'Este descuento necesita autorización de admin/super admin.'}
              <button
                type="button"
                onClick={() => setAuthorizationModalOpen(true)}
                className="ml-2 rounded border border-amber-500/40 px-2 py-1 font-semibold text-amber-200 hover:bg-amber-500/20"
              >
                Autorizar descuento
              </button>
            </div>
          ) : null}

          <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 space-y-1">
            <div className="flex justify-between text-zinc-400">
              <span>Subtotal</span>
              <span>{formatCop(subtotal)}</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Descuento</span>
              <span>{formatCop(discount)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-zinc-100 pt-1 border-t border-zinc-800">
              <span>Total</span>
              <span>{formatCop(total)}</span>
            </div>
          </div>
        </div>

        {feedback ? <p className="text-sm text-amber-300">{feedback}</p> : null}

        <button
          type="button"
          disabled={saleMutation.isPending || !hasValidDiscountAuthorization}
          onClick={() => { void confirmSale() }}
          className="w-full rounded-xl bg-amber-400 px-4 py-3 font-semibold text-zinc-900 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          {saleMutation.isPending ? 'Procesando...' : 'Guardar e imprimir ticket'}
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
                onClick={() => { void authorizeDiscount() }}
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

