import { scaleLinear } from 'd3-scale'

import type { DashboardCategory } from '../../../entities/volume/categories'
import type { CategoryChartPoint } from '../../../entities/volume/dashboard/dashboard'
import type { Day } from '../../../entities/volume/model'
import { buildDateTicks, buildUsdDomain, buildUsdTicks } from '../chart/chart-model'

export type CategoryAreaSegment = {
  positions: { x: number; y0: number; y1: number }[]
  dashed?: boolean
}

export type CategoryArea = {
  category: DashboardCategory
  color: string
  segments: CategoryAreaSegment[]
}

export function buildCategoryTooltipRows({ point, categories, limit }: {
  point: CategoryChartPoint | undefined
  categories: readonly DashboardCategory[]
  limit?: number
}) {
  if (!point || point.total === null) return []
  const total = point.total
  return categories.flatMap((category) => {
    const value = point.values[category]
    return value == null ? [] : [{ category, value, share: total > 0 ? value / total : 0 }]
  }).sort((left, right) => right.value - left.value).slice(0, limit)
}

/** Clears the absolute date label in the chart's `pt-5` band. */
const TOOLTIP_MIN_TOP = 20

export function positionCategoryTooltip({ x, y, width, height, tooltipWidth, tooltipHeight, compact = false }: {
  x: number
  y: number
  width: number
  height: number
  tooltipWidth: number
  tooltipHeight: number
  compact?: boolean
}) {
  const left = compact ? (width - tooltipWidth) / 2 : x + tooltipWidth + 12 <= width - 8 ? x + 12 : x - tooltipWidth - 12
  const top = y + tooltipHeight + 12 <= height - 8 ? Math.max(TOOLTIP_MIN_TOP, y + 12) : y - tooltipHeight - 12
  return {
    left: Math.max(8, Math.min(width - tooltipWidth - 8, left)),
    top: Math.max(TOOLTIP_MIN_TOP, Math.min(height - tooltipHeight - 8, top)),
  }
}

export function categoryColorVar(category: DashboardCategory) {
  return `var(--category-${category})`
}

export function buildCategoryChartGeometry({ points, categories, width, height, domain }: {
  points: readonly CategoryChartPoint[]
  categories: readonly DashboardCategory[]
  width: number
  height: number
  domain?: number
}) {
  const left = width < 480 ? 44 : 64
  const right = width - (width < 480 ? 8 : 16)
  const top = 16
  const bottom = height - 40
  const times = points.map((point) => Date.parse(point.day))
  const firstTime = times[0] ?? 0
  const lastTime = times.at(-1) ?? firstTime
  const maximum = points.reduce((max, point) => Math.max(max, point.total ?? 0), 0)
  const domainMax = domain ?? buildUsdDomain(maximum).domainMax
  const x = (day: Day) => firstTime === lastTime ? (left + right) / 2 : left + (Date.parse(day) - firstTime) / (lastTime - firstTime) * (right - left)
  const y = scaleLinear().domain([0, domainMax]).range([bottom, top])
  const pointXs = points.map((point) => x(point.day))
  const xTicks = buildDateTicks({ days: points.map((point) => point.day), firstTime, lastTime, width, left, right, x })
  const yTicks = buildUsdTicks(maximum, false).map((value) => ({ value, y: y(value) }))

  // Selected categories share the same null pattern (a fully uncovered day), so every
  // stack breaks at the same boundaries and the bands never overlap.
  const stackedOffsets = points.map((point) => {
    let base = 0
    const offsets = new Map<DashboardCategory, { base: number; value: number } | null>()
    for (const category of categories) {
      const value = point.values[category] ?? null
      if (value === null) {
        offsets.set(category, null)
        continue
      }
      offsets.set(category, { base, value })
      base += value
    }
    return offsets
  })

  const areas: CategoryArea[] = categories.map((category) => {
    const segments: CategoryAreaSegment[] = []
    let segment: CategoryAreaSegment['positions'] = []
    let dashed = false
    const finishSegment = () => {
      if (segment.length) segments.push(dashed ? { positions: segment, dashed: true } : { positions: segment })
      segment = []
      dashed = false
    }
    for (const [index, point] of points.entries()) {
      const offset = stackedOffsets[index]?.get(category) ?? null
      if (!offset) {
        finishSegment()
        continue
      }
      const position = { x: x(point.day), y0: y(offset.base), y1: y(offset.base + offset.value) }
      if (point.incompleteWeek) {
        finishSegment()
        const previous = points[index - 1]
        const previousOffset = previous && !previous.incompleteWeek ? stackedOffsets[index - 1]?.get(category) ?? null : null
        if (previous && previousOffset) {
          segment = [
            { x: x(previous.day), y0: y(previousOffset.base), y1: y(previousOffset.base + previousOffset.value) },
            position,
          ]
        } else {
          segment = [position]
        }
        dashed = true
        finishSegment()
        continue
      }
      segment.push(position)
    }
    finishSegment()
    return { category, color: categoryColorVar(category), segments }
  })

  return { left, right, top, bottom, times, pointXs, firstTime, lastTime, domainMax, x, y, xTicks, yTicks, areas }
}

export function categoryOutlinePath(segment: CategoryAreaSegment): string {
  const positions = segment.positions
  const first = positions[0]
  if (!first) return ''
  if (positions.length === 1) return `M${(first.x - 3).toFixed(2)},${first.y1.toFixed(2)} H${(first.x + 3).toFixed(2)}`
  return positions.map((position, index) => `${index ? 'L' : 'M'}${position.x.toFixed(2)},${position.y1.toFixed(2)}`).join(' ')
}

export function categoryAreaPath(segment: CategoryAreaSegment): string {
  const positions = segment.positions
  const first = positions[0]
  const last = positions.at(-1)
  if (!first || !last) return ''
  if (positions.length === 1) {
    return `M${(first.x - 3).toFixed(2)},${first.y0.toFixed(2)} V${first.y1.toFixed(2)} H${(first.x + 3).toFixed(2)} V${first.y0.toFixed(2)} Z`
  }
  const topEdge = positions.map((position, index) => `${index ? 'L' : 'M'}${position.x.toFixed(2)},${position.y1.toFixed(2)}`).join(' ')
  const bottomEdge = [...positions].reverse().map((position) => `L${position.x.toFixed(2)},${position.y0.toFixed(2)}`).join(' ')
  return `${topEdge} ${bottomEdge} Z`
}
