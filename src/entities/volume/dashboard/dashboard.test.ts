import { describe, expect, it } from 'vitest'

import { dashboardCategories } from '../categories'
import {
  clampWindow,
  countCompleteWeeks,
  displayedGranularity,
  isCompleteCalendarWeek,
  matchWindowPreset,
  panWindow,
  parseDashboardFilters,
  presetWindow,
  resolveVolumeWindow,
  selectCategoryDashboard,
  selectHistoryBounds,
  selectVolumeDashboard,
  selectVolumeSummarySelection,
  serializeDashboardFilters,
  shiftDay,
  windowDays,
  zoomWindow,
  type DashboardFilters,
  type VolumeWindow,
} from './dashboard'
import { daySchema, type DashboardVolumeRow, type Platform } from '../model'
import type { DashboardCategory } from '../categories'
import { selectCategoryBreakdown } from '../select/selectors'
import { selectVolumeSummary } from '../select/summary'

const defaults: DashboardFilters = { from: null, to: null, range: null, categories: dashboardCategories, view: 'platforms', scale: 'linear', granularity: 'day' }
function row(day: string, platform: Platform = 'kalshi', volumeUsd = 10, category: DashboardCategory = 'sports'): DashboardVolumeRow {
  return { day: daySchema.parse(day), platform, category, volumeUsd }
}
function history(start: string, count: number) {
  return Array.from({ length: count }, (_, index) => row(shiftDay(daySchema.parse(start), index)))
}
function boundsOf(rows: readonly DashboardVolumeRow[]) {
  const bounds = selectHistoryBounds(rows)
  if (!bounds) throw new Error('Expected history bounds')
  return bounds
}
function preset(rows: readonly DashboardVolumeRow[], range: '7d' | '30d' | '90d' | 'all') {
  return presetWindow(range, boundsOf(rows))
}
function select(
  rows: readonly DashboardVolumeRow[],
  window: VolumeWindow | null,
  categories: readonly DashboardCategory[] = dashboardCategories,
  granularity: 'day' | 'week' = 'day',
) {
  return selectVolumeDashboard(rows, categories, window, granularity)
}

