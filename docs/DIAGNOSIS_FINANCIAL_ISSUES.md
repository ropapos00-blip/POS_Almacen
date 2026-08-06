/**
 * DIAGNOSIS: Problemas de Cálculos Financieros - Cierre de Caja
 * 
 * Este documento detalla cada problema encontrado, su causa raíz
 * y la solución sin afectar datos existentes en producción.
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROBLEMA 1: Descuento por Item no se Refleja en line_total (Sale_items)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * UBICACIÓN: supabase/sql/04_pos_sale_rpc.sql, línea 190-210
 * 
 * CÓDIGO ACTUAL (INCORRECTO):
 * 
 *   v_line_total := v_variant.sale_price * v_qty;
 *   if v_item_discount > v_line_total then
 *     raise exception 'Descuento de item excede su total para SKU %', v_variant.sku;
 *   end if;
 *   v_subtotal := v_subtotal + (v_variant.sale_price * v_qty);
 *   v_cost_total := v_cost_total + (coalesce(v_variant.cost_price, 0) * v_qty);
 *   v_item_discount_total := v_item_discount_total + v_item_discount;
 * 
 * Luego al insertar en sale_items (línea 213-225):
 *   insert into public.sale_items (..., line_total)
 *   values (..., v_line_total)  <-- AQUÍ ESTÁ EL ERROR: line_total = precio * qty, SIN DESCONTAR
 * 
 * PROBLEMA:
 * - Se calcula v_line_total = precio * cantidad (sin descuento)
 * - Se valida que el descuento no exceda v_line_total
 * - SE SUMA EL DESCUENTO A v_item_discount_total
 * - PERO al insertar en sale_items, se guarda v_line_total sin descontar
 * - El grand_total de la venta SÍ es correcto (se calcula: subtotal - discount_total)
 * - PERO los detalles en sale_items.line_total no reflejan los descuentos individuales
 * 
 * IMPACTO EN CIERRE DE CAJA:
 * - Sale.grand_total es correcto ✓
 * - Sale_items.line_total es INCORRECTO (muestra precio sin descuento) ✗
 * - getDaySalesSummary usa sale.grand_total (CORRECTO) ✓
 * - PERO si alguien revisa detalles de venta, verá inconsistencias
 * 
 * SOLUCIÓN (aplica sin afectar BD existente):
 * - El cálculo en RPC es correcto (grand_total es correcto)
 * - El problema es cosmético en la tabla sale_items
 * - Cambiar línea ~220: v_line_total debería ser (v_variant.sale_price * v_qty) - v_item_discount
 */

const PROBLEMA_1_IMPACT = `
ESCENARIO DE ERROR:
- Venta de 2 pantalones a $100k c/u = $200k
- Descuento en el primer pantalón: -$20k
- Total correcto: $180k

EN BD HOY (INCORRECTO EN DETALLES):
  sales.grand_total = 180000  ✓ (correcto)
  sale_items[0].line_total = 100000  ✗ (debería ser 80000)
  sale_items[1].line_total = 100000  ✓ (correcto)

EN CIERRE DE CAJA:
  Se suma sale.grand_total = 180000 ✓ FUNCIONA BIEN
  
PERO SI AUDITA DETALLES:
  100000 + 100000 - 20000 descuento global ≠ suma de items (100000 + 100000)
`

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROBLEMA 2: Falta Validación de Consistencia en getDaySalesSummary
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * UBICACIÓN: src/features/cash-register/services/cashRegisterService.ts, línea 170-295
 * 
 * CÓDIGO ACTUAL:
 * - Suma todos los grand_total de sales ✓
 * - Desglosaba sale_payments por método ✓
 * - PERO: Nunca valida que la suma de métodos = grand_total
 * 
 * RIESGO:
 * Si una venta tiene:
 *   grand_total = 100000
 *   sale_payments = [{ method: 'cash', amount: 60000 }, { method: 'card', amount: 30000 }]
 *   
 * La suma de payments (90000) ≠ grand_total (100000)
 * Esto causaría:
 *   posCash = 60000  (correcto)
 *   posCard = 30000  (incompleto)
 *   posTotal = 100000 (correcto)
 *   
 * AL CERRAR CAJA:
 *   expectedCash = base + posCash + invoiceCash + layawayCash - expenses
 *   Se usaría posCash = 60000 (sin los 10k faltantes)
 *   Pero posTotal es 100000, así que el total cuadra pero el desglose no
 * 
 * IMPACTO: El efectivo contado será diferente al esperado sin razón aparente
 */

