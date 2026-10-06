import { describe, expect, it } from 'vitest'

import { dashboardCategories, type DashboardCategory } from '../categories'
import {
  presetWindow,
  selectHistoryBounds,
  selectPreviousVolumeSummarySelection,
  selectVolumeSummarySelection,
  shiftDay,
  type VolumeWindow,
} from '../dashboard/dashboard'
import { daySchema, type DashboardVolumeRow } from '../model'
import { selectVolumeSummary } from './summary'

function history(count: number): DashboardVolumeRow[] {
  return Array.from({ length: count }, (_, index) => ({
    day: shiftDay(daySchema.parse('2024-01-01'), index),
    platform: 'kalshi',
    category: 'sports',
    volumeUsd: index + 1,
  }))
}

function windowFor(rows: readonly DashboardVolumeRow[], range: '7d' | '30d' | '90d' | 'all'): VolumeWindow {
  const bounds = selectHistoryBounds(rows)
  if (!bounds) throw new Error('Expected history bounds')
  return presetWindow(range, bounds)
}

function current(rows: readonly DashboardVolumeRow[], window: VolumeWindow, categories: readonly DashboardCategory[] = dashboardCategories) {
  return selectVolumeSummarySelection(rows, categories, window)
}

function previous(rows: readonly DashboardVolumeRow[], window: VolumeWindow, categories: readonly DashboardCategory[] = dashboardCategories) {
  return selectPreviousVolumeSummarySelection(rows, categories, window, selectHistoryBounds(rows))
}

describe('previous KPI period', () => {
  it.each([['7d', 7], ['30d', 30], ['90d', 90]] as const)('selects %s immediately before the current UTC period without overlap', (range, days) => {
    const rows = history(200)
    const window = windowFor(rows, range)
    const currentSelection = current(rows, window)
    const previousSelection = previous(rows, window)
    expect(currentSelection.points).toHaveLength(days)
    expect(previousSelection.points).toHaveLength(days)
    expect(previousSelection.period?.endDay).toBe(shiftDay(currentSelection.points[0]!.day, -1))
    expect(previousSelection.period?.startDay).toBe(shiftDay(currentSelection.points[0]!.day, -days))
    const previousTotal = previousSelection.points.reduce((total, point) => total + (point.kalshi ?? 0), 0)
    const currentTotal = currentSelection.points.reduce((total, point) => total + (point.kalshi ?? 0), 0)
    expect(selectVolumeSummary(currentSelection.points, previousSelection.points).kalshi.change).toBe((currentTotal - previousTotal) / previousTotal)
  })

  it('keeps leap day and missing days in calendar coverage', () => {
    const rows = history(90).filter((row) => row.day !== '2024-02-29')
    const window = windowFor(rows, '30d')
    const previousSelection = previous(rows, window)
    expect(previousSelection.period).toEqual({ startDay: '2024-01-31', endDay: '2024-02-29' })
    expect(previousSelection.points).toHaveLength(30)
    expect(previousSelection.points.at(-1)?.kalshi).toBeNull()
    expect(selectVolumeSummary(current(rows, window).points, previousSelection.points).kalshi.change).toBeNull()
  })

  it('compares an equally long period before a custom window', () => {
    const rows = history(200)
    const window: VolumeWindow = { from: daySchema.parse('2024-05-10'), to: daySchema.parse('2024-05-21') }
    const previousSelection = previous(rows, window)
    expect(previousSelection.period).toEqual({ startDay: '2024-04-28', endDay: '2024-05-09' })
    expect(previousSelection.points).toHaveLength(12)
  })

  it('uses the same category filter for both periods', () => {
    const rows = history(60)
    const window = windowFor(rows, '30d')
    const previousSelection = previous(rows, window, ['politics'])
    const currentSelection = current(rows, window, ['politics'])
    expect(previousSelection.points.every((point) => point.kalshi === 0)).toBe(true)
    expect(currentSelection.points.every((point) => point.kalshi === 0)).toBe(true)
    expect(selectVolumeSummary(currentSelection.points, previousSelection.points).kalshi.change).toBeNull()
  })

  it('has no preceding period for a full-history window', () => {
    const rows = history(200)
    expect(previous(rows, windowFor(rows, 'all')).period).toBeNull()
    expect(selectPreviousVolumeSummarySelection([], dashboardCategories, null, null).points).toEqual([])
  })
})
