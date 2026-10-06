import { describe, expect, it } from 'vitest'

import { dashboardCategories } from '../../../entities/volume/categories'
import { presetWindow, previousVolumePeriod, selectHistoryBounds, selectVolumeDashboard, shiftDay, type DashboardFilters } from '../../../entities/volume/dashboard/dashboard'
import { daySchema, type DashboardVolumeRow } from '../../../entities/volume/model'
import { selectCategoryBreakdown } from '../../../entities/volume/select/selectors'
import { selectVolumeSummary } from '../../../entities/volume/select/summary'
import {
  categoryDelta,
  categoryPlatformShares,
  categoryTrendPath,
  categoryTrendSeries,
  categoryVolumeDelta,
  selectCategoryTableTotals,
  sortCategoryRows,
  type CategorySortKey,
} from './category-breakdown-model'

const start = daySchema.parse('2026-09-15')
const period = { startDay: start, endDay: shiftDay(start, 6) }
const previous = previousVolumePeriod(period)
const rows: DashboardVolumeRow[] = Array.from({ length: 14 }, (_, index) => {
  const day = shiftDay(previous.startDay, index)
  const current = index >= 7
  return [
    { day, platform: 'polymarket', category: 'sports', volumeUsd: current ? 30 : 20 },
    { day, platform: 'kalshi', category: 'sports', volumeUsd: current ? 70 : 60 },
    { day, platform: 'polymarket', category: 'politics', volumeUsd: current ? 5 : 10 },
    { day, platform: 'kalshi', category: 'politics', volumeUsd: current ? 5 : 10 },
    { day, platform: 'kalshi', category: 'other', volumeUsd: current ? 200 : 100 },
  ] satisfies DashboardVolumeRow[]
}).flat()
const breakdown = selectCategoryBreakdown(rows, period, previous)

function categoryRow(category: DashboardVolumeRow['category']) {
  const row = breakdown.rows.find((entry) => entry.category === category)
  if (!row) throw new Error('Category not found')
  return row
}

describe('category comparison', () => {
  it('uses the immediately preceding inclusive period of equal length', () => {
    expect(previous).toEqual({ startDay: daySchema.parse('2026-09-08'), endDay: daySchema.parse('2026-09-14') })
    expect(previousVolumePeriod({ startDay: daySchema.parse('2026-01-01'), endDay: daySchema.parse('2026-01-01') })).toEqual({
      startDay: daySchema.parse('2025-12-31'), endDay: daySchema.parse('2025-12-31'),
    })
    expect(breakdown.previousTotals?.sports).toBe(560)
    expect(categoryDelta(categoryRow('sports'), breakdown)).toBeCloseTo(0.25)
    expect(categoryDelta(categoryRow('politics'), breakdown)).toBeCloseTo(-0.5)
  })

  it.each([period.startDay, previous.startDay])('withholds delta when one platform is missing on %s', (day) => {
    const partial = selectCategoryBreakdown(rows.filter((row) => row.day !== day || row.platform !== 'polymarket'), period, previous)
    expect(partial.previousTotals).toBeNull()
    expect(categoryDelta(categoryRow('sports'), partial)).toBeNull()
    expect(partial.totals.kalshi).toBe(1925)
  })

  it('distinguishes a disappeared category from an unavailable comparison or a zero base', () => {
    const disappeared = selectCategoryBreakdown(rows.filter((row) => row.day < start || row.category !== 'politics'), period, previous)
    const politics = disappeared.rows.find((row) => row.category === 'politics')
    if (!politics) throw new Error('Category not found')
    expect(categoryDelta(politics, disappeared)).toBe(-1)
    expect(categoryDelta(categoryRow('crypto'), breakdown)).toBeNull()
    expect(categoryVolumeDelta(100, 0)).toBeNull()
    expect(categoryVolumeDelta(100, null)).toBeNull()
    expect(categoryVolumeDelta(100, 100)).toBe(0)
    expect(selectCategoryBreakdown(rows, period).previousTotals).toBeNull()
  })
})

