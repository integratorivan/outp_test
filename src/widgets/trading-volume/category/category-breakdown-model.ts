import type { DashboardCategory } from '../../../entities/volume/categories'
import type { CategoryChartPoint } from '../../../entities/volume/dashboard/dashboard'
import { dashboardCategoryLabels } from '../../../entities/volume/lib/labels'
import { sumCategoryVolumes, type CategoryBreakdown, type CategoryVolume } from '../../../entities/volume/select/selectors'

export type CategorySortKey = 'category' | 'polymarket' | 'kalshi' | 'total' | 'share' | 'delta'
export type CategorySort = { key: CategorySortKey; direction: 'ascending' | 'descending' }

export function categoryVolumeDelta(current: number | null, previous: number | null) {
  return previous !== null && previous > 0 ? ((current ?? 0) - previous) / previous : null
}

export function categoryDelta(row: CategoryVolume, breakdown: CategoryBreakdown) {
  return categoryVolumeDelta(row.total, breakdown.previousTotals?.[row.category] ?? null)
}

/** Share of each platform inside a category total (for the split Polymarket | Kalshi bar). */
export function categoryPlatformShares(row: Pick<CategoryVolume, 'kalshi' | 'polymarket'>) {
  const polymarket = row.polymarket ?? 0
  const kalshi = row.kalshi ?? 0
  const total = polymarket + kalshi
  if (total <= 0 || (row.polymarket === null && row.kalshi === null)) {
    return { polymarket: null, kalshi: null }
  }
  return {
    polymarket: row.polymarket === null ? null : polymarket / total,
    kalshi: row.kalshi === null ? null : kalshi / total,
  }
}

/** Daily (or weekly) totals for one category in the visible chart window. */
export function categoryTrendSeries(
  points: readonly CategoryChartPoint[],
  category: DashboardCategory,
): number[] {
  return points.flatMap((point) => {
    const value = point.values[category]
    return value == null ? [] : [value]
  })
}

export function categoryTrendPath(values: readonly number[], width = 48, height = 16) {
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = width / (values.length - 1)
  return values
    .map((value, index) => {
      const x = index * step
      const y = height - ((value - min) / span) * (height - 2) - 1
      return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

export function sortCategoryRows(
  breakdown: CategoryBreakdown,
  sort: CategorySort,
  selected?: readonly DashboardCategory[],
): CategoryVolume[] {
  const compare = (left: CategoryVolume, right: CategoryVolume) => {
    let difference: number
    if (sort.key === 'category') {
      difference = dashboardCategoryLabels[left.category].localeCompare(
        dashboardCategoryLabels[right.category],
        'ru',
      )
    } else {
      const first = sort.key === 'delta' ? categoryDelta(left, breakdown) : left[sort.key]
      const second = sort.key === 'delta' ? categoryDelta(right, breakdown) : right[sort.key]
      if (first === null && second === null) return 0
      if (first === null) return 1
      if (second === null) return -1
      difference = first - second
    }
    return sort.direction === 'ascending' ? difference : -difference
  }

  if (!selected) {
    const other = breakdown.rows.filter((row) => row.category === 'other')
    const ranked = breakdown.rows.filter((row) => row.category !== 'other')
    return [...ranked.sort(compare), ...other]
  }

  const selectedSet = new Set(selected)
  const active = breakdown.rows.filter((row) => selectedSet.has(row.category)).sort(compare)
  const inactive = breakdown.rows.filter((row) => !selectedSet.has(row.category)).sort(compare)
  return [...active, ...inactive]
}

export function selectCategoryTableTotals(breakdown: CategoryBreakdown, selected: readonly DashboardCategory[]) {
  const rows = breakdown.rows.filter((row) => selected.includes(row.category))
  const totals = sumCategoryVolumes(rows)
  if (rows.length) {
    for (const platform of ['kalshi', 'polymarket'] as const) {
      if (breakdown.totals[platform] !== null) totals[platform] ??= 0
    }
    totals.total = totals.kalshi === null ? totals.polymarket : totals.kalshi + (totals.polymarket ?? 0)
  }
  const previous = breakdown.previousTotals
  const previousTotal = previous === null || !rows.length
    ? null
    : rows.reduce((sum, row) => sum + (previous[row.category] ?? 0), 0)
  return {
    ...totals,
    share: totals.total !== null && breakdown.totals.total !== null && breakdown.totals.total > 0
      ? totals.total / breakdown.totals.total : null,
    delta: categoryVolumeDelta(totals.total, previousTotal),
  }
}
