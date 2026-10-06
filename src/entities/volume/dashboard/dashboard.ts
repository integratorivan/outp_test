import { z } from 'zod'

import { dashboardCategories, dashboardCategorySchema, type DashboardCategory } from '../categories'
import { daySchema, type ChartPoint, type DashboardVolumeRow, type Day, type Platform } from '../model'
import { selectCategoryChartPoints, selectChartPoints } from '../select/selectors'

export const volumeRangeSchema = z.enum(['7d', '30d', '90d', 'all'])
export type VolumeRange = z.infer<typeof volumeRangeSchema>
export const chartScaleSchema = z.enum(['linear', 'symlog'])
export type ChartScale = z.infer<typeof chartScaleSchema>
export const chartViewSchema = z.enum(['platforms', 'categories'])
export type ChartView = z.infer<typeof chartViewSchema>
export const volumeGranularitySchema = z.enum(['day', 'week'])
export type VolumeGranularity = z.infer<typeof volumeGranularitySchema>
export type VolumeWindow = { from: Day; to: Day }
export type HistoryBounds = { firstDay: Day; lastDay: Day }
export type DashboardFilters = {
  from: Day | null
  to: Day | null
  /** Legacy ?range= parameter, kept so old links keep working. */
  range: VolumeRange | null
  categories: readonly DashboardCategory[]
  view: ChartView
  scale: ChartScale
  /** Chart bucket size. Weekly mode changes only the chart; KPI stays on the exact window. */
  granularity: VolumeGranularity
}
export type VolumePoint = ChartPoint & {
  endDay: Day
  /** At least one platform is missing a calendar day in this bucket. */
  partial?: boolean
  /** Platforms whose week omits at least one calendar day. Dashes that series only. */
  partialPlatforms?: readonly Platform[]
  /** Known days in the week. `kalshi` / `polymarket` stay the weekly sum. */
  kalshiDays?: number
  polymarketDays?: number
  kalshiTotal?: number
  polymarketTotal?: number
}
export type VolumePeriod = { startDay: Day; endDay: Day }
export type VolumeSelection = { points: VolumePoint[]; granularity: VolumeGranularity; period: VolumePeriod | null }
export type CategoryChartPoint = {
  day: Day
  endDay: Day
  total: number | null
  values: Partial<Record<DashboardCategory, number | null>>
  /** The known sum is missing data from a selected platform. */
  partial?: boolean
}
export type CategorySelection = { points: CategoryChartPoint[]; granularity: VolumeGranularity; period: VolumePeriod | null }

const dayMs = 86_400_000
const rangeDays = { '7d': 7, '30d': 30, '90d': 90 }
const defaultRange: VolumeRange = '30d'
export const minWindowDays = 7
export const minCompleteWeeks = 3

export function windowDays(window: VolumeWindow): number {
  return Math.round((Date.parse(window.to) - Date.parse(window.from)) / dayMs) + 1
}

export function selectHistoryBounds(rows: readonly DashboardVolumeRow[]): HistoryBounds | null {
  let firstDay: Day | undefined
  let lastDay: Day | undefined
  for (const row of rows) {
    if (!firstDay || row.day < firstDay) firstDay = row.day
    if (!lastDay || row.day > lastDay) lastDay = row.day
  }
  return firstDay && lastDay ? { firstDay, lastDay } : null
}

/** Forces a window into the 7-day minimum and the available history. */
export function clampWindow(window: VolumeWindow, bounds: HistoryBounds): VolumeWindow {
  if (window.to < bounds.firstDay) {
    const to = shiftDay(bounds.firstDay, minWindowDays - 1)
    return { from: bounds.firstDay, to: to > bounds.lastDay ? bounds.lastDay : to }
  }
  if (window.from > bounds.lastDay) {
    const from = shiftDay(bounds.lastDay, 1 - minWindowDays)
    return { from: from < bounds.firstDay ? bounds.firstDay : from, to: bounds.lastDay }
  }
  let to = window.to > bounds.lastDay ? bounds.lastDay : window.to
  let from = window.from < bounds.firstDay ? bounds.firstDay : window.from
  if (windowDays({ from, to }) < minWindowDays) from = shiftDay(to, 1 - minWindowDays)
  if (from < bounds.firstDay) {
    from = bounds.firstDay
    const minimumTo = shiftDay(from, minWindowDays - 1)
    to = minimumTo > bounds.lastDay ? bounds.lastDay : minimumTo
  }
  return { from, to }
}

