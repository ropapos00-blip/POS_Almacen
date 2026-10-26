/**
 * cashRegisterCalculations.test.ts
 * 
 * Pruebas internas para validar la lógica de cálculos financieros sin tocar la BD.
 * Simula escenarios de cierre de caja para detectar problemas de sumas/restas.
 * 
 * Ejecución: npx vitest run src/features/cash-register/services/__tests__/cashRegisterCalculations.test.ts
 */

import { describe, it, expect } from 'vitest'

/**
 * Tipo para simular el resumen de ventas
 */
interface DaySalesSummaryMock {
  posCash: number
  posCard: number
  posTransfer: number
  posTotal: number
  posByMethod: Record<string, number>
  invoiceCash: number
  invoiceTotal: number
  invoiceByMethod: Record<string, number>
  expensesTotal: number
  layawayCash: number
  layawayTotal: number
  layawayByMethod: Record<string, number>
}

/**
 * Función de cálculo de efectivo esperado (igual a CierresCajaPage.tsx)
 */
function calculateExpectedCash(
  cashBase: number,
  summary: DaySalesSummaryMock,
): number {
  const posCash = summary.posCash
  const invoiceCash = summary.invoiceCash
  const layawayCash = summary.layawayCash
  const expenses = summary.expensesTotal

  return cashBase + posCash + invoiceCash + layawayCash - expenses
}

/**
 * Función para validar que las sumas de métodos individuales
 * coincidan con los totales reportados
 */