const PROBLEMA_2_MANIFESTACION = `
ESCENARIO DE ERROR:
- Venta A: $100k (60k cash + 40k card) - CORRECTA
- Venta B: $50k (30k cash + 20k card) - FALTA $1k de payment
- Total esperado: 150k (90k cash + 60k card)

EN SISTEMA HOY:
  posTotal = 150000  ✓
  posCash = 90000  ✓ (60k + 30k)
  posCard = 60000  ✓ (40k + 20k)
  
PERO SI HAY ERROR EN PERSISTENCIA:
  Sale B solo registró 49000 en payments
  posTotal = 149000  ✗
  posCash = 89000  ✗ (falta 1k)
  posCard = 60000  ✓
  
AL CERRAR CAJA:
  expectedCash sería $1k menos
  Cuando se cuente física, habrá $1k más
  Error reportado: "sobra $1k pero no sé por qué"
`

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROBLEMA 3: Parsing Incorrecto de Mixed Payments en Manual_Invoices
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * UBICACIÓN: src/features/cash-register/services/cashRegisterService.ts, línea 256-272
 * 
 * FORMATO ALMACENADO: payment_reference = "method1:amount1:method2:amount2"
 * EJEMPLO: "cash:60000:card:40000"
 * 
 * CÓDIGO ACTUAL:
 *   const parts = (inv.payment_reference as string).split(':')
 *   if (parts.length >= 4) {
 *     const m1 = parts[0]  // "cash"
 *     const a1 = Number(parts[1]) || 0  // 60000
 *     const m2 = parts[2]  // "card"
 *     const a2 = Number(parts[3]) || 0  // 40000
 *     if (m1 === 'cash') invoiceCash += a1
 *     else if (m1) invoiceByMethod[m1] = ...
 *     if (m2 === 'cash') invoiceCash += a2
 *     else if (m2) invoiceByMethod[m2] = ...
 *   }
 * 
 * PROBLEMAS:
 * 1. Si payment_reference es NULL o inválido, se ignora TODO el mixed payment
 * 2. Si payment_reference tiene formato incorrecto (menos de 4 partes), se ignora
 * 3. No valida que a1 + a2 = grand_total
 * 4. No hay fallback si parts[1] no es number válido
 * 
 * IMPACTO:
 *   Factura: $100k en mixed (cash:60k:card:40k)
 *   Pero payment_reference = NULL o string inválido
 *   Resultado en cierre: invoiceCash += 0, invoiceByMethod['card'] += 0
 *   El grand_total (100k) se suma a invoiceTotal
 *   PERO invoiceCash sigue en 0
 *   
 *   expectedCash BAJO (faltarían 60k de efectivo esperado)
 *   Cuando se cuente, habrá 60k de sobra sin explicación
 */

