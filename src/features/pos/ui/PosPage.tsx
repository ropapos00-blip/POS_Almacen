import { useEffect, useMemo, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import { formatCop } from '../../../shared/utils/currency'
import { formatDateTimeColombia } from '../../../shared/utils/dateTime'
import { formatCopInput, parseCopIntegerInput, parseIntegerInput } from '../../../shared/utils/numberInput'
import { useAuthStore } from '../../auth/model/useAuthStore'
import { useCreatePosSaleMutation, useDiscountPinConfigQuery, usePosVariantsQuery } from '../model/usePosQueries'
import type { PaymentMethod, PosPaymentMethod, PosCartItem } from '../model/pos.types'
import { validateDiscountPin } from '../services/discountPinService'
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
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [paymentReference, setPaymentReference] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [authorizationFeedback, setAuthorizationFeedback] = useState<string | null>(null)
  const [authorizationModalOpen, setAuthorizationModalOpen] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [isAuthorizingDiscount, setIsAuthorizingDiscount] = useState(false)
  const [discountAuthorizedBy, setDiscountAuthorizedBy] = useState<string | null>(null)
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
  const discountPinQuery = useDiscountPinConfigQuery(user?.storeId)
  const handlePrintTicket = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: lastSale?.saleNumber ?? 'ticket-pos',
    pageStyle: '@page { size: 56mm auto; margin: 0mm; } html, body { margin: 0 !important; padding: 0 !important; height: auto !important; min-height: 0 !important; background: white !important; }',
  })

  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0)
  }, [cart])

  // PIN is required only when the system is enabled AND a PIN has been configured.
  // When disabled, cashiers can discount freely without a PIN.
  const pinRequired =
    discountPinQuery.data?.enabled === true && discountPinQuery.data?.hasPin === true

  const totalDiscount = useMemo(() => {
    return cart.reduce((acc, item) => acc + (item.discount ?? 0), 0)
  }, [cart])

  const total = useMemo(() => {
    return Math.max(0, subtotal - totalDiscount)
  }, [subtotal, totalDiscount])

  const needsDiscountAuthorization =
    user?.role === 'cashier' &&
    pinRequired &&
    cart.some(item => item.discount > Math.max(0, (item.unitPrice - item.minSalePrice) * item.quantity))

  const hasValidDiscountAuthorization =
    !needsDiscountAuthorization || Boolean(discountAuthorizedBy)

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
      minSalePrice: match.suggested_price != null ? Number(match.suggested_price) : Number(match.sale_price),
      stockAvailable: stock,
      quantity: 1,
      discount: 0,
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

  function updateCartItemDiscount(variantId: string, amount: number) {
    setCart((prev) =>
      prev.map((item) =>
        item.variantId === variantId ? { ...item, discount: amount } : item,
      ),
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
        discountTotal: Number(totalDiscount.toFixed(2)),
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
        discount: totalDiscount,
        total,
        items: cart,
      })
      setCart([])
      setCustomerName('')
      setCustomerPhone('')
      setDiscountAuthorizedBy(null)
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

    if (!pinInput) {
      setAuthorizationFeedback('Ingresa la clave.')
      return
    }

    setIsAuthorizingDiscount(true)
    setAuthorizationFeedback(null)

    try {
      const valid = await validateDiscountPin(user.storeId, pinInput)
      if (!valid) {
        setAuthorizationFeedback('Clave incorrecta.')
        return
      }
      setDiscountAuthorizedBy('PIN')
      setPinInput('')
      setAuthorizationModalOpen(false)
      setFeedback(null)
    } catch (error) {
      setAuthorizationFeedback(
        error instanceof Error ? error.message : 'No se pudo validar la clave.',
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
            {cart.map((item) => {
              const freeMax = Math.max(0, (item.unitPrice - item.minSalePrice) * item.quantity)
              const costMax = Math.max(0, (item.unitPrice - item.costPrice) * item.quantity)
              const effectiveMax = (discountAuthorizedBy || user?.role !== 'cashier' || !pinRequired) ? costMax : freeMax
              const lockedForPin = user?.role === 'cashier' && pinRequired && !discountAuthorizedBy && freeMax === 0
              return (
                <div
                  key={item.variantId}
                  className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 space-y-2"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <p className="w-full truncate text-sm text-zinc-200 sm:flex-1 sm:w-auto">{item.name}</p>
                    <div className="ml-auto flex items-center gap-2">
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
                    <p className="w-24 shrink-0 text-right text-sm font-semibold text-emerald-300">
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
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 shrink-0">Dcto:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={item.discount === 0 ? '' : formatCopInput(item.discount)}
                      placeholder="0"
                      readOnly={lockedForPin}
                      onClick={() => {
                        if (lockedForPin) {
                          setPinInput('')
                          setAuthorizationFeedback(null)
                          setAuthorizationModalOpen(true)
                        }
                      }}
                      onChange={(e) => {
                        const raw = parseCopIntegerInput(e.target.value, 0)
                        if (user?.role === 'cashier' && pinRequired && !discountAuthorizedBy && raw > freeMax) {
                          setPinInput('')
                          setAuthorizationFeedback(null)
                          setAuthorizationModalOpen(true)
                          return
                        }
                        updateCartItemDiscount(item.variantId, Math.min(raw, effectiveMax))
                      }}
                      className="w-28 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 focus:border-amber-400 focus:outline-none read-only:cursor-pointer"
                    />
                    <span className="text-xs text-zinc-500">máx {formatCop(effectiveMax)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Payment + totals */}
        <div className="space-y-3 border-t border-zinc-800 pt-4 text-sm text-zinc-300">
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

          {needsDiscountAuthorization && hasValidDiscountAuthorization ? (
            <p className="text-xs text-emerald-400">Descuento autorizado.</p>
          ) : null}

          <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 space-y-1">
            <div className="flex justify-between text-zinc-400">
              <span>Subtotal</span>
              <span>{formatCop(subtotal)}</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Descuento</span>
              <span>{formatCop(totalDiscount)}</span>
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
          <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
            <h3 className="text-lg font-semibold text-zinc-100">Autorizar descuento</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Ingresa la clave de descuento configurada por el administrador.
            </p>

            <label className="mt-4 block space-y-1">
              <span className="text-xs text-zinc-400">Clave de descuento</span>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                autoComplete="new-password"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="mínimo 4 dígitos"
                autoFocus
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none"
              />
            </label>

            {authorizationFeedback ? (
              <p className="mt-3 text-sm text-rose-400">{authorizationFeedback}</p>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setAuthorizationModalOpen(false)
                  setPinInput('')
                  setAuthorizationFeedback(null)
                }}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => { void authorizeDiscount() }}
                disabled={isAuthorizingDiscount || pinInput.length < 4}
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