export function presetWindow(range: VolumeRange, bounds: HistoryBounds): VolumeWindow {
  if (range === 'all') return { from: bounds.firstDay, to: bounds.lastDay }
  return clampWindow({ from: shiftDay(bounds.lastDay, 1 - rangeDays[range]), to: bounds.lastDay }, bounds)
}

export function resolveVolumeWindow(filters: Pick<DashboardFilters, 'from' | 'to' | 'range'>, bounds: HistoryBounds): VolumeWindow {
  if (filters.from && filters.to) return clampWindow({ from: filters.from, to: filters.to }, bounds)
  return presetWindow(filters.range ?? defaultRange, bounds)
}

/** A preset is highlighted only when the window matches it exactly. */
export function matchWindowPreset(window: VolumeWindow, bounds: HistoryBounds): VolumeRange | null {
  if (isFullHistoryWindow(window, bounds)) return 'all'
  if (window.to !== bounds.lastDay) return null
  const days = windowDays(window)
  return days === 7 ? '7d' : days === 30 ? '30d' : days === 90 ? '90d' : null
}

export function isFullHistoryWindow(window: VolumeWindow, bounds: HistoryBounds): boolean {
  return window.from === bounds.firstDay && window.to === bounds.lastDay
}

export function shiftWindow(window: VolumeWindow, offsetDays: number): VolumeWindow {
  return { from: shiftDay(window.from, offsetDays), to: shiftDay(window.to, offsetDays) }
}

/** Moves the window by whole days without changing its length, stopping at the history edges. */
export function panWindow(window: VolumeWindow, bounds: HistoryBounds, offsetDays: number): VolumeWindow {
  const shifted = shiftWindow(window, offsetDays)
  if (shifted.from < bounds.firstDay) return { from: bounds.firstDay, to: shiftDay(bounds.firstDay, windowDays(window) - 1) }
  if (shifted.to > bounds.lastDay) return { from: shiftDay(bounds.lastDay, 1 - windowDays(window)), to: bounds.lastDay }
  return shifted
}

/** Scales the window by factor around an anchor day, keeping the anchor's relative position. */
export function zoomWindow(window: VolumeWindow, bounds: HistoryBounds, anchor: Day, factor: number): VolumeWindow {
  const span = windowDays(window)
  const total = windowDays({ from: bounds.firstDay, to: bounds.lastDay })
  const nextSpan = Math.min(total, Math.max(minWindowDays, Math.round(span * factor)))
  if (nextSpan === span) return window
  const clampedAnchor = anchor < window.from ? window.from : anchor > window.to ? window.to : anchor
  const ratio = span <= 1 ? 0.5 : (Date.parse(clampedAnchor) - Date.parse(window.from)) / ((span - 1) * dayMs)
  const offset = Math.round(Math.max(0, Math.min(1, ratio)) * (nextSpan - 1))
  let from = shiftDay(clampedAnchor, -offset)
  let to = shiftDay(from, nextSpan - 1)
  if (from < bounds.firstDay) {
    from = bounds.firstDay
    to = shiftDay(from, nextSpan - 1)
  }
  if (to > bounds.lastDay) {
    to = bounds.lastDay
    from = shiftDay(to, 1 - nextSpan)
  }
  return { from, to }
}

/** Snaps an arbitrary timestamp to the nearest UTC calendar day. */
export function dayAtTime(time: number): Day {
  return daySchema.parse(new Date(Math.round(time / dayMs) * dayMs).toISOString().slice(0, 10))
}

