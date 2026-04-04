const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

export function formatCop(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0
  return copFormatter.format(safeValue)
}
