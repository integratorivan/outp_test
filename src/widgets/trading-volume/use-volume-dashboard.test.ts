import 'fake-indexeddb/auto'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { dashboardCategories } from '../../entities/volume/categories'
import { shiftDay, type DashboardFilters } from '../../entities/volume/dashboard/dashboard'
import { daySchema, volumeSnapshotSchema, type Platform, type VolumeSnapshot } from '../../entities/volume/model'
import { volumeSnapshotQuery } from '../../entities/volume/data/queries'
import { VolumeRepository } from '../../entities/volume/data/repository'
import type { VolumeDataSource } from '../../shared/data/volume-data-source'
import { useVolumeDashboard, type VolumeDashboard } from './use-volume-dashboard'

const defaults: DashboardFilters = { from: null, to: null, range: null, categories: dashboardCategories, view: 'platforms', scale: 'linear', granularity: 'day' }

function stubVolumeSource(load: VolumeDataSource['load'] = async () => {
  throw new Error('Unexpected volume load in dashboard unit test')
}): VolumeDataSource {
  return { mode: 'dune', queryId: () => null, load }
}

function renderDashboard(client: QueryClient, repository: VolumeRepository, filters = defaults, platforms: readonly Platform[] = ['kalshi', 'polymarket']) {
  let result: VolumeDashboard | undefined
  function Probe() {
    result = useVolumeDashboard(repository, filters, platforms)
    return null
  }
  renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Probe)))
  if (!result) throw new Error('Dashboard hook did not render')
  return result
}

function withDashboardHistory(count: number, check: (render: (filters: DashboardFilters, platforms?: readonly Platform[]) => VolumeDashboard) => void) {
  const client = new QueryClient()
  const repository = new VolumeRepository(stubVolumeSource())
  for (const platform of ['kalshi', 'polymarket'] satisfies Platform[]) {
    client.setQueryData(repository.key(platform), volumeSnapshotSchema.parse({
      platform, queryId: platform === 'kalshi' ? 1 : 2, executionId: 'test',
      calculatedAt: '2026-01-01T00:00:00Z', downloadedAt: Date.now(),
      rows: Array.from({ length: count }, (_, index) => ({
        platform, day: shiftDay(daySchema.parse('2026-01-01'), index), sourceCategory: 'Sports',
        volumeUsd: platform === 'kalshi' ? 10 : 20,
      })).filter((row) => platform === 'kalshi' || row.day !== '2026-03-18'),
    }))
  }
  function render(filters: DashboardFilters, platforms: readonly Platform[] = ['kalshi', 'polymarket']) {
    return renderDashboard(client, repository, filters, platforms)
  }
  try {
    check(render)
  } finally {
    client.clear()
  }
}

describe('dashboard source errors', () => {
  it.each([
    { platform: 'kalshi', cached: false },
    { platform: 'polymarket', cached: false },
    { platform: 'kalshi', cached: true },
    { platform: 'polymarket', cached: true },
  ] satisfies { platform: Platform; cached: boolean }[])('retries only $platform and preserves available data (cached: $cached)', async ({ platform, cached }) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, refetchOnMount: false } } })
    const snapshot = (name: Platform) => volumeSnapshotSchema.parse({
      platform: name, queryId: name === 'kalshi' ? 1 : 2, executionId: 'test',
      calculatedAt: '2026-01-01T00:00:00Z', downloadedAt: Date.now(),
      rows: [{ platform: name, day: '2026-01-01', sourceCategory: 'sports', volumeUsd: 10 }],
    })
    const snapshots = { kalshi: snapshot('kalshi'), polymarket: snapshot('polymarket') }
    let failing = true
    const load = vi.fn(async (name: Platform): Promise<VolumeSnapshot> => {
      if (failing) throw new Error('Source unavailable')
      return snapshots[name]
    })
    const repository = new VolumeRepository(stubVolumeSource(load))
    const other = platform === 'kalshi' ? 'polymarket' : 'kalshi'
    client.setQueryData(repository.key(other), snapshots[other])
    if (cached) client.setQueryData(repository.key(platform), snapshots[platform])

    try {
      const before = renderDashboard(client, repository)
      await expect(client.fetchQuery({ ...volumeSnapshotQuery(repository, platform), staleTime: 0 })).rejects.toThrow('Source unavailable')
      const failed = renderDashboard(client, repository)
      expect(failed.hasError).toBe(true)
      expect(failed.isLoading).toBe(false)
      expect(failed.points).toEqual(before.points)
      expect(failed.sourceErrors).toHaveLength(1)
      const error = failed.sourceErrors[0]
      if (!error) throw new Error('Expected a source error')
      expect(error).toMatchObject({ platform, kind: cached ? 'refresh' : 'load', isRetrying: false })
      expect(client.getQueryData(repository.key(other))).toEqual(snapshots[other])
      if (cached) expect(client.getQueryData(repository.key(platform))).toEqual(snapshots[platform])

      error.retry()
      if (cached) expect(renderDashboard(client, repository).sourceErrors[0]?.isRetrying).toBe(true)
      await vi.waitFor(() => expect(client.getQueryState(repository.key(platform))?.fetchStatus).toBe('idle'))
      expect(renderDashboard(client, repository).sourceErrors).toHaveLength(1)
      expect(load).toHaveBeenCalledTimes(2)

      failing = false
      renderDashboard(client, repository).sourceErrors[0]?.retry()
      await vi.waitFor(() => expect(client.getQueryState(repository.key(platform))?.status).toBe('success'))
      const recovered = renderDashboard(client, repository)
      expect(recovered.sourceErrors).toEqual([])
      expect(recovered.hasError).toBe(false)
      expect(recovered.points[0]?.[platform]).toBe(10)
      expect(load.mock.calls.map(([name]) => name)).toEqual([platform, platform, platform])
    } finally {
      client.clear()
    }
  })
})