const PROBLEMA_3_MANIFESTACION = `
ESCENARIO DE ERROR:
- Factura manual: $100k
  payment_method = 'mixed'
  payment_reference = 'cash:60000:card:40000'  <-- BIEN GUARDADO

PERO SI PAYMENT_REFERENCE ES NULO/INVÁLIDO:
  payment_reference = NULL (error en guardado)
  
EN CIERRE DE CAJA:
  invoiceTotal += 100000  ✓ (suma el grand_total)
  invoiceCash += 0  ✗ (no puede parsear payment_reference nulo)
  
RESULTADO:
  expectedCash = base + 0 (posCash) + 0 (invoiceCash) + 0 (layaway) - 0 (expenses)
  Cuando se cuente: hay $100k en caja
  Error: "¿De dónde salió este dinero?"
`

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROBLEMA 4: Gastos Puede Estar Duplicados o Mal Restados
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * UBICACIÓN: src/features/cash-register/services/cashRegisterService.ts, línea 223-227
 * 
 * CÓDIGO ACTUAL:
 *   const expensesTotal = (expensesResult.data ?? []).reduce(
 *     (sum, e) => sum + Number(e.amount ?? 0),
 *     0,
 *   )
 * 
 * RIESGO:
 * - No valida is_active = true con seguridad
 * - Si un gasto se registra dos veces en la BD (duplicate insert), suma dos veces
 * - Si se anula un gasto (delete), pero se registró como is_active=false en lugar de delete,
 *   una relectura podría incluir gastos anulados
 * 
 * IMPACTO:
 *   Gasto: $10k registrado correctamente
 *   Pero por error se inserta dos veces
 *   expensesTotal = $20k
 *   expectedCash = base + ingresos - $20k (cuando debería ser -$10k)
 *   Diferencia: $10k de falta
 */

const PROBLEMA_4_MANIFESTACION = `
ESCENARIO:
- Se registra gasto: "Café para la tienda" - $10k
- Por error (double-click), se inserta dos veces
- Base: 50k, Ingresos: 100k, Gastos: 20k (duplicado)
- expectedCash = 50k + 100k - 20k = 130k

CUANDO SE CUENTA:
- Efectivo real: 140k
- Diferencia: +$10k (sobra)
- Usuario confundido: "¿por qué sobran 10k?"
`

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROBLEMA 5: Falta de RPC Validador al Cerrar Caja
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * UBICACIÓN: src/features/cash-register/services/cashRegisterService.ts, línea 106-117
 * 
 * CÓDIGO ACTUAL:
 *   export async function closeSession(input: CloseSessionInput): Promise<void> {
 *     const { error } = await supabase
 *       .from('cash_register_sessions')
 *       .update({
 *         status: 'closed',
 *         closed_by: input.closedBy,
 *         cash_counted: input.cashCounted,  <-- SOLO GUARDA EL NÚMERO
 *         notes_close: input.notesClose || null,
 *         closed_at: new Date().toISOString(),
 *       })
 *       .eq('id', input.sessionId)
 *   }
 * 
 * PROBLEMA:
 * - No hay validación de que cash_counted sea razonable
 * - No calcula expected_cash en backend
 * - No detecta diferencias anormales
 * - No hay transacción de dos fases (validate + commit)
 * 
 * IMPACTO:
 * - Se puede cerrar caja con valores incorrectos
 * - No hay auditoría automática
 * - Error se descubre DESPUÉS del cierre
 * - Difícil de rastrear qué pasó
 */

