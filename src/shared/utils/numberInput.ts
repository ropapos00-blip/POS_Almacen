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