describe('dashboard platform selection', () => {
  it('filters category history by platform without changing the calendar or KPI', () => {
    withDashboardHistory(100, (render) => {
      const both = render(defaults)
      const kalshi = render(defaults, ['kalshi'])
      const polymarket = render(defaults, ['polymarket'])
      expect(kalshi.categoryPeriod).toEqual(both.categoryPeriod)
      expect(polymarket.categoryPeriod).toEqual(both.categoryPeriod)
      expect(kalshi.categoryPoints.every((point) => point.values.sports === 10)).toBe(true)
      expect(polymarket.categoryPoints.find((point) => point.day === '2026-03-18')?.total).toBeNull()
      expect(polymarket.categoryPoints.at(-1)?.total).toBe(20)
      expect(both.categoryPoints.at(-1)?.total).toBe(30)
      expect(kalshi.summary).toEqual(both.summary)
      expect(polymarket.summary).toEqual(both.summary)
      expect(render(defaults, []).categoryPoints).toEqual([])
    })
  })

  it('preserves gaps and includes both calendar edges when aggregating the selected platform', () => {
    withDashboardHistory(100, (render) => {
      const filters = { ...defaults, range: 'all', granularity: 'week' } satisfies DashboardFilters
      const kalshi = render(filters, ['kalshi'])
      const polymarket = render(filters, ['polymarket'])
      expect(kalshi.categoryPoints.every((point) => point.total === 70)).toBe(true)
      expect(kalshi.categoryPoints[0]?.day).toBe('2026-01-05')
      expect(kalshi.categoryPoints.at(-1)?.endDay).toBe('2026-04-05')
      expect(polymarket.categoryPoints.find((point) => point.day <= '2026-03-18' && point.endDay >= '2026-03-18')?.total).toBeNull()
      expect(polymarket.categoryPoints.at(-1)?.total).toBe(140)
    })
  })
})

