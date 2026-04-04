export function normalizeOptionalText(value?: string) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function makeSku(productName: string, size: string, color: string) {
  const p = productName
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, 'X')
  const s = size.replace(/\s+/g, '').toUpperCase()
  const c = color
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 3)
    .padEnd(3, 'X')

  return `${p}-${s}-${c}-${Date.now().toString().slice(-4)}`
}

export function makeBarcode() {
  const base = `${Date.now()}${Math.floor(Math.random() * 100000)}`
  return base.slice(-13)
}
