import { describe, expect, it } from 'vitest'

import type { CategoryChartPoint } from '../../../entities/volume/dashboard/dashboard'
import { daySchema } from '../../../entities/volume/model'
import { nearestPointIndex } from '../chart/chart-model'
import { buildCategoryChartGeometry, buildCategoryTooltipRows, categoryAreaPath, categoryOutlinePath, categoryColorVar, positionCategoryTooltip } from './category-chart-model'

function point(day: string, values: CategoryChartPoint['values'], total: number | null): CategoryChartPoint {
  return { day: daySchema.parse(day), endDay: daySchema.parse(day), values, total }
}

const points: CategoryChartPoint[] = [
  point('2026-09-28', { sports: 10, politics: 5 }, 15),
  point('2026-09-29', { sports: 20, politics: 5 }, 25),
  point('2026-09-30', { sports: 30, politics: 10 }, 40),
]

describe('category tooltip rows', () => {
  it('ranks the selected categories by the current point rather than the legend order', () => {
    const source = point('2026-04-27', { other: 95.86, culture: 18.81, weather: 22.01, world: 14.21, technology: 5.37 }, 156.26)
    const before = structuredClone(source)
    const rows = buildCategoryTooltipRows({ point: source, categories: ['other', 'culture', 'weather', 'world', 'technology'] })
    expect(rows.map((row) => row.category)).toEqual(['other', 'weather', 'culture', 'world', 'technology'])
    expect(rows[0]).toEqual({ category: 'other', value: 95.86, share: 95.86 / 156.26 })
    expect(source).toEqual(before)
  })

  it('preserves the supplied category order on ties and excludes hidden or missing categories', () => {
    const source = point('2026-04-27', { sports: 100, culture: 20, world: 20, weather: null }, 140)
    expect(buildCategoryTooltipRows({ point: source, categories: ['world', 'culture', 'weather', 'technology'] })).toEqual([
      { category: 'world', value: 20, share: 20 / 140 },
      { category: 'culture', value: 20, share: 20 / 140 },
    ])
  })

  it('keeps confirmed zero values finite without inventing rows for uncovered points', () => {
    expect(buildCategoryTooltipRows({ point: point('2026-04-27', { culture: 0, world: 0 }, 0), categories: ['culture', 'world'] })).toEqual([
      { category: 'culture', value: 0, share: 0 },
      { category: 'world', value: 0, share: 0 },
    ])
    expect(buildCategoryTooltipRows({ point: point('2026-04-27', { culture: null }, null), categories: ['culture'] })).toEqual([])
    expect(buildCategoryTooltipRows({ point: undefined, categories: ['culture'] })).toEqual([])
  })
})

describe('compact category tooltip', () => {
  it('limits rows only after ranking known selected categories', () => {
    const source = point('2026-09-30', { sports: 100, crypto: 80, other: 30, finance: 20, politics: 5, weather: 0, culture: null }, 235)
    const rows = buildCategoryTooltipRows({ point: source, categories: ['finance', 'politics', 'weather', 'culture', 'other', 'crypto', 'sports'], limit: 3 })
    expect(rows.map((row) => row.category)).toEqual(['sports', 'crypto', 'other'])
    expect(rows.map((row) => row.value)).toEqual([100, 80, 30])
  })

  it('does not pad the tooltip when fewer than three categories have data', () => {
    expect(buildCategoryTooltipRows({ point: points[0], categories: ['sports', 'politics'], limit: 3 })).toHaveLength(2)
    expect(buildCategoryTooltipRows({ point: undefined, categories: ['sports'], limit: 3 })).toEqual([])
  })
})

describe('desktop category tooltip', () => {
  it('keeps only the top five ranked categories', () => {
    const source = point('2026-09-30', {
      sports: 100,
      crypto: 80,
      other: 30,
      finance: 20,
      politics: 5,
      weather: 2,
      culture: 1,
      technology: 0,
    }, 238)
    const rows = buildCategoryTooltipRows({
      point: source,
      categories: ['finance', 'politics', 'weather', 'culture', 'other', 'crypto', 'sports', 'technology'],
      limit: 5,
    })
    expect(rows.map((row) => row.category)).toEqual(['sports', 'crypto', 'other', 'finance', 'politics'])
  })
})

