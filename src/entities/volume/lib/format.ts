import type { Day } from '../model'

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const tickFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const compactDateFormatter = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' })
const monthFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'short', timeZone: 'UTC' })
const periodDateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' })
const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fullUsdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 })
const compactFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 })
const compactPreciseFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 })
const summaryUsdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumSignificantDigits: 3 })
const changeFormatter = new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' })
const percentFormatter = new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 1 })
const daysPlural = new Intl.PluralRules('ru-RU')
const dayForms: Record<string, string> = { one: 'день', few: 'дня', many: 'дней' }
const dayDativeForms: Record<string, string> = { one: 'дню', few: 'дням', many: 'дням' }

export function formatDaysCount(count: number) {
  return `${count} ${dayForms[daysPlural.select(count)] ?? 'дня'}`
}

export function formatDaysDative(count: number) {
  return `${count} ${dayDativeForms[daysPlural.select(count)] ?? 'дням'}`
}

export function formatDay(day: Day) {
  return dateFormatter.format(new Date(day))
}

export type DateTickFormat = 'day' | 'date' | 'month' | 'year'

export function formatDateTick(day: Day, format: DateTickFormat) {
  const date = new Date(day)
  switch (format) {
    case 'day': return String(date.getUTCDate())
    case 'date': return tickFormatter.format(date)
    case 'month': return monthFormatter.format(date)
    case 'year': return String(date.getUTCFullYear())
    default: {
      const exhaustive: never = format
      return exhaustive
    }
  }
}

export function formatUsd(value: number | null) {
  return value === null ? 'Нет данных' : usdFormatter.format(value)
}

export function formatUsdFull(value: number) {
  return fullUsdFormatter.format(value)
}

export function formatUsdTick(value: number) {
  return compactFormatter.format(value)
}

export function formatUsdCompact(value: number) {
  return compactPreciseFormatter.format(value)
}

export function formatUsdSummary(value: number) {
  return summaryUsdFormatter.format(value)
}

export function formatVolumeChange(value: number) {
  return changeFormatter.format(value)
}

export function formatPercent(value: number) {
  return percentFormatter.format(value)
}

export function formatShare(value: number) {
  return value > 0 && value < 0.001 ? '<0,1\u00a0%' : formatPercent(value)
}

export function formatShortPeriod(start: Day, end: Day) {
  const first = new Date(start)
  const last = new Date(end)
  if (first.getUTCFullYear() === last.getUTCFullYear() && first.getUTCMonth() === last.getUTCMonth()) {
    const prefix = start === end ? '' : `${first.getUTCDate()}–`
    return `${prefix}${periodDateFormatter.format(last)} ${last.getUTCFullYear()}`
  }
  return `${periodDateFormatter.format(first)} ${first.getUTCFullYear()} — ${periodDateFormatter.format(last)} ${last.getUTCFullYear()}`
}

export function formatPeriod(start: Day, end: Day) {
  return start === end ? formatDay(start) : `${formatDay(start)} — ${formatDay(end)}`
}

export function formatCompactPeriod(start: Day, end: Day) {
  const first = compactDateFormatter.format(new Date(start))
  return start === end ? first : `${first} — ${compactDateFormatter.format(new Date(end))}`
}