describe('dashboard KPI independence', () => {
  it.each(['7d', '30d', '90d'] as const)('keeps %s summary totals, shares and coverage unchanged by the chart view', (range) => {
    withDashboardHistory(100, (render) => {
      const daily = render({ ...defaults, range })
      const categories = render({ ...defaults, range, view: 'categories' })
      expect(categories.summary).toEqual(daily.summary)
      expect(daily.summaryGranularity).toBe('day')
      expect(daily.summary.kalshi.expectedPoints).toBe(range === '7d' ? 7 : range === '30d' ? 30 : 90)
      expect(daily.summary.kalshi.total).toBe(range === '7d' ? 70 : range === '30d' ? 300 : 900)
      expect(daily.granularity).toBe('day')
      expect(daily.categoryBreakdown).toEqual(categories.categoryBreakdown)
      if (range !== '7d') {
        expect(daily.summary.polymarket.availablePoints).toBe(daily.summary.polymarket.expectedPoints - 1)
        expect(daily.summary.polymarket.share).not.toBeNull()
        expect(daily.summary.polymarket.commonDays).toBe(daily.summary.polymarket.expectedPoints - 1)
      }
    })
  })

  it.each([180, 181])('matches daily KPI and category totals for %s-day All history independently of the chart scale', (count) => {
    withDashboardHistory(count, (render) => {
      const dashboard = render({ ...defaults, range: 'all' })
      const logarithmic = render({ ...defaults, range: 'all', scale: 'symlog' })
      const weekly = render({ ...defaults, range: 'all', granularity: 'week' })
      expect(logarithmic.summary).toEqual(dashboard.summary)
      expect(logarithmic.points).toEqual(dashboard.points)
      expect(logarithmic.categoryBreakdown).toEqual(dashboard.categoryBreakdown)
      expect(dashboard.granularity).toBe('day')
      expect(weekly.granularity).toBe('week')
      expect(weekly.points[0]?.day).toBe('2026-01-05')
      expect(weekly.points.at(-1)?.endDay).toBe('2026-06-28')
      expect(weekly.summary).toEqual(dashboard.summary)
      expect(weekly.categoryBreakdown).toEqual(dashboard.categoryBreakdown)
      expect(weekly.summaryPeriod?.days).toBe(count)
      expect(dashboard.summaryGranularity).toBe('day')
      expect(dashboard.summary.kalshi.total).toBe(count * 10)
      expect(dashboard.summary.polymarket.total).toBe((count - 1) * 20)
      expect(dashboard.categoryBreakdown.totals.kalshi).toBe(dashboard.summary.kalshi.total)
      expect(dashboard.categoryBreakdown.totals.polymarket).toBe(dashboard.summary.polymarket.total)
      expect(dashboard.summary.polymarket).toMatchObject({
        availablePoints: count - 1,
        expectedPoints: count,
        commonDays: count - 1,
        shareBasisDays: count - 1,
      })
      expect(dashboard.summary.polymarket.share).not.toBeNull()
      expect(dashboard.period).toEqual({ startDay: '2026-01-01', endDay: count === 180 ? '2026-06-29' : '2026-06-30' })
      expect(render({ ...defaults, range: 'all', view: 'categories' }).summary).toEqual(dashboard.summary)
    })
  })

  it('compares consecutive equally sized calendar periods with the same category filters', () => {
    withDashboardHistory(100, (render) => {
      const dashboard = render(defaults)
      expect(dashboard.summaryPeriod).toEqual({
        days: 30,
        full: false,
        previous: { startDay: '2026-02-10', endDay: '2026-03-11' },
      })
      expect(dashboard.summary.kalshi.change).toBe(0)
      expect(dashboard.summary.polymarket.change).toBe(0)
      expect(render({ ...defaults, range: '7d' }).summary.polymarket.change).toBe(0)
      expect(render({ ...defaults, range: '90d' }).summary.kalshi.change).toBe(0)
      expect(render({ ...defaults, range: 'all' }).summary.kalshi.change).toBeNull()
      expect(render({ ...defaults, categories: ['politics'] }).summary.kalshi.change).toBeNull()
      expect(render({ ...defaults, categories: [] }).summary.kalshi.change).toBeNull()
    })
  })

  it('withholds comparison when there is no previous history rather than reusing current days', () => {
    withDashboardHistory(30, (render) => {
      const dashboard = render(defaults)
      expect(dashboard.summary.kalshi.total).toBe(300)
      expect(dashboard.summary.kalshi.change).toBeNull()
      expect(dashboard.summary.polymarket.change).toBeNull()
    })
  })

  it('still updates KPI when the selected categories or range change', () => {
    withDashboardHistory(100, (render) => {
      expect(render(defaults).summary.kalshi.total).toBe(300)
      expect(render({ ...defaults, range: '7d' }).summary.kalshi.total).toBe(70)
      expect(render({ ...defaults, categories: ['politics'] }).summary.kalshi.total).toBe(0)
      expect(render({ ...defaults, categories: [] }).summary.kalshi.total).toBeNull()
    })
  })

  it('wires the previous equal-length period only for bounded ranges', () => {
    withDashboardHistory(100, (render) => {
      const dashboard = render({ ...defaults, range: '7d' })
      if (!dashboard.period) throw new Error('Expected a displayed period')
      expect(dashboard.categoryBreakdown.comparisonPeriod).toEqual({
        startDay: shiftDay(dashboard.period.startDay, -7),
        endDay: shiftDay(dashboard.period.startDay, -1),
      })
      expect(dashboard.categoryBreakdown.previousTotals?.sports).toBe(210)
      expect(render({ ...defaults, range: 'all' }).categoryBreakdown.comparisonPeriod).toBeNull()
      expect(render({ ...defaults, range: 'all' }).categoryBreakdown.previousTotals).toBeNull()
    })
  })

  it('shows short full history as daily points while retaining daily KPI', () => {
    withDashboardHistory(5, (render) => {
      const dashboard = render({ ...defaults, range: 'all' })
      expect(dashboard.granularity).toBe('day')
      expect(dashboard.points).toHaveLength(5)
      expect(dashboard.period).toEqual({ startDay: '2026-01-01', endDay: '2026-01-05' })
      expect(dashboard.summaryGranularity).toBe('day')
      expect(dashboard.summary.kalshi.total).toBe(50)
      expect(dashboard.categoryBreakdown.comparisonPeriod).toBeNull()
    })
  })
})