const PROBLEMA_5_MANIFESTACION = `
ESCENARIO:
- Usuario toca cerrar caja accidentalmente
- Ingresa $999,999,999 como efectivo contado (typo)
- Sistema no valida
- Cierre se registra con valor incorrecto
- Descubren el error cuando auditan meses después
`

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RESUMEN DE SOLUCIONES (SIN AFECTAR PRODUCCIÓN)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SOLUCIONES = `
✅ SOLUCIÓN 1: Actualizar RPC create_sale_transaction (SAFE - solo afecta nuevas ventas)
   - Cambiar line_total en insert sale_items para descontar v_item_discount
   - Migraci ón: 54_fix_sale_items_line_total_discount.sql
   - Impacto: Solo se aplica a nuevas ventas creadas después

✅ SOLUCIÓN 2: Agregar validaciones en getDaySalesSummary (FRONTEND - sin BD)
   - Agregar función validateDaySalesSummary() que verifica:
     - sum(posByMethod) == posTotal
     - sum(invoiceByMethod) + invoiceCash == invoiceTotal
     - sum(layawayByMethod) + layawayCash == layawayTotal
   - Si hay inconsistencia, loguear error y alertar usuario
   - Ubicación: cashRegisterService.ts nueva función

✅ SOLUCIÓN 3: Mejorar parsing de mixed payments (FRONTEND - safe)
   - Agregar validación de payment_reference antes de parsear
   - Agregar fallback seguro si parsing falla
   - Validar que a1 + a2 = grand_total
   - Ubicación: cashRegisterService.ts línea 256

✅ SOLUCIÓN 4: Agregar deduplicación de gastos (BACKEND - RPC validador)
   - RPC: validate_daily_summary() que detecta:
     - Gastos duplicados (mismo monto, mismo día, mismo usuario)
     - Gastos anormalmente altos (> 10% de ingresos)
   - Llamar antes de cerrar caja
   - Migración: 54_validate_cash_register_close.sql

✅ SOLUCIÓN 5: Crear RPC de cierre transaccional (BACKEND - safe)
   - RPC: close_cash_register_transactional()
   - Valida cálculos ANTES de guardar
   - Registra diferencia detectada
   - Registra en audit_logs cada discrepancia
   - Migración: 55_close_cash_register_rpc.sql
`

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASO A PASO PARA IMPLEMENTAR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const IMPLEMENTATION_PLAN = `
FASE 1: Diagnóstico en Producción (HOY - sin cambios)
--------
1. Agregar logging en getDaySalesSummary para detectar inconsistencias
   → Ver si hay ventas con payment_sum ≠ grand_total
   → Ver si hay facturas mixtas con payment_reference nulo
   → Ver si hay gastos duplicados

2. Crear query de auditoría SQL para revisar histórico:
   → SELECT sale_id, grand_total, sum(amount) from sale_payments GROUP BY sale_id HAVING sum ≠ grand_total
   → SELECT * FROM manual_invoices WHERE payment_method='mixed' AND payment_reference IS NULL
   → SELECT amount, COUNT(*) FROM manual_invoice_expenses GROUP BY amount, expense_date, store_id HAVING COUNT > 1

FASE 2: Correcciones (SIN riesgo a datos actuales)
--------
3. Migraciones en orden:
   a) 54_fix_sale_items_line_total_discount.sql
      → Fix: sale_items.line_total = (price * qty) - discount
      → UPDATE solo sale_items con id > max_id_anterior (nuevas) si es posible
   
   b) 55_validate_sales_transactions.sql
      → Agregar función validateSalePayments() para auditoría
   
   c) 56_validate_invoice_transactions.sql
      → Agregar función validateInvoicePayments() para auditoría
   
   d) 57_validate_expenses_deduplication.sql
      → Agregar función detectDuplicateExpenses() para auditoría

   e) 58_close_cash_register_rpc.sql
      → Crear RPC close_cash_register_transactional() con validaciones

FASE 3: Frontend actualizado
--------
4. Actualizar cashRegisterService.ts:
   - validateDaySalesSummary() antes de mostrar resumen
   - validateMixedPayment() al parsear facturas
   - Alertar si hay inconsistencias detectadas
   
5. Actualizar CierresCajaPage.tsx:
   - Mostrar badge de validación ✓ si cierre es consistente
   - Mostrar warning ⚠️ si hay inconsistencias
   - Bloquear cierre si diferencia > umbral definido (ej: 10k)

FASE 4: Testing en staging
--------
6. Ejecutar migraciones en staging
7. Importar datos de producción (anonymizado)
8. Validar que cierres históricos se calculen correctamente
9. Verificar que nuevos cierres funcionen

FASE 5: Rollout a producción
--------
10. Ejecutar migraciones en producción
11. Monitorear logs de inconsistencias detectadas
12. Generar reporte de reconciliación
`

export const __DIAGNOSIS__ = {
  PROBLEMA_1_IMPACT,
  PROBLEMA_2_MANIFESTACION,
  PROBLEMA_3_MANIFESTACION,
  PROBLEMA_4_MANIFESTACION,
  PROBLEMA_5_MANIFESTACION,
  SOLUCIONES,
  IMPLEMENTATION_PLAN,
}
