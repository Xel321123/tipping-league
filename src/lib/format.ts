import type { MatchStatus, Sign } from './types'

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const DATE_ONLY = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const DAY_MONTH = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
})

const TIME_ONLY = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return DATE_TIME.format(date)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return DATE_ONLY.format(date)
}

export function formatDayMonth(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return DAY_MONTH.format(date)
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return TIME_ONLY.format(date)
}

export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${value.toFixed(1)}%`
}

export function formatRows(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString('en-GB')
}

/** Swedish kronor, no decimals unless the amount actually has öre. */
export function formatSek(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const hasOre = Math.round(value * 100) % 100 !== 0
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: hasOre ? 2 : 0,
    minimumFractionDigits: hasOre ? 2 : 0,
  }).format(value)
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return 'never'
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return 'never'
  const diff = Date.now() - then
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

/** "in 3h 20m" / "live now" / "42m ago" — used for kickoff countdowns. */
export function untilLabel(value: string | null | undefined): string {
  if (!value) return 'TBC'
  const target = new Date(value).getTime()
  if (Number.isNaN(target)) return 'TBC'
  const diff = target - Date.now()
  if (diff <= 0) return 'started'
  const minutes = Math.round(diff / 60000)
  if (minutes < 60) return `in ${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours < 24) return rest ? `in ${hours}h ${rest}m` : `in ${hours}h`
  return `in ${Math.round(hours / 24)}d`
}

export function signLabel(sign: Sign): string {
  return sign === 'X' ? 'X' : sign
}

export function matchStatusLabel(status: MatchStatus): string {
  switch (status) {
    case 'live':
      return 'Live'
    case 'finished':
      return 'FT'
    case 'cancelled':
      return 'Void'
    default:
      return 'Upcoming'
  }
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return count === 1 ? singular : (pluralForm ?? `${singular}s`)
}

export function titleCase(value: string): string {
  return value
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

/** ISO timestamp -> value for <input type="datetime-local"> in local time. */
export function toDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** <input type="datetime-local"> value -> ISO timestamp (UTC). */
export function fromDateTimeInput(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}