describe('dashboard URL filters', () => {
  it('defaults to the implicit 30-day window and all categories', () => {
    expect(parseDashboardFilters('')).toEqual(defaults)
    expect(parseDashboardFilters('?range=garbage')).toEqual(defaults)
  })

  it('parses an explicit window and ignores it when invalid or inverted', () => {
    expect(parseDashboardFilters('?from=2026-09-01&to=2026-09-30')).toEqual({
      ...defaults,
      from: daySchema.parse('2026-09-01'),
      to: daySchema.parse('2026-09-30'),
    })
    expect(parseDashboardFilters('?from=2026-09-01')).toEqual(defaults)
    expect(parseDashboardFilters('?from=garbage&to=2026-09-30')).toEqual(defaults)
    expect(parseDashboardFilters('?from=2026-09-30&to=2026-09-01')).toEqual(defaults)
  })

  it('keeps legacy range links parseable', () => {
    expect(parseDashboardFilters('?range=90d')).toEqual({ ...defaults, range: '90d' })
    expect(parseDashboardFilters('?range=all')).toEqual({ ...defaults, range: 'all' })
  })

  it('distinguishes an omitted category parameter from an empty selection', () => {
    expect(parseDashboardFilters('?categories=')).toEqual({ ...defaults, categories: [] })
    expect(serializeDashboardFilters({ ...defaults, categories: [] })).toBe('?categories=')
  })

  it('validates, deduplicates, and orders categories', () => {
    expect(parseDashboardFilters('?range=90d&categories=crypto,sports,crypto,unknown').categories).toEqual(['sports', 'crypto'])
    expect(parseDashboardFilters('?categories=unknown').categories).toEqual([])
  })

  it('writes the explicit window, drops the legacy range and preserves unrelated parameters', () => {
    const filters: DashboardFilters = {
      ...defaults,
      from: daySchema.parse('2026-09-01'),
      to: daySchema.parse('2026-09-30'),
      categories: ['politics', 'sports'],
    }
    const search = serializeDashboardFilters(filters, '?campaign=test&categories=health&range=all&g=week')
    expect(search).toBe('?campaign=test&categories=sports%2Cpolitics&from=2026-09-01&to=2026-09-30')
    expect(parseDashboardFilters(search)).toEqual({ ...filters, categories: ['sports', 'politics'] })
  })

  it('keeps a legacy range until a window replaces it', () => {
    expect(serializeDashboardFilters({ ...defaults, range: 'all' })).toBe('?range=all')
    expect(serializeDashboardFilters({ ...defaults, range: '30d' })).toBe('')
    expect(serializeDashboardFilters(defaults, '?range=all&g=week&campaign=test')).toBe('?campaign=test')
  })

  it('validates view, scale and chart granularity at the URL boundary', () => {
    expect(parseDashboardFilters('?view=categories')).toEqual({ ...defaults, view: 'categories' })
    expect(parseDashboardFilters('?view=invalid&g=invalid')).toEqual(defaults)
    expect(parseDashboardFilters('?scale=symlog')).toEqual({ ...defaults, scale: 'symlog' })
    expect(parseDashboardFilters('?scale=invalid')).toEqual(defaults)
    expect(serializeDashboardFilters({ ...defaults, scale: 'symlog' })).toBe('?scale=symlog')
    expect(serializeDashboardFilters({ ...defaults, scale: 'symlog' }, '?scale=symlog')).toBe('?scale=symlog')
    expect(parseDashboardFilters('?g=week')).toEqual({ ...defaults, granularity: 'week' })
    expect(parseDashboardFilters('?g=day')).toEqual(defaults)
    expect(serializeDashboardFilters({ ...defaults, granularity: 'week' })).toBe('?g=week')
    expect(serializeDashboardFilters({ ...defaults, granularity: 'week' }, '?g=week')).toBe('?g=week')
    expect(serializeDashboardFilters(defaults, '?g=week')).toBe('')
  })
})

describe('volume window resolution', () => {
  const rows = history('2026-01-01', 100)
  const bounds = boundsOf(rows)

  it('resolves the implicit default to 30 days ending at the last source day', () => {
    expect(resolveVolumeWindow(defaults, bounds)).toEqual({ from: '2026-03-12', to: '2026-04-10' })
  })

  it('converts legacy ranges and explicit windows, clamping to the history', () => {
    expect(resolveVolumeWindow({ ...defaults, range: '7d' }, bounds)).toEqual({ from: '2026-04-04', to: '2026-04-10' })
    expect(resolveVolumeWindow({ ...defaults, range: 'all' }, bounds)).toEqual({ from: '2026-01-01', to: '2026-04-10' })
    expect(resolveVolumeWindow({ ...defaults, from: daySchema.parse('2026-02-01'), to: daySchema.parse('2026-02-20') }, bounds)).toEqual({ from: '2026-02-01', to: '2026-02-20' })
    expect(resolveVolumeWindow({ ...defaults, from: daySchema.parse('2025-01-01'), to: daySchema.parse('2026-02-01') }, bounds)).toEqual({ from: '2026-01-01', to: '2026-02-01' })
  })

  it('enforces the 7-day minimum inside the history', () => {
    expect(clampWindow({ from: daySchema.parse('2026-02-10'), to: daySchema.parse('2026-02-12') }, bounds)).toEqual({ from: '2026-02-06', to: '2026-02-12' })
    expect(clampWindow({ from: bounds.firstDay, to: daySchema.parse('2026-01-03') }, bounds)).toEqual({ from: '2026-01-01', to: '2026-01-07' })
    expect(clampWindow({ from: daySchema.parse('2025-12-20'), to: daySchema.parse('2025-12-25') }, bounds)).toEqual({ from: '2026-01-01', to: '2026-01-07' })
    expect(clampWindow({ from: daySchema.parse('2026-05-01'), to: daySchema.parse('2026-05-03') }, bounds)).toEqual({ from: '2026-04-04', to: '2026-04-10' })
  })

  it('matches presets only on exact windows', () => {
    expect(matchWindowPreset(preset(rows, '30d'), bounds)).toBe('30d')
    expect(matchWindowPreset(preset(rows, 'all'), bounds)).toBe('all')
    expect(matchWindowPreset({ from: daySchema.parse('2026-03-12'), to: daySchema.parse('2026-04-10') }, bounds)).toBe('30d')
    expect(matchWindowPreset({ from: daySchema.parse('2026-03-11'), to: daySchema.parse('2026-04-10') }, bounds)).toBeNull()
    expect(matchWindowPreset({ from: daySchema.parse('2026-03-12'), to: daySchema.parse('2026-04-09') }, bounds)).toBeNull()
  })

  it('pans without changing length and stops at the edges', () => {
    const window = preset(rows, '30d')
    expect(panWindow(window, bounds, -10)).toEqual({ from: '2026-03-02', to: '2026-03-31' })
    expect(panWindow(window, bounds, 10)).toEqual(window)
    expect(panWindow(window, bounds, -1000)).toEqual({ from: '2026-01-01', to: '2026-01-30' })
  })

  it('zooms around the anchor day within the 7-day minimum and the full history', () => {
    const window = preset(rows, '30d')
    const zoomed = zoomWindow(window, bounds, daySchema.parse('2026-03-26'), 1 / 1.2)
    expect(windowDays(zoomed)).toBe(25)
    expect(zoomed.from <= '2026-03-26' && zoomed.to >= '2026-03-26').toBe(true)
    const zoomedOut = zoomWindow(window, bounds, daySchema.parse('2026-03-26'), 100)
    expect(zoomedOut).toEqual({ from: bounds.firstDay, to: bounds.lastDay })
    const zoomedIn = zoomWindow(window, bounds, daySchema.parse('2026-03-26'), 0.001)
    expect(windowDays(zoomedIn)).toBe(7)
  })
})