function parseWindowParam(value: string | null): Day | null {
  if (value === null) return null
  const parsed = daySchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function parseDashboardFilters(search: string): DashboardFilters {
  const params = new URLSearchParams(search)
  const from = parseWindowParam(params.get('from'))
  const to = parseWindowParam(params.get('to'))
  const parsedRange = volumeRangeSchema.safeParse(params.get('range'))
  const parsedView = chartViewSchema.safeParse(params.get('view'))
  const parsedScale = chartScaleSchema.safeParse(params.get('scale'))
  const parsedGranularity = volumeGranularitySchema.safeParse(params.get('g'))
  const rawCategories = params.get('categories')
  const selected = new Set(rawCategories?.split(',').flatMap((value) => {
    const result = dashboardCategorySchema.safeParse(value)
    return result.success ? [result.data] : []
  }))

  return {
    from: from && to && from <= to ? from : null,
    to: from && to && from <= to ? to : null,
    range: parsedRange.success ? parsedRange.data : null,
    categories: rawCategories === null ? [...dashboardCategories] : dashboardCategories.filter((category) => selected.has(category)),
    view: parsedView.success ? parsedView.data : 'platforms',
    scale: parsedScale.success ? parsedScale.data : 'linear',
    granularity: parsedGranularity.success ? parsedGranularity.data : 'day',
  }
}

export function serializeDashboardFilters(filters: DashboardFilters, search = '') {
  const params = new URLSearchParams(search)
  if (filters.from && filters.to) {
    params.set('from', filters.from)
    params.set('to', filters.to)
    params.delete('range')
  } else {
    params.delete('from')
    params.delete('to')
    if (filters.range && filters.range !== defaultRange) params.set('range', filters.range)
    else params.delete('range')
  }

  const categories = dashboardCategories.filter((category) => filters.categories.includes(category))
  if (categories.length === dashboardCategories.length) params.delete('categories')
  else params.set('categories', categories.join(','))

  if (filters.view === 'platforms') params.delete('view')
  else params.set('view', filters.view)
  if (filters.scale === 'linear') params.delete('scale')
  else params.set('scale', filters.scale)
  if (filters.granularity === 'day') params.delete('g')
  else params.set('g', filters.granularity)
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function shiftDay(day: Day, offset: number): Day {
  return daySchema.parse(new Date(Date.parse(day) + offset * dayMs).toISOString().slice(0, 10))
}

function calendarDays(start: Day, end: Day) {
  return Math.round((Date.parse(end) - Date.parse(start)) / dayMs) + 1
}

export function previousVolumePeriod(period: VolumePeriod): VolumePeriod {
  const days = calendarDays(period.startDay, period.endDay)
  return { startDay: shiftDay(period.startDay, -days), endDay: shiftDay(period.startDay, -1) }
}

function utcWeekday(day: Day) {
  return new Date(day).getUTCDay()
}

export function mondayOnOrBefore(day: Day): Day {
  return shiftDay(day, -((utcWeekday(day) + 6) % 7))
}

function sundayOnOrBefore(day: Day): Day {
  const weekday = utcWeekday(day)
  return weekday === 0 ? day : shiftDay(day, -weekday)
}

function nextMondayOnOrAfter(day: Day): Day {
  const sinceMonday = (utcWeekday(day) + 6) % 7
  return sinceMonday === 0 ? day : shiftDay(day, 7 - sinceMonday)
}

/** A drawn week is Monday–Sunday. Source holes do not make it incomplete. */
export function isCompleteCalendarWeek(point: { day: Day; endDay: Day }) {
  return utcWeekday(point.day) === 1 && utcWeekday(point.endDay) === 0 && windowDays({ from: point.day, to: point.endDay }) === 7
}

function earliestDay(rows: readonly { day: Day }[]): Day | undefined {
  let first: Day | undefined
  for (const row of rows) {
    if (!first || row.day < first) first = row.day
  }
  return first
}

/** Pulls the grid back to Monday when that day is already in the loaded history. */
function weeklyChartFrom(from: Day, rows: readonly { day: Day }[]): Day {
  const monday = mondayOnOrBefore(from)
  const first = earliestDay(rows)
  if (!first || monday < first) return from
  return monday
}

/** Complete Mon–Sun weeks in the window, including a leading Monday that is already loaded. */
export function countCompleteWeeks(window: VolumeWindow, bounds: HistoryBounds): number {
  const gridFrom = mondayOnOrBefore(window.from)
  const firstMonday = gridFrom < bounds.firstDay ? nextMondayOnOrAfter(bounds.firstDay) : gridFrom
  const lastSunday = sundayOnOrBefore(window.to)
  if (firstMonday > lastSunday) return 0
  return Math.floor(windowDays({ from: firstMonday, to: lastSunday }) / 7)
}

export function displayedGranularity(granularity: VolumeGranularity, completeWeeks: number | null): VolumeGranularity {
  if (granularity === 'week' && completeWeeks !== null && completeWeeks < minCompleteWeeks) return 'day'
  return granularity
}

function addAvailableVolume(total: number | null, value: number | null): number | null {
  if (value === null) return total
  return total === null ? value : total + value
}

export function aggregateVolumeWeeks(points: readonly VolumePoint[]): VolumePoint[] {
  const weeks: VolumePoint[] = []
  let week: VolumePoint | undefined
  let weekStart: Day | undefined
  let bucketDays = 0
  let kalshiDays = 0
  let polymarketDays = 0

  function finishWeek() {
    if (!week) return
    const partialPlatforms: Platform[] = []
    if (week.kalshi !== null) {
      week.kalshiTotal = week.kalshi
      week.kalshiDays = kalshiDays
      if (kalshiDays < bucketDays) partialPlatforms.push('kalshi')
    }
    if (week.polymarket !== null) {
      week.polymarketTotal = week.polymarket
      week.polymarketDays = polymarketDays
      if (polymarketDays < bucketDays) partialPlatforms.push('polymarket')
    }
    if (partialPlatforms.length === 0) return
    week.partial = true
    week.partialPlatforms = partialPlatforms
  }

  for (const point of points) {
    const weekday = new Date(point.day).getUTCDay()
    const monday = shiftDay(point.day, -((weekday + 6) % 7))
    if (monday !== weekStart || !week) {
      finishWeek()
      weekStart = monday
      week = { day: point.day, endDay: point.endDay, kalshi: point.kalshi, polymarket: point.polymarket }
      weeks.push(week)
      bucketDays = 1
      kalshiDays = point.kalshi === null ? 0 : 1
      polymarketDays = point.polymarket === null ? 0 : 1
    } else {
      week.endDay = point.day
      bucketDays += 1
      week.kalshi = addAvailableVolume(week.kalshi, point.kalshi)
      week.polymarket = addAvailableVolume(week.polymarket, point.polymarket)
      if (point.kalshi !== null) kalshiDays += 1
      if (point.polymarket !== null) polymarketDays += 1
    }
  }
  finishWeek()
  return weeks
}

function selectVolumeSelection(
  rows: readonly DashboardVolumeRow[],
  categories: readonly DashboardCategory[],
  window: VolumeWindow,
  granularity: VolumeGranularity,
): VolumeSelection {
  const to = window.to
  const from = granularity === 'week' ? weeklyChartFrom(window.from, rows) : window.from
  const selected = selectChartPoints(rows, { categories, startDay: from, endDay: to })

  const byDay = new Map(selected.map((point) => [point.day, point]))
  const points: VolumePoint[] = []
  for (let day = from; day <= to; day = shiftDay(day, 1)) {
    points.push({ ...(byDay.get(day) ?? { day, kalshi: null, polymarket: null }), endDay: day })
  }

  const displayed = granularity === 'week'
    ? aggregateVolumeWeeks(points).filter(isCompleteCalendarWeek)
    : points
  const displayedStart = displayed[0]?.day
  const displayedEnd = displayed.at(-1)?.endDay
  return {
    points: selected.length ? displayed : [],
    granularity,
    period: displayedStart && displayedEnd ? { startDay: displayedStart, endDay: displayedEnd } : null,
  }
}

export function selectVolumeDashboard(
  rows: readonly DashboardVolumeRow[],
  categories: readonly DashboardCategory[],
  window: VolumeWindow | null,
  granularity: VolumeGranularity = 'day',
): VolumeSelection {
  if (!window) return { points: [], granularity, period: null }
  const selection = selectVolumeSelection(rows, categories, window, granularity)
  return selection.points.length ? selection : { points: [], granularity, period: selection.period }
}

/** Day-granularity points over the whole history, for the window brush. */
export function selectHistoryPoints(
  rows: readonly DashboardVolumeRow[],
  categories: readonly DashboardCategory[],
  bounds: HistoryBounds,
): VolumePoint[] {
  return selectVolumeSelection(rows, categories, { from: bounds.firstDay, to: bounds.lastDay }, 'day').points
}

function emptyCategoryValues(categories: readonly DashboardCategory[]): Partial<Record<DashboardCategory, number | null>> {
  return Object.fromEntries(categories.map((category) => [category, null]))
}

function aggregateCategoryWeeks(points: readonly CategoryChartPoint[], categories: readonly DashboardCategory[]): CategoryChartPoint[] {
  const weeks: CategoryChartPoint[] = []
  let week: CategoryChartPoint | undefined
  let weekStart: Day | undefined

  for (const point of points) {
    const weekday = new Date(point.day).getUTCDay()
    const monday = shiftDay(point.day, -((weekday + 6) % 7))
    if (monday !== weekStart || !week) {
      weekStart = monday
      week = {
        day: point.day,
        endDay: point.endDay,
        total: point.total,
        values: { ...point.values },
        ...(point.partial ? { partial: true } : {}),
      }
      weeks.push(week)
    } else {
      week.endDay = point.day
      week.partial = week.partial || point.partial
      const values: CategoryChartPoint['values'] = {}
      for (const category of categories) {
        const previous = week.values[category] ?? null
        const next = point.values[category] ?? null
        const value = previous === null || next === null ? null : previous + next
        values[category] = value
      }
      week.values = values
      week.total = week.total === null || point.total === null ? null : week.total + point.total
    }
  }
  return weeks
}

function selectCategorySelection(
  rows: readonly DashboardVolumeRow[],
  categories: readonly DashboardCategory[],
  window: VolumeWindow,
  granularity: VolumeGranularity,
  platforms: readonly Platform[],
): CategorySelection {
  const to = window.to
  const from = granularity === 'week' ? weeklyChartFrom(window.from, rows) : window.from
  const selected = selectCategoryChartPoints(rows, { categories, startDay: from, endDay: to })
  const coverage = new Map(selectChartPoints(rows, { categories, startDay: from, endDay: to })
    .map((point) => [point.day, platforms.every((platform) => point[platform] !== null)]))

  const byDay = new Map(selected.map((point) => [point.day, point]))
  const points: CategoryChartPoint[] = []
  for (let day = from; day <= to; day = shiftDay(day, 1)) {
    const source = byDay.get(day)
    points.push(source
      ? { ...source, endDay: day, partial: !coverage.get(day) }
      : { day, endDay: day, total: null, values: emptyCategoryValues(categories), partial: true })
  }

  const displayed = granularity === 'week'
    ? aggregateCategoryWeeks(points, categories).filter(isCompleteCalendarWeek)
    : points
  const displayedStart = displayed[0]?.day
  const displayedEnd = displayed.at(-1)?.endDay
  return {
    points: selected.length ? displayed : [],
    granularity,
    period: displayedStart && displayedEnd ? { startDay: displayedStart, endDay: displayedEnd } : null,
  }
}

export function selectCategoryDashboard(
  rows: readonly DashboardVolumeRow[],
  categories: readonly DashboardCategory[],
  platforms: readonly Platform[] = ['kalshi', 'polymarket'],
  window: VolumeWindow | null,
  granularity: VolumeGranularity = 'day',
): CategorySelection {
  if (!window) return { points: [], granularity, period: null }
  const selectedRows = rows.filter((row) => platforms.includes(row.platform))
  return selectCategorySelection(selectedRows, categories, window, granularity, platforms)
}

export function selectPreviousVolumeSummarySelection(
  rows: readonly DashboardVolumeRow[],
  categories: readonly DashboardCategory[],
  window: VolumeWindow | null,
  bounds: HistoryBounds | null,
): VolumeSelection {
  if (!window || (bounds && isFullHistoryWindow(window, bounds))) return { points: [], granularity: 'day', period: null }
  return selectVolumeSelection(rows, categories, {
    from: shiftDay(window.from, -windowDays(window)),
    to: shiftDay(window.from, -1),
  }, 'day')
}

/** Sum available daily values over the exact selected window. */
export function selectVolumeSummarySelection(
  rows: readonly DashboardVolumeRow[],
  categories: readonly DashboardCategory[],
  window: VolumeWindow | null,
): VolumeSelection {
  if (!window) return { points: [], granularity: 'day', period: null }
  return selectVolumeSelection(rows, categories, window, 'day')
}
