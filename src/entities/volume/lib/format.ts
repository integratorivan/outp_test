import { shiftDay, windowDays } from '../dashboard/dashboard'
import type { Day } from '../model'

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const tickFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const compactDateFormatter = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' })
const monthFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'short', timeZone: 'UTC' })
const periodDateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' })
const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fullUsdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 })
const compactFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 })
const compactUsdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumSignificantDigits: 3 })
const changeFormatter = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' })
const percentFormatter = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 })
const daysPlural = new Intl.PluralRules('ru-RU')
const dayForms: Record<string, string> = { one: 'день', few: 'дня', many: 'дней' }
const commonDayForms: Record<string, string> = { one: 'общему дню', few: 'общим дням', many: 'общим дням' }

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
  return compactUsdFormatter.format(value)
}

export function formatUsdSummary(value: number) {
  return compactUsdFormatter.format(value)
}

export function formatVolumeChange(value: number) {
  return changeFormatter.format(value)
}

export function formatPercent(value: number) {
  return percentFormatter.format(value)
}

export function formatShare(value: number) {
  return value > 0 && value < 0.001 ? '<0.1%' : formatPercent(value)
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

function formatMissingRange(start: Day, end: Day) {
  const first = new Date(start)
  const last = new Date(end)
  if (start === end) return `${tickFormatter.format(first)} ${first.getUTCFullYear()}`
  if (first.getUTCFullYear() === last.getUTCFullYear() && first.getUTCMonth() === last.getUTCMonth()) {
    return `${first.getUTCDate()}–${tickFormatter.format(last)} ${last.getUTCFullYear()}`
  }
  return `${tickFormatter.format(first)} ${first.getUTCFullYear()} — ${tickFormatter.format(last)} ${last.getUTCFullYear()}`
}

export function formatAvailableDays(available: number, expected: number) {
  return `${available} из ${expected} ${dayForms[daysPlural.select(expected)] ?? 'дней'}`
}

function shortMonthDay(day: Day) {
  return tickFormatter.format(new Date(day)).replace(/\.$/, '')
}

/** Caption above a weekly chart: `недели 31 авг – 4 окт`. */
export function formatWeekChartCaption(start: Day, end: Day) {
  const first = new Date(start)
  const last = new Date(end)
  if (first.getUTCFullYear() === last.getUTCFullYear()) return `недели ${shortMonthDay(start)} – ${shortMonthDay(end)}`
  return `недели ${shortMonthDay(start)} ${first.getUTCFullYear()} – ${shortMonthDay(end)} ${last.getUTCFullYear()}`
}

/** Sidebar period: `19 сент – 3 окт 2026 · 15 дн.` */
export function formatSidebarPeriod(start: Day, end: Day) {
  const first = new Date(start)
  const last = new Date(end)
  const sameYear = first.getUTCFullYear() === last.getUTCFullYear()
  const sameMonth = sameYear && first.getUTCMonth() === last.getUTCMonth()
  const days = `${windowDays({ from: start, to: end })} дн.`
  if (start === end) return `${shortMonthDay(start)} ${last.getUTCFullYear()} · ${days}`
  if (sameMonth) {
    const month = shortMonthDay(end).replace(/^\d+\s/, '')
    return `${first.getUTCDate()}–${last.getUTCDate()} ${month} ${last.getUTCFullYear()} · ${days}`
  }
  if (sameYear) return `${shortMonthDay(start)} – ${shortMonthDay(end)} ${last.getUTCFullYear()} · ${days}`
  return `${shortMonthDay(start)} ${first.getUTCFullYear()} – ${shortMonthDay(end)} ${last.getUTCFullYear()} · ${days}`
}

export function formatPlatformWeekDays(platform: string, days: number) {
  return `${platform}: ${days} из 7 дн.`
}

export function formatMissingDaysLabel(missingDays: readonly Day[]) {
  if (missingDays.length === 0) return null
  const ranges: string[] = []
  let start = missingDays[0]!
  let end = start
  for (let index = 1; index < missingDays.length; index++) {
    const day = missingDays[index]!
    if (shiftDay(end, 1) === day) {
      end = day
      continue
    }
    ranges.push(formatMissingRange(start, end))
    start = day
    end = day
  }
  ranges.push(formatMissingRange(start, end))
  return `нет данных ${ranges.join(', ')}`
}

export function formatCommonDaysBasis(count: number) {
  return `по ${count} ${commonDayForms[daysPlural.select(count)] ?? 'общим дням'}`
}

export function formatChangeBasisFootnote(changeBasisDays: number, availablePoints: number) {
  if (changeBasisDays >= availablePoints) return null
  return `по ${changeBasisDays} из ${availablePoints} ${dayForms[daysPlural.select(availablePoints)] ?? 'дней'} с прошлым периодом`
}