describe('volume dashboard selection', () => {
  it.each([['7d', 7], ['30d', 30], ['90d', 90]] as const)('selects %s inclusive UTC calendar days from the latest source date', (range, count) => {
    const rows = history('2024-01-01', 100)
    const result = select(rows, preset(rows, range))
    expect(result.points).toHaveLength(count)
    expect(result.period?.endDay).toBe('2024-04-09')
    expect(result.period?.startDay).toBe(shiftDay(daySchema.parse('2024-04-09'), 1 - count))
    expect(result.points.at(-1)?.day).toBe('2024-04-09')
  })

  it('selects an arbitrary custom window', () => {
    const rows = history('2024-01-01', 100)
    const result = select(rows, { from: daySchema.parse('2024-02-10'), to: daySchema.parse('2024-02-21') })
    expect(result.granularity).toBe('day')
    expect(result.points).toHaveLength(12)
    expect(result.period).toEqual({ startDay: '2024-02-10', endDay: '2024-02-21' })
  })

  it('uses calendar UTC through leap day and daylight-saving boundaries', () => {
    expect(shiftDay(daySchema.parse('2024-03-01'), -1)).toBe('2024-02-29')
    const rows = history('2024-01-01', 73)
    const result = select(rows, preset(rows, '7d'))
    expect(result.points.map((point) => point.day)).toEqual(['2024-03-07', '2024-03-08', '2024-03-09', '2024-03-10', '2024-03-11', '2024-03-12', '2024-03-13'])
  })

  it('preserves confirmed zeroes, missing platforms and missing calendar days', () => {
    const rows = [row('2026-09-28', 'kalshi', 0), row('2026-09-30', 'polymarket', 20)]
    const result = select(rows, preset(rows, '7d'))
    expect(result.points.slice(-3)).toEqual([
      { day: '2026-09-28', endDay: '2026-09-28', kalshi: 0, polymarket: null },
      { day: '2026-09-29', endDay: '2026-09-29', kalshi: null, polymarket: null },
      { day: '2026-09-30', endDay: '2026-09-30', kalshi: null, polymarket: 20 },
    ])
  })

  it('filters categories without changing date coverage or input', () => {
    const rows = [row('2026-10-01'), { ...row('2026-10-01'), category: 'politics', volumeUsd: 7 }] satisfies DashboardVolumeRow[]
    const before = structuredClone(rows)
    expect(select(rows, preset(rows, '30d'), ['politics']).points.at(-1)?.kalshi).toBe(7)
    expect(select(rows, preset(rows, '30d'), ['health']).points.at(-1)?.kalshi).toBe(0)
    expect(rows).toEqual(before)
  })

  it('distinguishes empty source history from empty category selection', () => {
    expect(select([], null)).toEqual({ points: [], granularity: 'day', period: null })
    const rows = history('2026-09-28', 7)
    const selected = select(rows, preset(rows, 'all'), [])
    expect(selected.points).toEqual([])
    expect(selected.period).not.toBeNull()
  })

  it('keeps daily granularity for full-history windows by default', () => {
    const rows = history('2026-09-28', 7)
    const result = select(rows, preset(rows, 'all'))
    expect(result.granularity).toBe('day')
    expect(result.points).toHaveLength(7)
    expect(result.period).toEqual({ startDay: '2026-09-28', endDay: '2026-10-04' })
  })

  it.each([['7d', 7], ['30d', 30], ['90d', 90]] as const)('keeps daily granularity for %s windows', (range, count) => {
    const rows = history('2026-01-01', 100)
    const result = select(rows, preset(rows, range))
    expect(result.granularity).toBe('day')
    expect(result.points).toHaveLength(count)
    expect(result.points.every((point) => point.day === point.endDay)).toBe(true)
  })

  it('sums complete Monday–Sunday weeks and drops calendar edges', () => {
    const rows = history('2026-01-01', 100).flatMap((item, index) => [
      { ...item, volumeUsd: index + 1 },
      { ...item, platform: 'polymarket', volumeUsd: (index + 1) * 2 } satisfies DashboardVolumeRow,
    ])
    const weekly = select(rows, preset(rows, 'all'), dashboardCategories, 'week')
    expect(weekly.granularity).toBe('week')
    expect(weekly.points[0]?.day).toBe('2026-01-05')
    expect(weekly.points.at(-1)?.endDay).toBe('2026-04-05')
    expect(weekly.points.every(isCompleteCalendarWeek)).toBe(true)
    for (const week of weekly.points) {
      const days = rows.filter((row) => row.day >= week.day && row.day <= week.endDay)
      expect(days).toHaveLength(14)
      const kalshiDays = days.filter((row) => row.platform === 'kalshi')
      const polymarketDays = days.filter((row) => row.platform === 'polymarket')
      const kalshiTotal = kalshiDays.reduce((sum, row) => sum + row.volumeUsd, 0)
      const polymarketTotal = polymarketDays.reduce((sum, row) => sum + row.volumeUsd, 0)
      expect(week).toMatchObject({
        kalshi: kalshiTotal,
        polymarket: polymarketTotal,
        kalshiDays: kalshiDays.length,
        polymarketDays: polymarketDays.length,
        kalshiTotal,
        polymarketTotal,
      })
    }
    const breakdown = selectCategoryBreakdown(rows, weekly.period ?? {})
    expect(breakdown.rows[0]?.total).toBe(weekly.points.reduce((sum, point) => sum + (point.kalshi ?? 0) + (point.polymarket ?? 0), 0))
  })

  it('preserves missing calendar days, platform gaps and confirmed zeros in weekly sums', () => {
    const kalshi = history('2026-01-01', 100).filter((item) => item.day !== '2026-03-18')
    const polymarket = history('2026-01-01', 100).map((item) => ({ ...item, platform: 'polymarket', volumeUsd: 0 } satisfies DashboardVolumeRow))
    const rows = [...kalshi, ...polymarket]
    const result = select(rows, preset(rows, 'all'), dashboardCategories, 'week')
    expect(result.points.find((point) => point.day === '2026-03-16')).toEqual({
      day: '2026-03-16',
      endDay: '2026-03-22',
      kalshi: 60,
      polymarket: 0,
      kalshiDays: 6,
      polymarketDays: 7,
      kalshiTotal: 60,
      polymarketTotal: 0,
      partial: true,
      partialPlatforms: ['kalshi'],
    })
    const gap = select(kalshi, preset(kalshi, 'all'), dashboardCategories, 'week')
    expect(gap.points.find((point) => point.day === '2026-03-16')).toMatchObject({ kalshi: 60, kalshiTotal: 60, partial: true, partialPlatforms: ['kalshi'] })
    expect(gap.points.every((point) => point.polymarket === null)).toBe(true)
    expect(gap.points.some((point) => point.kalshi === 70)).toBe(true)
  })

  it('drops calendar-incomplete weeks at both edges of all available history', () => {
    const rows = history('2026-01-01', 181)
    const result = select(rows, preset(rows, 'all'), dashboardCategories, 'week')
    expect(result.granularity).toBe('week')
    expect(result.points[0]).toMatchObject({ day: '2026-01-05', endDay: '2026-01-11', kalshi: 70, kalshiDays: 7, kalshiTotal: 70 })
    expect(result.points.at(-1)).toMatchObject({ day: '2026-06-22', endDay: '2026-06-28', kalshi: 70, kalshiDays: 7 })
    expect(result.points.every(isCompleteCalendarWeek)).toBe(true)
    expect(result.period).toEqual({ startDay: '2026-01-05', endDay: '2026-06-28' })
    const displayedTotal = rows.filter((item) => result.period && item.day >= result.period.startDay && item.day <= result.period.endDay).reduce((total, item) => total + item.volumeUsd, 0)
    expect(result.points.reduce((total, point) => total + (point.kalshi ?? 0), 0)).toBe(displayedTotal)
    expect(displayedTotal).toBe(1750)
  })

  it('shifts the week grid back to Monday using days already loaded before the window', () => {
    const rows = history('2026-09-01', 40)
    const window = { from: daySchema.parse('2026-09-16'), to: daySchema.parse('2026-10-04') }
    const result = select(rows, window, dashboardCategories, 'week')
    const firstWeek = result.points[0]
    expect(firstWeek).toMatchObject({ day: '2026-09-14', endDay: '2026-09-20', kalshi: 70, kalshiDays: 7 })
    if (!firstWeek) throw new Error('Expected the Monday week')
    expect(firstWeek.day < window.from).toBe(true)
    expect(result.points.at(-1)?.endDay).toBe('2026-10-04')
    expect(result.points.every(isCompleteCalendarWeek)).toBe(true)
    expect(countCompleteWeeks(window, boundsOf(rows))).toBe(result.points.length)
  })

  it('keeps complete boundary weeks when the source already starts Monday and ends Sunday', () => {
    const rows = history('2026-01-05', 182)
    const result = select(rows, preset(rows, 'all'), dashboardCategories, 'week')
    expect(result.points).toHaveLength(26)
    expect(result.period).toEqual({ startDay: '2026-01-05', endDay: '2026-07-05' })
    expect(result.points.reduce((total, point) => total + (point.kalshiTotal ?? 0), 0)).toBe(1820)
  })

  it('uses the same weekly period with category filters and with no categories selected', () => {
    const rows = history('2026-01-01', 181)
    const window = preset(rows, 'all')
    const normal = select(rows, window, dashboardCategories, 'week')
    const filtered = select(rows, window, ['politics'], 'week')
    const empty = select(rows, window, [], 'week')
    expect(filtered.period).toEqual(normal.period)
    expect(filtered.points.every((point) => point.kalshi === 0)).toBe(true)
    expect(empty.period).toEqual(normal.period)
    expect(empty.points).toEqual([])
  })

  it('keeps category breakdown totals, ranking and shares independent of chart category filters', () => {
    const rows = [
      ...history('2026-09-01', 30),
      { ...row('2026-09-30', 'polymarket', 50), category: 'politics' },
    ] satisfies DashboardVolumeRow[]
    const normal = select(rows, preset(rows, '7d'))
    const filtered = select(rows, preset(rows, '7d'), ['politics'])
    const empty = select(rows, preset(rows, '7d'), [])
    const breakdown = selectCategoryBreakdown(rows, normal.period ?? {})
    expect(selectCategoryBreakdown(rows, filtered.period ?? {})).toEqual(breakdown)
    expect(selectCategoryBreakdown(rows, empty.period ?? {})).toEqual(breakdown)
    expect(breakdown.rows[0]).toEqual({ category: 'sports', kalshi: 70, polymarket: null, total: 70, share: 70 / 120 })
  })

  it('includes both history edges in category totals and weekly chart totals', () => {
    const rows = history('2026-01-01', 181)
    const selection = select(rows, preset(rows, 'all'))
    const breakdown = selectCategoryBreakdown(rows, selection.period ?? {})
    expect(breakdown.rows[0]?.total).toBe(1810)
    expect(breakdown.rows[0]?.total).toBe(selection.points.reduce((sum, point) => sum + (point.kalshi ?? 0), 0))
  })

  it('keeps a known weekly platform sum and marks it partial when a day is missing', () => {
    const rows = history('2026-01-01', 181).filter((item) => item.day !== '2026-01-07')
    rows.push(...history('2026-01-01', 181).map((item) => ({ ...item, platform: 'polymarket' } satisfies DashboardVolumeRow)))
    const week = select(rows, preset(rows, 'all'), dashboardCategories, 'week').points.find((point) => point.day === '2026-01-05')
    expect(week).toMatchObject({
      kalshi: 60,
      polymarket: 70,
      kalshiDays: 6,
      polymarketDays: 7,
      kalshiTotal: 60,
      polymarketTotal: 70,
      partial: true,
      partialPlatforms: ['kalshi'],
    })
  })

  it('keeps a calendar-complete week with a source hole and drops the unfinished week after it', () => {
    const days = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-05'] as const
    const rows = days.flatMap((day) => [row(day, 'kalshi', 10), row(day, 'polymarket', 5)])
    const result = select(rows, preset(rows, 'all'), dashboardCategories, 'week')
    expect(result.points).toEqual([
      {
        day: '2026-09-28',
        endDay: '2026-10-04',
        kalshi: 40,
        polymarket: 20,
        kalshiDays: 4,
        polymarketDays: 4,
        kalshiTotal: 40,
        polymarketTotal: 20,
        partial: true,
        partialPlatforms: ['kalshi', 'polymarket'],
      },
    ])
  })

  it('enables week mode only from three complete weeks', () => {
    const bounds = { firstDay: daySchema.parse('2026-01-01'), lastDay: daySchema.parse('2026-10-06') }
    const twoWeeks = { from: daySchema.parse('2026-09-16'), to: daySchema.parse('2026-09-30') }
    const threeWeeks = { from: daySchema.parse('2026-09-14'), to: daySchema.parse('2026-10-04') }
    expect(countCompleteWeeks(twoWeeks, bounds)).toBe(2)
    expect(countCompleteWeeks(threeWeeks, bounds)).toBe(3)
    expect(displayedGranularity('week', countCompleteWeeks(twoWeeks, bounds))).toBe('day')
    expect(displayedGranularity('week', countCompleteWeeks(threeWeeks, bounds))).toBe('week')
    expect(displayedGranularity('day', 0)).toBe('day')
    expect(countCompleteWeeks({ from: bounds.firstDay, to: daySchema.parse('2026-01-20') }, bounds)).toBe(2)
  })
})