describe('category tooltip position', () => {
  const size = { width: 800, height: 420, tooltipWidth: 280, tooltipHeight: 240 }

  it('follows the cursor even when the nearest date stays unchanged', () => {
    const geometry = buildCategoryChartGeometry({ points, categories: ['sports', 'politics'], width: size.width, height: size.height })
    const first = positionCategoryTooltip({ ...size, x: 400, y: 40 })
    const second = positionCategoryTooltip({ ...size, x: 420, y: 60 })
    expect(nearestPointIndex(geometry.pointXs, 400)).toBe(nearestPointIndex(geometry.pointXs, 420))
    expect(second.left - first.left).toBe(20)
    expect(second.top - first.top).toBe(20)
  })

  it('places the tooltip on the other side near the right and bottom edges', () => {
    expect(positionCategoryTooltip({ ...size, x: 780, y: 400 })).toEqual({ left: 488, top: 148 })
  })

  it('stays below the date label band even when the cursor is near the top', () => {
    expect(positionCategoryTooltip({ ...size, x: 400, y: 0 }).top).toBe(20)
    expect(positionCategoryTooltip({ ...size, x: 400, y: 4 }).top).toBe(20)
  })

  it('keeps the mobile tooltip horizontally stable when crossing the plot', () => {
    const narrow = { width: 295, height: 360, tooltipWidth: 200, tooltipHeight: 112, compact: true }
    const left = positionCategoryTooltip({ ...narrow, x: 60, y: 150 })
    const right = positionCategoryTooltip({ ...narrow, x: 280, y: 150 })
    expect(left).toEqual(right)
    expect(right.left).toBeGreaterThanOrEqual(8)
    expect(right.left + narrow.tooltipWidth).toBeLessThanOrEqual(narrow.width - 8)
  })

  it('keeps the tooltip inside a narrow chart and clamps captured drags outside it', () => {
    const narrow = { width: 280, height: 280, tooltipWidth: 264, tooltipHeight: 240 }
    expect(positionCategoryTooltip({ ...narrow, x: 140, y: 140 })).toEqual({ left: 8, top: 20 })
    expect(positionCategoryTooltip({ ...size, x: -100, y: -100 })).toEqual({ left: 8, top: 20 })
    expect(positionCategoryTooltip({ ...size, x: 1000, y: 600 })).toEqual({ left: 512, top: 172 })
  })
})

describe('category area geometry', () => {
  it('stacks categories in the given order with the largest at the bottom', () => {
    const geometry = buildCategoryChartGeometry({ points, categories: ['sports', 'politics'], width: 800, height: 336 })
    const sports = geometry.areas[0]
    const politics = geometry.areas[1]
    expect(sports?.category).toBe('sports')
    expect(politics?.category).toBe('politics')
    const firstSports = sports?.segments[0]?.positions[0]
    const firstPolitics = politics?.segments[0]?.positions[0]
    expect(firstSports?.y0).toBe(geometry.y(0))
    expect(firstSports?.y1).toBe(geometry.y(10))
    expect(firstPolitics?.y0).toBe(geometry.y(10))
    expect(firstPolitics?.y1).toBe(geometry.y(15))
  })

  it('uses daily totals for the USD domain and keeps zero on the baseline', () => {
    const geometry = buildCategoryChartGeometry({ points, categories: ['sports', 'politics'], width: 800, height: 336 })
    expect(geometry.domainMax).toBeGreaterThanOrEqual(40)
    expect(geometry.y(0)).toBe(geometry.bottom)
    expect(geometry.y(geometry.domainMax)).toBe(geometry.top)
  })

  it('breaks every band at an uncovered day instead of bridging it', () => {
    const withGap: CategoryChartPoint[] = [
      points[0]!,
      point('2026-09-29', { sports: null, politics: null }, null),
      points[2]!,
    ]
    const geometry = buildCategoryChartGeometry({ points: withGap, categories: ['sports', 'politics'], width: 800, height: 336 })
    for (const area of geometry.areas) {
      expect(area.segments).toHaveLength(2)
    }
    const path = categoryAreaPath(geometry.areas[0]!.segments[0]!)
    expect(path).not.toContain('NaN')
    expect(path.startsWith('M')).toBe(true)
    expect(path.endsWith('Z')).toBe(true)
  })

  it('renders a single-point segment as a finite band', () => {
    const single = buildCategoryChartGeometry({ points: [points[0]!], categories: ['sports'], width: 320, height: 280 })
    const path = categoryAreaPath(single.areas[0]!.segments[0]!)
    expect(path).not.toContain('NaN')
    expect(path).toContain('Z')
    expect(single.xTicks.map((tick) => tick.day)).toEqual(['2026-09-28'])
  })

  it('uses the presentation domain without renicing intermediate animation values', () => {
    const geometry = buildCategoryChartGeometry({ points, categories: ['sports', 'politics'], width: 800, height: 336, domain: 57.25 })
    expect(geometry.domainMax).toBe(57.25)
    expect(geometry.y(57.25)).toBe(geometry.top)
    expect(geometry.areas[0]?.segments[0]?.positions[0]?.y1).toBe(geometry.y(10))
  })

  it('outlines only the upper boundary, leaving the gradient band open', () => {
    expect(categoryOutlinePath({ positions: [{ x: 10, y0: 100, y1: 60 }, { x: 20, y0: 90, y1: 40 }] })).toBe('M10.00,60.00 L20.00,40.00')
    expect(categoryOutlinePath({ positions: [{ x: 10, y0: 100, y1: 60 }] })).toBe('M7.00,60.00 H13.00')
    expect(categoryOutlinePath({ positions: [] })).toBe('')
  })

  it('maps categories to their theme color variables', () => {
    expect(categoryColorVar('sports')).toBe('var(--category-sports)')
    const geometry = buildCategoryChartGeometry({ points, categories: ['crypto'], width: 800, height: 336 })
    expect(geometry.areas[0]?.color).toBe('var(--category-crypto)')
  })
})
