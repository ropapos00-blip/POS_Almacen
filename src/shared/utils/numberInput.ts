export function parseDecimalInput(raw: string, fallback = 0) {
  const trimmed = raw.trim()
  if (!trimmed) {
    return fallback
  }

  const normalized = trimmed.replace(',', '.').replace(/[^\d.-]/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function parseIntegerInput(raw: string, fallback = 0) {
  const parsed = parseDecimalInput(raw, fallback)
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback
}

export function parseCopIntegerInput(raw: string, fallback = 0) {
  const digitsOnly = raw.replace(/[^\d]/g, '').trim()
  if (!digitsOnly) {
    return fallback
  }

  const parsed = Number(digitsOnly)
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback
}

export function formatCopInput(raw: string | number) {
  const value = typeof raw === 'number' ? String(Math.trunc(raw)) : raw
  const digitsOnly = value.replace(/[^\d]/g, '').trim()

  if (!digitsOnly) {
    return ''
  }

  const parsed = Number(digitsOnly)
  if (!Number.isFinite(parsed)) {
    return ''
  }

  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(parsed)
}
