import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import {
  clampWindow,
  completeSummaryWindow,
  isFullHistoryWindow,
  previousVolumePeriod,
  resolveVolumeWindow,
  selectCategoryDashboard,
  selectHistoryBounds,
  selectHistoryPoints,
  selectPreviousVolumeSummarySelection,
  selectVolumeDashboard,
  selectVolumeSummarySelection,
  windowDays,
  type DashboardFilters,
  type VolumeWindow,
} from '../../entities/volume/dashboard/dashboard'
import type { Platform } from '../../entities/volume/model'
import { toDashboardRow } from '../../entities/volume/normalize'
import { volumeSnapshotQuery } from '../../entities/volume/data/queries'
import type { VolumeRepository } from '../../entities/volume/data/repository'
import { orderCategoriesByAllTimeVolume, selectCategoryBreakdown } from '../../entities/volume/select/selectors'
import { selectVolumeSummary } from '../../entities/volume/select/summary'

export type VolumeSourceError = {
  platform: Platform
  kind: 'load' | 'refresh'
  isRetrying: boolean
  otherHasData: boolean
  otherFailed: boolean
  retry: () => void
}

export function useVolumeDashboard(
  repository: VolumeRepository,
  filters: DashboardFilters,
  visiblePlatforms: readonly Platform[],
  windowOverride?: VolumeWindow | null,
) {
  const kalshi = useQuery(volumeSnapshotQuery(repository, 'kalshi'))
  const polymarket = useQuery(volumeSnapshotQuery(repository, 'polymarket'))
  const sourceErrors: VolumeSourceError[] = []
  for (const { platform, query, other } of [
    { platform: 'kalshi', query: kalshi, other: polymarket },
    { platform: 'polymarket', query: polymarket, other: kalshi },
  ] satisfies { platform: Platform; query: typeof kalshi; other: typeof kalshi }[]) {
    if (query.isError) {
      sourceErrors.push({
        platform,
        kind: query.data ? 'refresh' : 'load',
        isRetrying: query.isFetching,
        otherHasData: Boolean(other.data),
        otherFailed: other.isError && !other.data,
        retry: () => { void query.refetch({ cancelRefetch: false }) },
      })
    }
  }
  const rows = useMemo(() => [
    ...(kalshi.data?.rows.map(toDashboardRow) ?? []),
    ...(polymarket.data?.rows.map(toDashboardRow) ?? []),
  ], [kalshi.data, polymarket.data])
  const bounds = useMemo(() => selectHistoryBounds(rows), [rows])
  const committedWindow = useMemo(() => bounds ? resolveVolumeWindow(filters, bounds) : null, [filters, bounds])
  const window = windowOverride && bounds ? clampWindow(windowOverride, bounds) : committedWindow
  const categories = filters.categories
  const granularity = filters.granularity
  const chart = useMemo(() => selectVolumeDashboard(rows, categories, window, granularity), [rows, categories, window, granularity])
  const categoryChart = useMemo(() => selectCategoryDashboard(rows, categories, visiblePlatforms, window, granularity), [rows, categories, visiblePlatforms, window, granularity])
  const historyPoints = useMemo(() => bounds ? selectHistoryPoints(rows, categories, bounds) : [], [rows, categories, bounds])
  const orderedCategories = useMemo(() => orderCategoriesByAllTimeVolume(rows), [rows])
  const fullHistory = window !== null && bounds !== null && isFullHistoryWindow(window, bounds)
  const summaryWindow = useMemo(() => window ? completeSummaryWindow(window, granularity) : null, [window, granularity])
  const startDay = summaryWindow?.from
  const endDay = summaryWindow?.to
  const categoryBreakdown = useMemo(() => selectCategoryBreakdown(
    startDay && endDay ? rows : [],
    { startDay, endDay },
    !fullHistory && startDay && endDay ? previousVolumePeriod({ startDay, endDay }) : null,
  ), [rows, startDay, endDay, fullHistory])
  const summarySelection = useMemo(() => selectVolumeSummarySelection(rows, categories, window, granularity), [rows, categories, window, granularity])
  const previousSummarySelection = useMemo(() => selectPreviousVolumeSummarySelection(rows, categories, window, bounds, granularity), [rows, categories, window, bounds, granularity])
  const summary = useMemo(() => selectVolumeSummary(summarySelection.points, previousSummarySelection.points), [summarySelection.points, previousSummarySelection.points])

  return {
    ...chart,
    window,
    bounds,
    historyPoints,
    categoryPoints: categoryChart.points,
    categoryPeriod: categoryChart.period,
    summary,
    summaryGranularity: summarySelection.granularity,
    summaryPeriod: summaryWindow
      ? { days: windowDays(summaryWindow), full: fullHistory, previous: previousSummarySelection.period }
      : null,
    orderedCategories,
    categoryBreakdown,
    isLoading: !kalshi.data && !polymarket.data && (kalshi.isPending || polymarket.isPending),
    isFetching: kalshi.isFetching || polymarket.isFetching,
    sourceErrors,
    hasError: sourceErrors.length > 0,
  }
}

export type VolumeDashboard = ReturnType<typeof useVolumeDashboard>