describe('category table sorting and totals', () => {
  it.each(['category', 'polymarket', 'kalshi', 'total', 'share', 'delta'] satisfies CategorySortKey[])(
    'keeps other last and missing values after known values when sorting by %s in either direction', (key) => {
      const before = structuredClone(breakdown)
      for (const direction of ['ascending', 'descending'] as const) {
        const sorted = sortCategoryRows(breakdown, { key, direction })
        expect(sorted.at(-1)?.category).toBe('other')
        if (key !== 'category') {
          expect(sorted.slice(0, 2).map((row) => row.category).sort()).toEqual(['politics', 'sports'])
        }
      }
      expect(breakdown).toEqual(before)
    },
  )

  it('splits a category total into Polymarket and Kalshi shares', () => {
    expect(categoryPlatformShares({ polymarket: 19, kalshi: 81 })).toEqual({ polymarket: 0.19, kalshi: 0.81 })
    expect(categoryPlatformShares({ polymarket: 40, kalshi: null })).toEqual({ polymarket: 1, kalshi: null })
    expect(categoryPlatformShares({ polymarket: null, kalshi: null })).toEqual({ polymarket: null, kalshi: null })
  })

  it('builds a compact sparkline path from category trend values', () => {
    expect(categoryTrendSeries([
      { day: daySchema.parse('2026-09-15'), endDay: daySchema.parse('2026-09-15'), total: 10, values: { sports: 10 } },
      { day: daySchema.parse('2026-09-16'), endDay: daySchema.parse('2026-09-16'), total: 20, values: { sports: 20 } },
      { day: daySchema.parse('2026-09-17'), endDay: daySchema.parse('2026-09-17'), total: null, values: { sports: null } },
    ], 'sports')).toEqual([10, 20])
    expect(categoryTrendPath([10, 20, 15], 4, 4)).toContain('M')
    expect(categoryTrendPath([10], 4, 4)).toBe('')
  })

  it('puts selected categories above inactive ones and ranks selected other with actives', () => {
    const sorted = sortCategoryRows(breakdown, { key: 'total', direction: 'descending' }, ['politics'])
    const categories = sorted.map((row) => row.category)
    expect(categories.slice(0, 3)).toEqual(['politics', 'other', 'sports'])

    const withOther = sortCategoryRows(
      breakdown,
      { key: 'total', direction: 'descending' },
      ['politics', 'other', 'sports'],
    ).map((row) => row.category)
    expect(withOther.slice(0, 3)).toEqual(['other', 'sports', 'politics'])
  })

  it('sorts numeric values and Russian names in the requested direction', () => {
    expect(sortCategoryRows(breakdown, { key: 'total', direction: 'descending' })[0]?.category).toBe('sports')
    expect(sortCategoryRows(breakdown, { key: 'polymarket', direction: 'ascending' })[0]?.category).toBe('politics')
    expect(sortCategoryRows(breakdown, { key: 'delta', direction: 'ascending' })[0]?.category).toBe('politics')
    const named = sortCategoryRows(breakdown, { key: 'category', direction: 'ascending' })
    expect(named[0]?.category).toBe('business')
  })

  it('sums selected categories rather than averaging category deltas', () => {
    const totals = selectCategoryTableTotals(breakdown, ['sports', 'politics'])
    expect(totals.polymarket).toBe(245)
    expect(totals.kalshi).toBe(525)
    expect(totals.total).toBe(770)
    expect(totals.delta).toBeCloseTo(0.1)
    expect(totals.share).toBeCloseTo(770 / 2170)
    expect(selectCategoryTableTotals(breakdown, dashboardCategories).share).toBe(1)
    expect(selectCategoryTableTotals(breakdown, []).total).toBeNull()
    expect(selectCategoryTableTotals(breakdown, []).delta).toBeNull()
  })

  it('matches chart and KPI totals for a complete daily period and selected categories', () => {
    const filters: DashboardFilters = { from: null, to: null, range: null, categories: ['sports'], view: 'platforms', scale: 'linear', granularity: 'day' }
    const bounds = selectHistoryBounds(rows)
    const window = bounds ? presetWindow('7d', bounds) : null
    const chart = selectVolumeDashboard(rows, filters.categories, window, filters.granularity)
    const summary = selectVolumeSummary(chart.points)
    const totals = selectCategoryTableTotals(breakdown, filters.categories)
    expect(totals.kalshi).toBe(summary.kalshi.total)
    expect(totals.polymarket).toBe(summary.polymarket.total)
  })

  it('uses confirmed zero for absent categories on a reporting platform', () => {
    expect(selectCategoryTableTotals(breakdown, ['crypto'])).toEqual({
      kalshi: 0, polymarket: 0, total: 0, share: 0, delta: null,
    })
    const single = selectCategoryBreakdown(rows.filter((row) => row.platform === 'kalshi'), period)
    expect(selectCategoryTableTotals(single, ['crypto']).kalshi).toBe(0)
    expect(selectCategoryTableTotals(single, ['crypto']).polymarket).toBeNull()
  })

  it('does not invent totals for an unavailable platform or empty history', () => {
    const single = selectCategoryBreakdown(rows.filter((row) => row.platform === 'kalshi'), period, previous)
    expect(selectCategoryTableTotals(single, dashboardCategories).polymarket).toBeNull()
    expect(selectCategoryTableTotals(single, dashboardCategories).delta).toBeNull()
    expect(selectCategoryTableTotals(selectCategoryBreakdown([], {}), dashboardCategories)).toEqual({
      kalshi: null, polymarket: null, total: null, share: null, delta: null,
    })
  })
})
