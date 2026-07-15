const COLOMBIA_TIME_ZONE = 'America/Bogota'

function parseIsoDateParts(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map((part) => Number(part))

  if (!year || !month || !day) {
    throw new Error(`Fecha invalida: ${isoDate}`)
  }

  return { year, month, day }
}

function toIsoDateFromUtcParts(date: Date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getTodayIsoDateColombia() {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: COLOMBIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

  return formatted
}

export function addDaysToIsoDate(isoDate: string, days: number) {
  const { year, month, day } = parseIsoDateParts(isoDate)
  const utcDate = new Date(Date.UTC(year, month - 1, day))
  utcDate.setUTCDate(utcDate.getUTCDate() + days)
  return toIsoDateFromUtcParts(utcDate)
}

export function startOfWeekIsoDate(isoDate: string) {
  const { year, month, day } = parseIsoDateParts(isoDate)
  const utcDate = new Date(Date.UTC(year, month - 1, day))
  const weekday = utcDate.getUTCDay()
  const diff = weekday === 0 ? -6 : 1 - weekday
  utcDate.setUTCDate(utcDate.getUTCDate() + diff)
  return toIsoDateFromUtcParts(utcDate)
}

export function toUtcIsoStartOfColombiaDay(isoDate: string) {
  const { year, month, day } = parseIsoDateParts(isoDate)
  const utcMillis = Date.UTC(year, month - 1, day, 5, 0, 0, 0)
  return new Date(utcMillis).toISOString()
}

export function toUtcIsoEndOfColombiaDay(isoDate: string) {
  const { year, month, day } = parseIsoDateParts(isoDate)
  const utcMillis = Date.UTC(year, month - 1, day + 1, 4, 59, 59, 999)
  return new Date(utcMillis).toISOString()
}

export function startOfMonthIsoDate(isoDate: string) {
  const { year, month } = parseIsoDateParts(isoDate)
  const utcDate = new Date(Date.UTC(year, month - 1, 1))
  return toIsoDateFromUtcParts(utcDate)
}

export function endOfMonthIsoDate(isoDate: string) {
  const { year, month } = parseIsoDateParts(isoDate)
  const utcDate = new Date(Date.UTC(year, month, 0))
  return toIsoDateFromUtcParts(utcDate)
}

/** Suma/resta meses a una fecha ISO. Pensado para usarse sobre el dia 1 del mes (evita desbordes de dia). */
export function addMonthsToIsoDate(isoDate: string, months: number) {
  const { year, month, day } = parseIsoDateParts(isoDate)
  const utcDate = new Date(Date.UTC(year, month - 1 + months, day))
  return toIsoDateFromUtcParts(utcDate)
}

export function formatMonthLabelColombia(isoDate: string) {
  const { year, month } = parseIsoDateParts(isoDate)
  const utcDate = new Date(Date.UTC(year, month - 1, 1, 12))
  const label = new Intl.DateTimeFormat('es-CO', {
    timeZone: COLOMBIA_TIME_ZONE,
    month: 'long',
    year: 'numeric',
  }).format(utcDate)
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function formatDateTimeColombia(value: string | Date) {
  return new Date(value).toLocaleString('es-CO', { timeZone: COLOMBIA_TIME_ZONE })
}

export function formatDateColombia(value: string | Date) {
  return new Date(value).toLocaleDateString('es-CO', { timeZone: COLOMBIA_TIME_ZONE })
}
