import { describe, expect, it } from 'vitest'

import {
  formatAvailableDays,
  formatChangeBasisFootnote,
  formatCommonDaysBasis,
  formatCompactPeriod,
  formatDateTick,
  formatMissingDaysLabel,
  formatPercent,
  formatShortPeriod,
  formatUsdCompact,
  formatUsdFull,
  formatUsdTick,
  formatUsdSummary,
  formatVolumeChange,
  formatWeeklyDailyAverage,
} from './format'
import { daySchema } from '../model'

describe('chart axis formatting', () => {
  it('formats compact days, full dates, months and year boundaries separately', () => {
    const day = daySchema.parse('2024-07-30')
    expect(formatDateTick(day, 'day')).toBe('30')
    expect(formatDateTick(day, 'date')).toBe('30 июл.')
    expect(formatDateTick(day, 'month')).toBe('июль')
    expect(formatDateTick(daySchema.parse('2024-01-01'), 'year')).toBe('2024')
  })

  it('formats symlog ticks in compact USD units', () => {
    expect([1_000_000, 10_000_000, 100_000_000, 1_000_000_000].map(formatUsdTick)).toEqual(['$1M', '$10M', '$100M', '$1B'])
  })

  it('formats week-mode tooltip as daily average', () => {
    expect(formatWeeklyDailyAverage(517_000_000)).toBe('≈$517M/день')
    expect(formatWeeklyDailyAverage(100_000_000)).toBe('≈$100M/день')
  })
})

describe('compact chart tooltip dates', () => {
  it.each([
    ['2026-10-01', '2026-10-01', '01.10.26'],
    ['2026-06-22', '2026-06-28', '22.06.26 — 28.06.26'],
    ['2026-03-30', '2026-04-05', '30.03.26 — 05.04.26'],
    ['2026-04-27', '2026-05-03', '27.04.26 — 03.05.26'],
    ['2025-12-29', '2026-01-04', '29.12.25 — 04.01.26'],
  ])('formats %s through %s as %s', (start, end, expected) => {
    expect(formatCompactPeriod(daySchema.parse(start), daySchema.parse(end))).toBe(expected)
  })
})

describe('short tooltip period', () => {
  it.each([
    ['2025-11-24', '2025-11-30', '24–30 ноября 2025'],
    ['2023-02-20', '2023-02-26', '20–26 февраля 2023'],
    ['2026-03-02', '2026-03-08', '2–8 марта 2026'],
    ['2026-05-04', '2026-05-10', '4–10 мая 2026'],
    ['2026-04-20', '2026-04-26', '20–26 апреля 2026'],
    ['2026-10-01', '2026-10-01', '1 октября 2026'],
    ['2024-02-29', '2024-02-29', '29 февраля 2024'],
    ['2026-03-30', '2026-04-05', '30 марта 2026 — 5 апреля 2026'],
    ['2025-12-29', '2026-01-04', '29 декабря 2025 — 4 января 2026'],
  ])('formats %s through %s as %s', (start, end, expected) => {
    expect(formatShortPeriod(daySchema.parse(start), daySchema.parse(end))).toBe(expected)
  })
})

describe('summary formatting', () => {
  it.each([
    [2_161_633_016, '$2.16B'], [13_665_575_548, '$13.7B'],
    [2_161_633, '$2.16M'], [13_665, '$13.7K'], [100, '$100'], [0, '$0'],
    [24_500_000_000, '$24.5B'], [593_720_000, '$594M'],
    [939_000_000, '$939M'], [6_010_000, '$6.01M'],
  ])('formats %s with at most three significant digits as %s', (value, expected) => {
    expect(formatUsdSummary(value)).toBe(expected)
  })

  it('keeps compact and summary formatting identical', () => {
    const values = [
      0, 100, 13_665, 2_161_633, 6_010_000, 593_720_000, 939_000_000,
      1_505_409_073, 2_161_633_016, 13_665_575_548, 24_500_000_000,
    ]
    for (const value of values) {
      expect(formatUsdCompact(value)).toBe(formatUsdSummary(value))
    }
  })

  it('formats signed growth, decline and no change', () => {
    expect(formatVolumeChange(0.12)).toBe('+12%')
    expect(formatVolumeChange(-0.05)).toBe('-5%')
    expect(formatVolumeChange(-0.036)).toBe('-3.6%')
    expect(formatVolumeChange(0)).toBe('0%')
  })
})

describe('summary coverage formatting', () => {
  it('formats available days and common-day basis with Russian plurals', () => {
    expect(formatAvailableDays(17, 19)).toBe('17 из 19 дней')
    expect(formatCommonDaysBasis(17)).toBe('по 17 общим дням')
    expect(formatCommonDaysBasis(1)).toBe('по 1 общему дню')
  })

  it('collapses missing days into compact gap labels', () => {
    expect(formatMissingDaysLabel([daySchema.parse('2026-10-03'), daySchema.parse('2026-10-04')])).toBe('нет данных 3–4 окт.')
    expect(formatMissingDaysLabel([daySchema.parse('2024-02-29')])).toBe('нет данных 29 февр.')
  })

  it('formats change basis footnotes only when pairing is partial', () => {
    expect(formatChangeBasisFootnote(17, 17)).toBeNull()
    expect(formatChangeBasisFootnote(15, 17)).toBe('по 15 из 17 дней с прошлым периодом')
  })
})

describe('category volume formatting', () => {
  it('keeps compact amounts in cells and full currency amounts in titles', () => {
    expect(formatUsdCompact(1_505_409_073)).toBe('$1.51B')
    expect(formatUsdCompact(593_720_000)).toBe('$594M')
    expect(formatUsdFull(1_505_409_073)).toBe('$1,505,409,073')
    expect(formatUsdFull(190.84)).toBe('$190.84')
    expect(formatUsdFull(0)).toBe('$0')
  })

  it('formats shares from ratios with one decimal at most', () => {
    expect(formatPercent(0.521)).toBe('52.1%')
    expect(formatPercent(0.131)).toBe('13.1%')
    expect(formatPercent(1)).toBe('100%')
    expect(formatPercent(0)).toBe('0%')
  })
})
