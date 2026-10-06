import { describe, expect, it } from 'vitest'

import { dashboardCategories, mapSourceCategory } from '../categories'
import { dashboardCategoryLabels } from '../lib/labels'
import { daySchema } from '../model'
import { toDashboardRow, toSourceRow } from '../normalize'
import { orderCategoriesByAllTimeVolume, selectCategoryBreakdown, selectCategoryChartPoints, selectChartPoints } from './selectors'
import { duneVolumeRowSchema } from '../../../shared/api/dune/schemas'

const first = daySchema.parse('2026-09-28')
const second = daySchema.parse('2026-09-29')
const rows = [
  toDashboardRow(toSourceRow(duneVolumeRowSchema.parse({ day: first, category: 'elections', volume_usd: 10 }), 'kalshi')),
  toDashboardRow(toSourceRow(duneVolumeRowSchema.parse({ day: first, category: 'politics', volume_usd: 20 }), 'kalshi')),
  toDashboardRow(toSourceRow(duneVolumeRowSchema.parse({ day: first, category: 'sports', volume_usd: 5 }), 'polymarket')),
  toDashboardRow(toSourceRow(duneVolumeRowSchema.parse({ day: second, category: 'sports', volume_usd: 0 }), 'kalshi')),
]

describe('category chart points', () => {
  it('sums both platforms into one value per selected category and day', () => {
    const mixed = [
      ...rows,
      toDashboardRow(toSourceRow(duneVolumeRowSchema.parse({ day: first, category: 'sports', volume_usd: 7 }), 'kalshi')),
    ]
    expect(selectCategoryChartPoints(mixed, { categories: ['sports', 'politics'] })).toEqual([
      { day: first, total: 42, values: { sports: 12, politics: 30 } },
      { day: second, total: 0, values: { sports: 0, politics: 0 } },
    ])
  })

  it('counts a covered category as a confirmed zero and an uncovered day as missing', () => {
    const result = selectCategoryChartPoints(rows, { categories: ['sports'] })
    expect(result[0]?.values.sports).toBe(5)
    expect(result[1]?.values.sports).toBe(0)
    expect(selectCategoryChartPoints(rows.slice(0, 1), { categories: ['sports'] })[0]).toEqual({
      day: first, total: 0, values: { sports: 0 },
    })
  })

  it('returns nothing for an empty selection and sorts days', () => {
    expect(selectCategoryChartPoints(rows, { categories: [] })).toEqual([])
    expect(selectCategoryChartPoints([...rows].reverse(), { categories: ['sports'] }).map((point) => point.day)).toEqual([first, second])
  })

  it('limits values to the requested categories without mutating inputs', () => {
    const before = structuredClone(rows)
    const result = selectCategoryChartPoints(rows, { categories: ['sports'], startDay: second, endDay: second })
    expect(result).toEqual([{ day: second, total: 0, values: { sports: 0 } }])
    expect(rows).toEqual(before)
  })
})