describe('daily KPI selection', () => {
  it.each([100, 180, 181])('sums every available day for %s calendar days of full history', (count) => {
    const rows = history('2026-01-01', count)
    const window = preset(rows, 'all')
    const result = selectVolumeSummarySelection(rows, dashboardCategories, window)
    expect(result.granularity).toBe('day')
    expect(selectVolumeSummary(result.points).kalshi.total).toBe(count * 10)
    expect(result.points).toHaveLength(count)
  })

  it('keeps the same KPI for the exact window in day and week chart modes', () => {
    const rows = history('2026-01-01', 181)
    const window = preset(rows, 'all')
    const summary = selectVolumeSummarySelection(rows, dashboardCategories, window)
    const dailyChart = select(rows, window, dashboardCategories, 'day')
    const weeklyChart = select(rows, window, dashboardCategories, 'week')
    expect(summary.points).toHaveLength(181)
    expect(selectVolumeSummary(summary.points).kalshi.total).toBe(1810)
    expect(selectVolumeSummary(dailyChart.points).kalshi.total).toBe(selectVolumeSummary(summary.points).kalshi.total)
    expect(weeklyChart.points.length).toBeLessThan(summary.points.length)
    expect(weeklyChart.points.at(-1)?.endDay).toBe('2026-06-28')
    expect(summary.points.at(-1)?.day).toBe('2026-06-30')
  })

  it('keeps known daily sums across gaps and matches category totals even when weekly points are missing', () => {
    const rows = [row('2026-01-01'), row('2026-06-30')]
    const window = preset(rows, 'all')
    const result = selectVolumeSummarySelection(rows, dashboardCategories, window)
    const summary = selectVolumeSummary(result.points)
    const breakdown = selectCategoryBreakdown(rows, select(rows, window).period ?? {})
    expect(result.granularity).toBe('day')
    expect(summary.kalshi).toMatchObject({ total: 20, availablePoints: 2, expectedPoints: 181, share: null })
    expect(summary.polymarket.total).toBeNull()
    expect(breakdown.totals.kalshi).toBe(summary.kalshi.total)
  })

  it('still responds to categories and windows while preserving an empty category selection', () => {
    const rows = history('2026-01-01', 100)
    expect(selectVolumeSummary(selectVolumeSummarySelection(rows, dashboardCategories, preset(rows, '7d')).points).kalshi.total).toBe(70)
    expect(selectVolumeSummary(selectVolumeSummarySelection(rows, dashboardCategories, preset(rows, '30d')).points).kalshi.total).toBe(300)
    expect(selectVolumeSummary(selectVolumeSummarySelection(rows, ['politics'], preset(rows, '30d')).points).kalshi.total).toBe(0)
    expect(selectVolumeSummary(selectVolumeSummarySelection(rows, [], preset(rows, '30d')).points).kalshi.total).toBeNull()
    expect(selectVolumeSummarySelection([], dashboardCategories, null)).toEqual({ points: [], granularity: 'day', period: null })
  })
})