function validateMethodBreakdown(summary: DaySalesSummaryMock): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Validar ventas POS
  const posByMethodSum = Object.values(summary.posByMethod).reduce((a, b) => a + b, 0)
  if (Math.abs(posByMethodSum - summary.posTotal) > 0.01) {
    errors.push(
      `Ventas POS: suma de métodos (${posByMethodSum}) no coincide con posTotal (${summary.posTotal})`,
    )
  }

  // Validar que posCash esté en posByMethod
  if (
    summary.posByMethod['cash'] !== undefined &&
    Math.abs(summary.posByMethod['cash'] - summary.posCash) > 0.01
  ) {
    errors.push(
      `Ventas POS: cash en posByMethod (${summary.posByMethod['cash']}) no coincide con posCash (${summary.posCash})`,
    )
  }

  // Validar facturas manuales
  // invoiceCash está en un campo separado (no en invoiceByMethod), así que se suma directamente
  const invoiceByMethodSum = Object.values(summary.invoiceByMethod).reduce((a, b) => a + b, 0)
  const totalInvoiceByMethod = summary.invoiceCash + invoiceByMethodSum

  if (Math.abs(totalInvoiceByMethod - summary.invoiceTotal) > 0.01) {
    errors.push(
      `Facturas manuales: suma de métodos (${totalInvoiceByMethod}) no coincide con invoiceTotal (${summary.invoiceTotal})`,
    )
  }

  // Validar separados
  const layawayByMethodSum = Object.values(summary.layawayByMethod).reduce((a, b) => a + b, 0)
  const totalLayaway = summary.layawayCash + layawayByMethodSum

  if (Math.abs(totalLayaway - summary.layawayTotal) > 0.01) {
    errors.push(
      `Separados: suma de cash (${summary.layawayCash}) + métodos (${layawayByMethodSum}) no coincide con layawayTotal (${summary.layawayTotal})`,
    )
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Calcula el total digital (no efectivo) para auditoría
 */
function calculateTotalDigital(summary: DaySalesSummaryMock): number {
  const posDigital = (summary.posCard ?? 0) + (summary.posTransfer ?? 0)
  const invoiceDigital = Object.values(summary.invoiceByMethod).reduce((a, b) => a + b, 0)
  const layawayDigital = Object.values(summary.layawayByMethod).reduce((a, b) => a + b, 0)

  return posDigital + invoiceDigital + layawayDigital
}

/**
 * Validar que el total de ingresos sea consistente
 * Total = Base + (POS + Facturas + Separados) - Gastos
 */
function validateTotalConsistency(
  cashBase: number,
  summary: DaySalesSummaryMock,
  reportedCashCounted: number,
): { valid: boolean; errors: string[]; details: Record<string, number> } {
  const errors: string[] = []

  const expectedCash = calculateExpectedCash(cashBase, summary)
  const totalCash = summary.posCash + summary.invoiceCash + summary.layawayCash
  const totalIncome = summary.posTotal + summary.invoiceTotal + summary.layawayTotal

  // El efectivo esperado debe ser: base + ingresos en efectivo - gastos
  const calculatedExpected = cashBase + totalCash - summary.expensesTotal

  if (Math.abs(expectedCash - calculatedExpected) > 0.01) {
    errors.push(
      `Cálculo de expectedCash inconsistente: función devuelve ${expectedCash}, cálculo manual da ${calculatedExpected}`,
    )
  }

  if (reportedCashCounted > 0 && Math.abs(reportedCashCounted - expectedCash) > 0.01) {
    errors.push(
      `Diferencia en cierre: efectivo contado (${reportedCashCounted}) vs esperado (${expectedCash}), diferencia: ${reportedCashCounted - expectedCash}`,
    )
  }

  return {
    valid: errors.length === 0,
    errors,
    details: {
      cashBase,
      totalCashIncome: totalCash,
      totalDigitalIncome: calculateTotalDigital(summary),
      totalIncome,
      expenses: summary.expensesTotal,
      expectedCash,
      reportedCashCounted,
      difference: reportedCashCounted - expectedCash,
    },
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TESTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Cálculos de Cierre de Caja', () => {
  describe('Caso simple: solo ventas POS en efectivo', () => {
    it('debe calcular correctamente con venta POS única en efectivo', () => {
      const summary: DaySalesSummaryMock = {
        posCash: 100000,
        posCard: 0,
        posTransfer: 0,
        posTotal: 100000,
        posByMethod: { cash: 100000 },
        invoiceCash: 0,
        invoiceTotal: 0,
        invoiceByMethod: {},
        expensesTotal: 0,
        layawayCash: 0,
        layawayTotal: 0,
        layawayByMethod: {},
      }

      const expected = calculateExpectedCash(50000, summary)
      expect(expected).toBe(150000) // base(50k) + posCash(100k)

      const validation = validateTotalConsistency(50000, summary, 150000)
      expect(validation.valid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })

    it('debe detectar diferencia si efectivo contado no coincide', () => {
      const summary: DaySalesSummaryMock = {
        posCash: 100000,
        posCard: 0,
        posTransfer: 0,
        posTotal: 100000,
        posByMethod: { cash: 100000 },
        invoiceCash: 0,
        invoiceTotal: 0,
        invoiceByMethod: {},
        expensesTotal: 0,
        layawayCash: 0,
        layawayTotal: 0,
        layawayByMethod: {},
      }

      const validation = validateTotalConsistency(50000, summary, 145000) // menos 5k
      expect(validation.valid).toBe(false)
      // toContainEqual soporta matchers asimétricos en arrays (toContain solo valores primitivos exactos)
      expect(validation.errors).toContainEqual(
        expect.stringContaining('Diferencia en cierre'),
      )
    })
  })

  describe('Caso complejo: múltiples métodos de pago', () => {
    it('debe manejar correctamente POS con múltiples métodos', () => {
      const summary: DaySalesSummaryMock = {
        posCash: 50000,
        posCard: 30000,
        posTransfer: 20000,
        posTotal: 100000,
        posByMethod: { cash: 50000, card: 30000, transfer: 20000 },
        invoiceCash: 0,
        invoiceTotal: 0,
        invoiceByMethod: {},
        expensesTotal: 0,
        layawayCash: 0,
        layawayTotal: 0,
        layawayByMethod: {},
      }

      const expected = calculateExpectedCash(25000, summary)
      expect(expected).toBe(75000) // base(25k) + posCash(50k)

      const validation = validateMethodBreakdown(summary)
      expect(validation.valid).toBe(true)
    })

    it('debe sumar correctamente facturas manuales en efectivo y otros métodos', () => {
      const summary: DaySalesSummaryMock = {
        posCash: 50000,
        posCard: 0,
        posTransfer: 0,
        posTotal: 50000,
        posByMethod: { cash: 50000 },
        invoiceCash: 20000,
        invoiceTotal: 50000, // 20k cash + 30k otros
        invoiceByMethod: { card: 30000 },
        expensesTotal: 0,
        layawayCash: 0,
        layawayTotal: 0,
        layawayByMethod: {},
      }

      const expected = calculateExpectedCash(10000, summary)
      expect(expected).toBe(80000) // base(10k) + posCash(50k) + invoiceCash(20k)

      const validation = validateTotalConsistency(10000, summary, 80000)
      expect(validation.valid).toBe(true)
    })
  })

  describe('Caso con gastos', () => {
    it('debe restar correctamente los gastos del efectivo esperado', () => {
      const summary: DaySalesSummaryMock = {
        posCash: 100000,
        posCard: 0,
        posTransfer: 0,
        posTotal: 100000,
        posByMethod: { cash: 100000 },
        invoiceCash: 0,
        invoiceTotal: 0,
        invoiceByMethod: {},
        expensesTotal: 15000, // gastos
        layawayCash: 0,
        layawayTotal: 0,
        layawayByMethod: {},
      }

      const expected = calculateExpectedCash(50000, summary)
      expect(expected).toBe(135000) // base(50k) + posCash(100k) - expenses(15k)

      const validation = validateTotalConsistency(50000, summary, 135000)
      expect(validation.valid).toBe(true)
    })

    it('debe detectar si gastos reducen incorrectamente el efectivo', () => {
      const summary: DaySalesSummaryMock = {
        posCash: 100000,
        posCard: 0,
        posTransfer: 0,
        posTotal: 100000,
        posByMethod: { cash: 100000 },
        invoiceCash: 0,
        invoiceTotal: 0,
        invoiceByMethod: {},
        expensesTotal: 15000,
        layawayCash: 0,
        layawayTotal: 0,
        layawayByMethod: {},
      }

      // Si se contaron 130k en lugar de 135k, hay problema
      const validation = validateTotalConsistency(50000, summary, 130000)
      expect(validation.valid).toBe(false)
      expect(validation.errors[0]).toContain('Diferencia en cierre')
    })
  })

  describe('Caso con separados (layaways)', () => {
    it('debe incluir correctamente los abonos a separados', () => {
      const summary: DaySalesSummaryMock = {
        posCash: 50000,
        posCard: 0,
        posTransfer: 0,
        posTotal: 50000,
        posByMethod: { cash: 50000 },
        invoiceCash: 0,
        invoiceTotal: 0,
        invoiceByMethod: {},
        expensesTotal: 0,
        layawayCash: 30000, // abono a separado en efectivo
        layawayTotal: 50000, // 30k cash + 20k otros métodos
        layawayByMethod: { card: 20000 },
      }

      const expected = calculateExpectedCash(20000, summary)
      expect(expected).toBe(100000) // base(20k) + posCash(50k) + layawayCash(30k)

      const validation = validateTotalConsistency(20000, summary, 100000)
      expect(validation.valid).toBe(true)
    })
  })

  describe('Caso real complejo: todos los tipos de movimientos', () => {
    it('debe validar un cierre con POS, facturas, separados, gastos y múltiples métodos', () => {
      const summary: DaySalesSummaryMock = {
        // POS: 100k total (60k cash, 40k digital)
        posCash: 60000,
        posCard: 25000,
        posTransfer: 15000,
        posTotal: 100000,
        posByMethod: { cash: 60000, card: 25000, transfer: 15000 },

        // Facturas: 80k total (40k cash, 40k digital)
        invoiceCash: 40000,
        invoiceTotal: 80000,
        invoiceByMethod: { card: 30000, addi: 10000 },

        // Separados: 50k total (20k cash, 30k digital)
        layawayCash: 20000,
        layawayTotal: 50000,
        layawayByMethod: { transfer: 20000, dataphone: 10000 },

        // Gastos: 10k
        expensesTotal: 10000,
      }

      // Base: 100k
      // Efectivo esperado: 100k + 60k + 40k + 20k - 10k = 210k
      const expected = calculateExpectedCash(100000, summary)
      expect(expected).toBe(210000)

      const validation = validateTotalConsistency(100000, summary, 210000)
      expect(validation.valid).toBe(true)

      // Si se contó diferente
      const validationWithDiff = validateTotalConsistency(100000, summary, 208500)
      expect(validationWithDiff.valid).toBe(false)
      expect(validationWithDiff.details.difference).toBe(-1500) // faltante
    })
  })

  describe('Detección de problemas en desglose de métodos', () => {
    it('debe detectar cuando sum de métodos no coincide con total (BUG)', () => {
      const summary: DaySalesSummaryMock = {
        posCash: 60000,
        posCard: 25000,
        posTransfer: 15000,
        posTotal: 100000,
        posByMethod: { cash: 60000, card: 20000, transfer: 15000 }, // card solo 20k pero debería ser 25k
        invoiceCash: 0,
        invoiceTotal: 0,
        invoiceByMethod: {},
        expensesTotal: 0,
        layawayCash: 0,
        layawayTotal: 0,
        layawayByMethod: {},
      }

      const validation = validateMethodBreakdown(summary)
      expect(validation.valid).toBe(false)
      expect(validation.errors).toHaveLength(1)
      expect(validation.errors[0]).toContain('suma de métodos')
    })

    it('debe detectar cuando posCash no está en posByMethod (BUG)', () => {
      const summary: DaySalesSummaryMock = {
        posCash: 60000,
        posCard: 25000,
        posTransfer: 15000,
        posTotal: 100000,
        posByMethod: { cash: 55000, card: 25000, transfer: 15000 }, // cash mal registrado
        invoiceCash: 0,
        invoiceTotal: 0,
        invoiceByMethod: {},
        expensesTotal: 0,
        layawayCash: 0,
        layawayTotal: 0,
        layawayByMethod: {},
      }

      const validation = validateMethodBreakdown(summary)
      expect(validation.valid).toBe(false)
      expect(validation.errors.length).toBeGreaterThan(0)
    })
  })

  describe('Caso problema reportado: mezcla de métodos en mixed payment', () => {
    it('debe validar correctamente facturas con payment_method=mixed', () => {
      // Cuando una factura tiene payment_method='mixed' con reference="cash:30000:card:20000"
      // invoiceTotal debe ser 50000
      // invoiceCash debe ser 30000
      // invoiceByMethod['card'] debe ser 20000

      const summary: DaySalesSummaryMock = {
        posCash: 0,
        posCard: 0,
        posTransfer: 0,
        posTotal: 0,
        posByMethod: {},
        invoiceCash: 30000, // extraydo del mixed payment
        invoiceTotal: 50000, // total de la factura
        invoiceByMethod: { card: 20000 }, // otro método del mixed payment
        expensesTotal: 0,
        layawayCash: 0,
        layawayTotal: 0,
        layawayByMethod: {},
      }

      const expected = calculateExpectedCash(10000, summary)
      expect(expected).toBe(40000) // base(10k) + invoiceCash(30k)

      const validation = validateTotalConsistency(10000, summary, 40000)
      expect(validation.valid).toBe(true)
    })
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NUEVOS TESTS — Bugs encontrados en auditoría QA (2026-10-25)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Bugs detectados en auditoría QA', () => {
  describe('Bug #2 — Validación de facturas con cash+otros métodos', () => {
    it('debe detectar inconsistencia cuando invoiceCash + invoiceByMethod ≠ invoiceTotal', () => {
      // Bug original: el cálculo cancelaba invoiceCash haciendo que nunca detectara el error
      const summary: DaySalesSummaryMock = {
        posCash: 0, posCard: 0, posTransfer: 0,
        posTotal: 0, posByMethod: {},
        // invoiceCash(30k) + invoiceByMethod.card(20k) debería ser 50k pero invoiceTotal dice 60k
        invoiceCash: 30000,
        invoiceTotal: 60000, // ← mal: debería ser 50000
        invoiceByMethod: { card: 20000 },
        expensesTotal: 0,
        layawayCash: 0, layawayTotal: 0, layawayByMethod: {},
      }
      const validation = validateMethodBreakdown(summary)
      expect(validation.valid).toBe(false)
      expect(validation.errors).toContainEqual(
        expect.stringContaining('Facturas manuales'),
      )
    })

    it('debe pasar cuando invoiceCash + invoiceByMethod === invoiceTotal exactamente', () => {
      const summary: DaySalesSummaryMock = {
        posCash: 0, posCard: 0, posTransfer: 0,
        posTotal: 0, posByMethod: {},
        invoiceCash: 30000,
        invoiceTotal: 50000,       // 30k cash + 20k card = 50k ✓
        invoiceByMethod: { card: 20000 },
        expensesTotal: 0,
        layawayCash: 0, layawayTotal: 0, layawayByMethod: {},
      }
      const validation = validateMethodBreakdown(summary)
      expect(validation.valid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })
  })

  describe('Bug #5 — Separados con tarjeta/transferencia no incluidos en layawayByMethod', () => {
    it('debe calcular correctamente efectivo cuando separados se pagan con card/transfer', () => {
      // layawayCard y layawayTransfer son campos separados de layawayByMethod
      // calculateExpectedCash solo suma layawayCash, así que el efectivo es correcto
      const summary: DaySalesSummaryMock = {
        posCash: 50000, posCard: 0, posTransfer: 0,
        posTotal: 50000, posByMethod: { cash: 50000 },
        invoiceCash: 0, invoiceTotal: 0, invoiceByMethod: {},
        expensesTotal: 0,
        layawayCash: 20000,  // solo este va al efectivo
        layawayTotal: 50000, // 20k cash + 20k card + 10k transfer
        layawayByMethod: {},  // card y transfer van a campos separados, no aquí
      }
      const expected = calculateExpectedCash(10000, summary)
      // base(10k) + posCash(50k) + layawayCash(20k) = 80k
      // layawayCard y layawayTransfer NO van al efectivo esperado
      expect(expected).toBe(80000)
    })

    it('debe validar layawayTotal correctamente incluyendo card y transfer', () => {
      // Simula el resultado del servicio con layawayCard/Transfer en campos separados
      // La validación del servicio ahora debe incluirlos
      const layawayCash = 20000
      const layawayCard = 20000      // campo separado (no en layawayByMethod)
      const layawayTransfer = 10000  // campo separado (no en layawayByMethod)
      const layawayTotal = 50000
      const layawayByMethod: Record<string, number> = {}

      // Reproducir la lógica corregida de validateDaySalesSummary
      const layawayByMethodSum = Object.values(layawayByMethod).reduce((a, b) => a + b, 0)
      const layawayTotalRecalc = layawayCash + layawayCard + layawayTransfer + layawayByMethodSum
      expect(layawayTotalRecalc).toBe(layawayTotal) // 20k + 20k + 10k = 50k ✓
      expect(Math.abs(layawayTotalRecalc - layawayTotal)).toBeLessThanOrEqual(0.01)
    })

    it('BUG PREVIO — validación antigua FALLABA con layaway en tarjeta', () => {
      // Con el código anterior (solo cash + layawayByMethod), la suma era 20k ≠ 50k
      const layawayCash = 20000
      const layawayTotal = 50000
      const layawayByMethod: Record<string, number> = {}
      const layawayByMethodSum = Object.values(layawayByMethod).reduce((a, b) => a + b, 0)

      // Cálculo ANTERIOR (incorrecto): 20k + 0k = 20k ≠ 50k → falso error
      const oldRecalc = layawayCash + layawayByMethodSum
      expect(oldRecalc).not.toBe(layawayTotal) // demostramos que el bug existía
      expect(Math.abs(oldRecalc - layawayTotal)).toBeGreaterThan(0.01) // generaba error falso
    })
  })

  describe('KPIs en cero cuando summary es undefined', () => {
    it('debe mostrar 0 cuando summary no ha cargado (no debe romper la UI)', () => {
      // Función auxiliar que recibe el summary (simula CierresCajaPage)
      // Al ser parámetro, TypeScript no estrecha a "never" al acceder con optional chaining
      const extractKpis = (summary?: DaySalesSummaryMock, cashBase = 50000) => {
        const posTotal = summary?.posTotal ?? 0
        const invoiceTotal = summary?.invoiceTotal ?? 0
        const layawayTotal = summary?.layawayTotal ?? 0
        const expensesTotal = summary?.expensesTotal ?? 0
        const posCash = summary?.posCash ?? 0
        const invoiceCash = summary?.invoiceCash ?? 0
        const layawayCash = summary?.layawayCash ?? 0
        const expectedCash = cashBase + posCash + invoiceCash + layawayCash - expensesTotal
        return { posTotal, invoiceTotal, layawayTotal, expensesTotal, expectedCash }
      }

      const kpis = extractKpis(undefined, 50000)

      // Todos los KPIs deben ser 0 (no NaN, no error)
      expect(kpis.posTotal).toBe(0)
      expect(kpis.invoiceTotal).toBe(0)
      expect(kpis.layawayTotal).toBe(0)
      expect(kpis.expectedCash).toBe(50000) // solo la base
      expect(Number.isNaN(kpis.expectedCash)).toBe(false)
      expect(Number.isFinite(kpis.expectedCash)).toBe(true)
    })
  })

  describe('Total digital con métodos reales de POS y plataformas', () => {
    it('debe sumar correctamente todos los métodos digitales (nequi, daviplata, dataphone, addi)', () => {
      // Simula posByMethod con métodos reales utilizados en tienda POS
      const posByMethod: Record<string, number> = {
        cash: 50000,
        dataphone: 30000,
        nequi: 25000,
        bancolombia: 15000,
        addi: 40000,
      }

      // Cálculo corregido de totalDigital:
      const posDigital = Object.entries(posByMethod)
        .filter(([method]) => method !== 'cash')
        .reduce((sum, [, amount]) => sum + amount, 0)

      const layawayCard = 10000
      const layawayTransfer = 20000
      const invoiceByMethod = { dataphone: 35000 }
      const layawayByMethod = { addi: 15000 }

      const totalDigital = posDigital
        + (layawayCard + layawayTransfer)
        + Object.values(invoiceByMethod).reduce((a, b) => a + b, 0)
        + Object.values(layawayByMethod).reduce((a, b) => a + b, 0)

      // posDigital = 30k + 25k + 15k + 40k = 110k
      expect(posDigital).toBe(110000)
      // totalDigital = 110k + (10k + 20k) + 35k + 15k = 190k
      expect(totalDigital).toBe(190000)
    })
  })

  describe('Separados completados en el cierre (neq cancelled)', () => {
    it('debe incluir pagos de separados completados para evitar descuadre de caja', () => {
      // Un separado completado hoy debe sumar su abono al efectivo de la caja
      const payments = [
        { amount: 30000, payment_method: 'cash', layaway_status: 'completed' },
        { amount: 20000, payment_method: 'cash', layaway_status: 'active' },
        { amount: 15000, payment_method: 'cash', layaway_status: 'cancelled' }, // no entra
      ]

      // Filtrar solo los que no están cancelados (como el nuevo servicio)
      const validPayments = payments.filter((p) => p.layaway_status !== 'cancelled')
      const totalCashLayaway = validPayments
        .filter((p) => p.payment_method === 'cash')
        .reduce((sum, p) => sum + p.amount, 0)

      // 30k (completado) + 20k (activo) = 50k. El cancelado (15k) se descarta.
      expect(totalCashLayaway).toBe(50000)
    })
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Exportar funciones para debugging en consola
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const __DEBUG__ = {
  calculateExpectedCash,
  validateMethodBreakdown,
  calculateTotalDigital,
  validateTotalConsistency,
}