describe('volume taxonomy and selectors', () => {
  it('maps known categories without changing source facts', () => {
    const source = toSourceRow(duneVolumeRowSchema.parse({
      day: first, category: 'Climate and Weather', volume_usd: 12,
    }), 'kalshi')
    expect(source.sourceCategory).toBe('Climate and Weather')
    expect(toDashboardRow(source).category).toBe('weather')
    expect(mapSourceCategory('polymarket', 'weather')).toBe('weather')
    expect(mapSourceCategory('kalshi', 'exotics')).toBe('combo')
    expect(dashboardCategoryLabels.combo).toBe('Комбо-ставки')
    expect(mapSourceCategory('kalshi', 'mentions')).toBe('other')
  })

  it.each(['energy', '__proto__', 'constructor'])('safely maps unknown category %s to other', (category) => {
    expect(mapSourceCategory('kalshi', category)).toBe('other')
    expect(mapSourceCategory('polymarket', category)).toBe('other')
  })

  it('aggregates merged categories, sorts dates, and distinguishes missing data from zero', () => {
    expect(selectChartPoints([...rows].reverse(), { categories: dashboardCategories })).toEqual([
      { day: first, kalshi: 30, polymarket: 5 },
      { day: second, kalshi: 0, polymarket: null },
    ])
  })

  it('uses all source rows to establish daily coverage before filtering categories', () => {
    expect(selectChartPoints(rows, { categories: ['politics'] })).toEqual([
      { day: first, kalshi: 30, polymarket: 0 },
      { day: second, kalshi: 0, polymarket: null },
    ])
  })

  it('filters an inclusive date range without modifying inputs', () => {
    const before = structuredClone(rows)
    expect(selectChartPoints(rows, { categories: dashboardCategories, startDay: second, endDay: second })).toEqual([
      { day: second, kalshi: 0, polymarket: null },
    ])
    expect(rows).toEqual(before)
  })

  it('returns no points for empty selection or a period without data', () => {
    expect(selectChartPoints(rows, { categories: [] })).toEqual([])
    expect(selectChartPoints(rows, { categories: ['sports'], startDay: daySchema.parse('2027-01-01') })).toEqual([])
  })

  it('aggregates all 12 mapped categories and ranks them by combined volume', () => {
    const before = structuredClone(rows)
    const result = selectCategoryBreakdown([...rows].reverse(), { startDay: first, endDay: second })
    expect(result.rows).toHaveLength(12)
    expect(result.rows.slice(0, 2)).toEqual([
      { category: 'politics', kalshi: 30, polymarket: null, total: 30, share: 30 / 35 },
      { category: 'sports', kalshi: 0, polymarket: 5, total: 5, share: 5 / 35 },
    ])
    expect(result.rows.find((row) => row.category === 'crypto')).toEqual({
      category: 'crypto', kalshi: null, polymarket: null, total: null, share: null,
    })
    expect(result.rows.find((row) => row.category === 'combo')).toEqual({
      category: 'combo', kalshi: null, polymarket: null, total: null, share: null,
    })
    expect(result.totals).toEqual({ kalshi: 30, polymarket: 5, total: 35 })
    expect(result.rows.reduce((sum, row) => sum + (row.share ?? 0), 0)).toBeCloseTo(1)
    expect(rows).toEqual(before)
  })

  it('merges finance, financials and economics before computing category totals', () => {
    const financeRows = [
      toDashboardRow(toSourceRow(duneVolumeRowSchema.parse({ day: first, category: 'finance', volume_usd: 10 }), 'polymarket')),
      toDashboardRow(toSourceRow(duneVolumeRowSchema.parse({ day: first, category: 'financials', volume_usd: 20 }), 'kalshi')),
      toDashboardRow(toSourceRow(duneVolumeRowSchema.parse({ day: first, category: 'economics', volume_usd: 30 }), 'kalshi')),
    ]
    expect(selectCategoryBreakdown(financeRows, {}).rows[0]).toEqual({
      category: 'finance', polymarket: 10, kalshi: 50, total: 60, share: 1,
    })
  })

  it('limits category sums and shares to the inclusive displayed period', () => {
    const result = selectCategoryBreakdown(rows, { startDay: first, endDay: first })
    expect(result.rows.find((row) => row.category === 'sports')).toEqual({
      category: 'sports', kalshi: null, polymarket: 5, total: 5, share: 5 / 35,
    })
  })

  it('keeps confirmed zero separate from an absent category without inventing shares', () => {
    const result = selectCategoryBreakdown(rows, { startDay: second, endDay: second })
    expect(result.rows[0]).toEqual({ category: 'sports', kalshi: 0, polymarket: null, total: 0, share: null })
    expect(result.totals).toEqual({ kalshi: 0, polymarket: null, total: 0 })
    expect(result.rows.slice(1).every((row) => row.total === null && row.share === null)).toBe(true)
    const empty = selectCategoryBreakdown([], {})
    expect(empty.rows.map((row) => row.category)).toEqual([...dashboardCategories])
    expect(empty.rows.every((row) => row.kalshi === null && row.polymarket === null && row.total === null && row.share === null)).toBe(true)
  })

  it('provides independent platform totals for share-based bars', () => {
    const result = selectCategoryBreakdown([
      ...rows,
      toDashboardRow(toSourceRow(duneVolumeRowSchema.parse({ day: second, category: 'politics', volume_usd: 10 }), 'polymarket')),
    ], {})
    expect(result.rows[0]?.total).toBe(40)
    expect(result.totals).toEqual({ kalshi: 30, polymarket: 15, total: 45 })
    expect(result.rows[0]?.share).toBe(40 / 45)
  })

  it('keeps other last in both the breakdown and all-time category order, even when it is largest', () => {
    const withOther = [...rows, { day: first, platform: 'kalshi', category: 'other', volumeUsd: 1000 } satisfies import('../model').DashboardVolumeRow]
    const result = selectCategoryBreakdown(withOther, {})
    expect(result.rows.at(-1)?.category).toBe('other')
    expect(result.rows[0]?.category).toBe('politics')
    expect(result.totals.total).toBe(1035)
    expect(orderCategoriesByAllTimeVolume(withOther).at(-1)).toBe('other')
  })

  it('orders categories by all-time volume without depending on range filters', () => {
    expect(orderCategoriesByAllTimeVolume(rows).slice(0, 3)).toEqual(['politics', 'sports', 'crypto'])
    expect(orderCategoriesByAllTimeVolume(rows)).toHaveLength(dashboardCategories.length)
    expect(orderCategoriesByAllTimeVolume([])).toEqual([...dashboardCategories])
  })
})
