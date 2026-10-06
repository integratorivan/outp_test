import { dashboardCategories, type DashboardCategory } from '../categories.ts'
import type { ChartPoint, DashboardVolumeRow, Day } from '../model.ts'

export type VolumeFilters = {
  categories: readonly DashboardCategory[]
  startDay?: Day
  endDay?: Day
}

export function selectChartPoints(
  rows: readonly DashboardVolumeRow[],
  { categories, startDay, endDay }: VolumeFilters,
): ChartPoint[] {
  if (categories.length === 0) return []

  const selected = new Set(categories)
  const points = new Map<Day, ChartPoint>()

  for (const row of rows) {
    if (startDay && row.day < startDay) continue
    if (endDay && row.day > endDay) continue

    let point = points.get(row.day)
    if (!point) {
      point = { day: row.day, kalshi: null, polymarket: null }
      points.set(row.day, point)
    }

    point[row.platform] = (point[row.platform] ?? 0)
      + (selected.has(row.category) ? row.volumeUsd : 0)
  }

  return [...points.values()].sort((left, right) => left.day.localeCompare(right.day))
}

export type CategoryPoint = {
  day: Day
  total: number | null
  values: Partial<Record<DashboardCategory, number | null>>
}

export function selectCategoryChartPoints(
  rows: readonly DashboardVolumeRow[],
  { categories, startDay, endDay }: VolumeFilters,
): CategoryPoint[] {
  if (categories.length === 0) return []

  const selected = new Set(categories)
  const days = new Map<Day, { kalshi: boolean; polymarket: boolean; sums: Map<DashboardCategory, number> }>()

  for (const row of rows) {
    if (startDay && row.day < startDay) continue
    if (endDay && row.day > endDay) continue
    let entry = days.get(row.day)
    if (!entry) {
      entry = { kalshi: false, polymarket: false, sums: new Map() }
      days.set(row.day, entry)
    }
    entry[row.platform] = true
    entry.sums.set(row.category, (entry.sums.get(row.category) ?? 0) + row.volumeUsd)
  }

  return [...days.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([day, entry]) => {
      // A covered day counts every selected category: a platform that reported but has no
      // rows in a category contributes a confirmed zero, so the sum never silently drops.
      const covered = entry.kalshi || entry.polymarket
      const values: Partial<Record<DashboardCategory, number | null>> = {}
      let total = 0
      for (const category of categories) {
        const value = covered ? entry.sums.get(category) ?? 0 : null
        if (selected.has(category)) values[category] = value
        if (value !== null) total += value
      }
      return { day, values, total: covered ? total : null }
    })
}

export type CategoryVolume = Pick<ChartPoint, 'kalshi' | 'polymarket'> & {
  category: DashboardCategory
  total: number | null
  share: number | null
}

export type CategoryPeriod = { startDay: Day; endDay: Day }
export type CategoryTotals = Pick<CategoryVolume, 'kalshi' | 'polymarket' | 'total'>
export type CategoryBreakdown = {
  rows: CategoryVolume[]
  totals: CategoryTotals
  previousTotals: Partial<Record<DashboardCategory, number>> | null
  comparisonPeriod: CategoryPeriod | null
}

export function sumCategoryVolumes(rows: readonly CategoryVolume[]): CategoryTotals {
  const totals: CategoryTotals = { kalshi: null, polymarket: null, total: null }
  for (const row of rows) {
    for (const key of ['kalshi', 'polymarket', 'total'] as const) {
      if (row[key] !== null) totals[key] = (totals[key] ?? 0) + row[key]
    }
  }
  return totals
}

function hasCompleteCategoryPeriod(rows: readonly DashboardVolumeRow[], period: CategoryPeriod) {
  const points = selectChartPoints(rows, { ...period, categories: dashboardCategories })
  const expectedDays = (Date.parse(period.endDay) - Date.parse(period.startDay)) / 86_400_000 + 1
  return points.length === expectedDays && points.every((point) => point.kalshi !== null && point.polymarket !== null)
}

export function selectCategoryBreakdown(
  rows: readonly DashboardVolumeRow[],
  { startDay, endDay }: Pick<VolumeFilters, 'startDay' | 'endDay'>,
  comparisonPeriod: CategoryPeriod | null = null,
): CategoryBreakdown {
  const volumes = new Map<DashboardCategory, Pick<ChartPoint, 'kalshi' | 'polymarket'>>()
  for (const row of rows) {
    if (startDay && row.day < startDay) continue
    if (endDay && row.day > endDay) continue
    const values = volumes.get(row.category) ?? { kalshi: null, polymarket: null }
    values[row.platform] = (values[row.platform] ?? 0) + row.volumeUsd
    volumes.set(row.category, values)
  }

  const breakdown: CategoryVolume[] = dashboardCategories.map((category) => {
    const values = volumes.get(category) ?? { kalshi: null, polymarket: null }
    const total = values.kalshi === null ? values.polymarket : values.kalshi + (values.polymarket ?? 0)
    return { category, ...values, total, share: null }
  })
  const totalVolume = breakdown.reduce((sum, row) => sum + (row.total ?? 0), 0)
  for (const row of breakdown) {
    if (row.total !== null && totalVolume > 0) row.share = row.total / totalVolume
  }
  breakdown.sort((left, right) => {
    if (left.category === 'other') return 1
    if (right.category === 'other') return -1
    return (right.total ?? -1) - (left.total ?? -1)
  })
  const totals = sumCategoryVolumes(breakdown)
  let previousTotals: CategoryBreakdown['previousTotals'] = null
  if (comparisonPeriod && startDay && endDay &&
    hasCompleteCategoryPeriod(rows, { startDay, endDay }) &&
    hasCompleteCategoryPeriod(rows, comparisonPeriod)) {
    const previous = selectCategoryBreakdown(rows, comparisonPeriod)
    previousTotals = Object.fromEntries(previous.rows.map((row) => [row.category, row.total ?? 0]))
  }
  return { rows: breakdown, totals, previousTotals, comparisonPeriod }
}

/** Fixed chip order by all-time volume so range changes do not reshuffle. */
export function orderCategoriesByAllTimeVolume(rows: readonly DashboardVolumeRow[]): DashboardCategory[] {
  const totals = new Map<DashboardCategory, number>(dashboardCategories.map((category) => [category, 0]))
  for (const row of rows) totals.set(row.category, (totals.get(row.category) ?? 0) + row.volumeUsd)
  return [...dashboardCategories].sort((left, right) => {
    if (left === 'other') return 1
    if (right === 'other') return -1
    const delta = (totals.get(right) ?? 0) - (totals.get(left) ?? 0)
    return delta || dashboardCategories.indexOf(left) - dashboardCategories.indexOf(right)
  })
}