describe('category dashboard selection', () => {
  function selectCategories(
    rows: readonly DashboardVolumeRow[],
    window: VolumeWindow,
    categories: readonly DashboardCategory[],
    platforms?: readonly Platform[],
    granularity: 'day' | 'week' = 'day',
  ) {
    return selectCategoryDashboard(rows, categories, platforms ?? ['kalshi', 'polymarket'], window, granularity)
  }

  it('uses only the selected platform and keeps the common calendar even when its last day is missing', () => {
    const rows = [
      row('2026-09-28', 'kalshi', 10),
      row('2026-09-28', 'polymarket', 20),
      row('2026-09-30', 'polymarket', 30),
    ]
    const window = preset(rows, '7d')
    const result = selectCategories(rows, window, ['sports'], ['kalshi'])
    expect(result.period).toEqual(selectCategories(rows, window, ['sports']).period)
    expect(result.points.find((point) => point.day === '2026-09-28')?.total).toBe(10)
    expect(result.points.find((point) => point.day === '2026-09-28')?.partial).toBe(false)
    expect(result.points.at(-1)?.day).toBe('2026-09-30')
    expect(result.points.at(-1)?.total).toBeNull()
    expect(selectCategories(rows, window, ['sports'], []).points).toEqual([])
  })

  it('sums both platforms into one value per selected category and fills the calendar', () => {
    const rows = [
      row('2026-09-28', 'kalshi', 10),
      row('2026-09-28', 'polymarket', 20),
      row('2026-09-30', 'kalshi', 5, 'politics'),
    ]
    const result = selectCategories(rows, preset(rows, '7d'), ['sports', 'politics'])
    expect(result.points).toHaveLength(3)
    const byDay = new Map(result.points.map((point) => [String(point.day), point]))
    expect(byDay.get('2026-09-28')).toEqual({ day: '2026-09-28', endDay: '2026-09-28', total: 30, values: { sports: 30, politics: 0 }, partial: false })
    expect(byDay.get('2026-09-29')).toEqual({ day: '2026-09-29', endDay: '2026-09-29', total: null, values: { sports: null, politics: null }, partial: true })
    expect(byDay.get('2026-09-30')?.values).toEqual({ sports: 0, politics: 5 })
    expect(byDay.get('2026-09-30')?.partial).toBe(true)
  })

  it('keeps a partial platform day as the sum of covered platforms instead of dropping to zero', () => {
    const rows = [row('2026-09-28', 'kalshi', 10), row('2026-09-29', 'polymarket', 20)]
    const result = selectCategories(rows, preset(rows, '7d'), ['sports'])
    const byDay = new Map(result.points.map((point) => [String(point.day), point]))
    expect(byDay.get('2026-09-28')?.values.sports).toBe(10)
    expect(byDay.get('2026-09-29')?.values.sports).toBe(20)
    expect(result.points.every((point) => point.partial)).toBe(true)
  })

  it('drops calendar-incomplete category weeks the same way as the platform chart', () => {
    const rows = history('2026-01-01', 181)
    const result = selectCategories(rows, preset(rows, 'all'), ['sports'], ['kalshi'], 'week')
    expect(result.points[0]).toEqual({ day: '2026-01-05', endDay: '2026-01-11', total: 70, values: { sports: 70 }, partial: false })
    expect(result.points.at(-1)).toEqual({ day: '2026-06-22', endDay: '2026-06-28', total: 70, values: { sports: 70 }, partial: false })
    expect(result.points.every(isCompleteCalendarWeek)).toBe(true)
    expect(result.period).toEqual({ startDay: '2026-01-05', endDay: '2026-06-28' })
    expect(result.points.reduce((sum, point) => sum + (point.total ?? 0), 0)).toBe(1750)
  })

  it('marks a weekly known sum partial when a selected platform misses a day', () => {
    const kalshi = history('2026-09-28', 35)
    const polymarket = kalshi.filter((item) => item.day !== '2026-09-30')
      .map((item) => ({ ...item, platform: 'polymarket' } satisfies DashboardVolumeRow))
    const rows = [...kalshi, ...polymarket]
    const result = selectCategories(rows, preset(rows, 'all'), ['sports'], undefined, 'week')
    expect(result.points[0]).toMatchObject({ total: 130, values: { sports: 130 }, partial: true })
    expect(result.points[1]).toMatchObject({ total: 140, partial: false })
  })

  it('aggregates complete weeks and keeps a week missing when any day is uncovered', () => {
    const completeRows = history('2026-09-28', 35)
    const complete = selectCategories(completeRows, preset(completeRows, 'all'), ['sports'], ['kalshi'], 'week')
    expect(complete.granularity).toBe('week')
    expect(complete.points).toHaveLength(5)
    expect(complete.points[0]).toEqual({ day: '2026-09-28', endDay: '2026-10-04', total: 70, values: { sports: 70 }, partial: false })
    expect(complete.period).toEqual({ startDay: '2026-09-28', endDay: '2026-11-01' })

    const withGap = history('2026-09-28', 35).filter((item) => item.day !== '2026-09-30')
    const gapped = selectCategories(withGap, preset(withGap, 'all'), ['sports'], ['kalshi'], 'week')
    expect(gapped.points[0]).toEqual({ day: '2026-09-28', endDay: '2026-10-04', total: null, values: { sports: null }, partial: true })
  })

  it('distinguishes empty source history from an empty category selection', () => {
    expect(selectCategoryDashboard([], dashboardCategories, ['kalshi', 'polymarket'], null)).toEqual({ points: [], granularity: 'day', period: null })
    const rows = history('2026-09-28', 7)
    const selected = selectCategories(rows, preset(rows, 'all'), [])
    expect(selected.points).toEqual([])
    expect(selected.period).not.toBeNull()
  })
})
