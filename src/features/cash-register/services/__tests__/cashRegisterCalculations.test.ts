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
  const invoiceByMethodSum = Object.values(summary.invoiceByMethod).reduce((a, b) => a + b, 0)
  const invoiceCashFromMethod = summary.invoiceByMethod['cash'] ?? 0
  const totalInvoiceByMethod = invoiceCashFromMethod + invoiceByMethodSum - invoiceCashFromMethod

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
      expect(validation.errors).toContain(
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
// Exportar funciones para debugging en consola
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const __DEBUG__ = {
  calculateExpectedCash,
  validateMethodBreakdown,
  calculateTotalDigital,
  validateTotalConsistency,
}
