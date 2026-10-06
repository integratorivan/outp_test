import { describe, expect, it } from 'vitest'

import type { VolumePoint } from '../../../entities/volume/dashboard/dashboard'
import { daySchema, type Day } from '../../../entities/volume/model'
import { buildChartGeometry, buildDateTicks, nearestPointIndex } from './chart-model'

function point(day: string, kalshi: number | null, polymarket: number | null): VolumePoint {
  return { day: daySchema.parse(day), endDay: daySchema.parse(day), kalshi, polymarket }
}
const points = [point('2026-09-28', 10, 100), point('2026-09-29', 20, 200), point('2026-09-30', 30, 300)]
function geometry(data: readonly VolumePoint[] = points) {
  return buildChartGeometry({ points: data, visiblePlatforms: ['kalshi', 'polymarket'], width: 800, height: 336 })
}

describe('chart geometry', () => {
  it.each([0, 18, 26, 44])('keeps plot bounds ordered during a narrow layout at width %s', (width) => {
    const chart = buildChartGeometry({ points, visiblePlatforms: ['kalshi', 'polymarket'], width, height: 280 })
    expect(chart.right).toBeGreaterThanOrEqual(chart.left)
    expect(chart.pointXs.every((x) => Number.isFinite(x) && x >= chart.left && x <= chart.right)).toBe(true)
  })
  it('uses one USD domain from visible series with a zero baseline', () => {
    const both = geometry()
    const kalshi = buildChartGeometry({ points, visiblePlatforms: ['kalshi'], width: 800, height: 336 })
    expect(both.domainMax).toBeGreaterThanOrEqual(300)
    expect(kalshi.domainMax).toBeGreaterThanOrEqual(30)
    expect(kalshi.domainMax).toBeLessThan(both.domainMax)
    expect(both.y(0)).toBe(both.bottom)
    expect(both.y(both.domainMax)).toBe(both.top)
    expect(kalshi.series.map((series) => series.platform)).toEqual(['kalshi'])
  })

  it.each(['linear', 'symlog'] as const)('uses an exact intermediate Y domain for %s animation', (scale) => {
    const chart = buildChartGeometry({ points, visiblePlatforms: ['kalshi'], width: 800, height: 336, scale, domain: 57.25 })
    expect(chart.domainMax).toBe(57.25)
    expect(chart.camera.domainMax).toBe(57.25)
    expect(chart.y(57.25)).toBeCloseTo(chart.top)
    expect(chart.y(0)).toBe(chart.bottom)
  })

  it('does not join lines across null values or absent days', () => {
    const withGap = geometry([point('2026-09-28', 10, 100), point('2026-09-29', null, 0), point('2026-09-30', 30, 300), point('2026-10-02', 40, 400)])
    expect(withGap.series[0]?.path.match(/M/g)).toHaveLength(3)
    expect(withGap.series[0]?.isolated).toHaveLength(3)
    expect(withGap.series[1]?.path.match(/M/g)).toHaveLength(2)
  })

  it('connects adjacent weekly intervals rather than treating them as daily gaps', () => {
    const weeks = [
      { ...point('2026-09-21', 10, 20), endDay: daySchema.parse('2026-09-27') },
      { ...point('2026-09-28', 20, 40), endDay: daySchema.parse('2026-10-04') },
    ]
    expect(geometry(weeks).series[0]?.path.match(/M/g)).toHaveLength(1)
    expect(geometry(weeks).series[0]?.path.match(/L/g)).toHaveLength(1)
  })

  it('dashes only the connector into a partial week', () => {
    const weeks = [
      { ...point('2026-09-21', 10, 20), endDay: daySchema.parse('2026-09-27') },
      { ...point('2026-09-28', 20, 40), endDay: daySchema.parse('2026-10-04'), partial: true, partialPlatforms: ['kalshi', 'polymarket'] as const },
    ]
    const chart = geometry(weeks)
    expect(chart.series[0]?.segments).toHaveLength(2)
    expect(chart.series[0]?.segments[0]?.dashed).toBeUndefined()
    expect(chart.series[0]?.segments[1]?.dashed).toBe(true)
    expect(chart.series[0]?.segments[1]?.positions).toHaveLength(2)
  })

  it('dashes a gapped week that still has a known sum', () => {
    const weeks = [
      { ...point('2026-09-21', 10, 20), endDay: daySchema.parse('2026-09-27') },
      { ...point('2026-09-28', 40, 20), endDay: daySchema.parse('2026-10-04'), partial: true, partialPlatforms: ['kalshi', 'polymarket'] as const },
    ]
    const chart = geometry(weeks)
    expect(chart.series[0]?.segments[1]?.dashed).toBe(true)
    expect(chart.series[0]?.segments[1]?.positions).toHaveLength(2)
    expect(chart.series[1]?.segments[1]?.dashed).toBe(true)
  })

  it('keeps a complete platform solid when only the other platform is missing days', () => {
    const weeks = [
      { ...point('2026-09-21', 10, 20), endDay: daySchema.parse('2026-09-27') },
      { ...point('2026-09-28', 40, 20), endDay: daySchema.parse('2026-10-04'), partial: true, partialPlatforms: ['kalshi'] as const },
    ]
    const chart = geometry(weeks)
    expect(chart.series[0]?.segments[1]?.dashed).toBe(true)
    expect(chart.series[1]?.segments).toHaveLength(1)
    expect(chart.series[1]?.segments[0]?.dashed).toBeUndefined()
    expect(chart.series[1]?.segments[0]?.positions).toHaveLength(2)
  })

  it('drops an x label closer than 40px to the previous one and keeps the last', () => {
    const days = ['2026-08-17', '2026-08-24', '2026-09-28', '2026-10-05'].map((day) => daySchema.parse(day))
    const positions = [100, 130, 400, 430]
    const x = (day: Day) => positions[days.indexOf(day)] ?? 0
    const ticks = buildDateTicks({
      days,
      firstTime: Date.parse(days[0] ?? '2026-08-17'),
      lastTime: Date.parse(days.at(-1) ?? '2026-10-05'),
      width: 800,
      left: 64,
      right: 784,
      x,
    })
    expect(ticks.map((tick) => tick.day)).toEqual(['2026-08-17', '2026-10-05'])
    for (let index = 1; index < ticks.length; index += 1) {
      expect((ticks[index]?.x ?? 0) - (ticks[index - 1]?.x ?? 0)).toBeGreaterThanOrEqual(40)
    }
  })

  it('uses actual elapsed dates for X position', () => {
    const sparse = geometry([point('2026-09-01', 0, 0), point('2026-09-02', 0, 0), point('2026-09-11', 0, 0)])
    expect(sparse.x(daySchema.parse('2026-09-02')) - sparse.left).toBeCloseTo((sparse.right - sparse.left) / 10)
  })

  it('handles a zero-only, single-point, or empty chart without invalid coordinates', () => {
    const single = geometry([point('2026-10-01', 0, null)])
    expect(single.domainMax).toBeGreaterThan(0)
    expect(single.x(daySchema.parse('2026-10-01'))).toBe((single.left + single.right) / 2)
    expect(single.series[0]?.isolated).toHaveLength(1)
    expect(geometry([]).xTicks).toEqual([])
    expect(geometry([]).series[0]?.path).toBe('')
  })

  it.each([312, 800])('labels every day of a seven-day range at width %s', (width) => {
    const week = ['2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'].map((day) => point(day, 10, 20))
    const chart = buildChartGeometry({ points: week, visiblePlatforms: ['kalshi'], width, height: 336 })
    expect(chart.xTicks.map((tick) => tick.day)).toEqual(week.map((point) => point.day))
    expect(chart.pointXs).toHaveLength(7)
  })

  it('uses calendar months and year boundaries rather than sampled observation dates for long histories', () => {
    const long = [point('2021-07-02', 10, null), point('2026-10-01', 30, 40)]
    const chart = buildChartGeometry({ points: long, visiblePlatforms: ['kalshi'], width: 1280, height: 420 })
    const days = chart.xTicks.map((tick) => tick.day)
    expect(days[0]).toBe('2021-07-02')
    for (const year of [2022, 2023, 2024, 2025, 2026]) {
      expect(days).toContain(`${year}-01-01`)
      expect(days).toContain(`${year}-05-01`)
      expect(days).toContain(`${year}-09-01`)
    }
    expect(chart.xTicks.every((tick) => tick.x >= chart.left && tick.x <= chart.right)).toBe(true)
  })

  it('keeps calendar labels spaced apart on mobile without inventing observations', () => {
    const long = [point('2021-07-02', 10, null), point('2026-10-01', 30, 40)]
    const narrow = buildChartGeometry({ points: long, visiblePlatforms: ['kalshi'], width: 312, height: 280 })
    expect(narrow.xTicks.length).toBeLessThanOrEqual(4)
    for (let index = 1; index < narrow.xTicks.length; index += 1) {
      expect((narrow.xTicks[index]?.x ?? 0) - (narrow.xTicks[index - 1]?.x ?? 0)).toBeGreaterThanOrEqual(64)
    }
    expect(narrow.series[0]?.segments).toHaveLength(2)
  })

  it('limits labels on a narrow viewport', () => {
    const narrow = buildChartGeometry({ points, visiblePlatforms: ['kalshi'], width: 312, height: 280 })
    expect(narrow.xTicks.length).toBeLessThanOrEqual(3)
    expect(narrow.left).toBeLessThan(narrow.right)
    expect(narrow.xTicks.every((tick) => tick.x >= narrow.left && tick.x <= narrow.right)).toBe(true)
  })
})

describe('symlog lines', () => {
  const data = [point('2026-09-28', 0, null), point('2026-09-29', 1_000_000, null), point('2026-09-30', 1_000_000_000, 100_000_000)]
  function logarithmic(points: readonly VolumePoint[] = data) {
    return buildChartGeometry({ points, visiblePlatforms: ['kalshi', 'polymarket'], width: 800, height: 336, scale: 'symlog' })
  }

  it('shows powers of ten in USD while keeping zero on the baseline', () => {
    const chart = logarithmic()
    expect(chart.yTicks).toEqual([0, 1_000_000, 10_000_000, 100_000_000, 1_000_000_000])
    expect(chart.y(0)).toBe(chart.bottom)
    expect(chart.y(chart.domainMax)).toBe(chart.top)
    const linear = geometry(data)
    expect(chart.y(1_000_000)).toBeLessThan(linear.y(1_000_000))
    for (const value of chart.yTicks) expect(Number.isFinite(chart.y(value))).toBe(true)
  })

  it('retains confirmed zeros and gaps without inventing missing values', () => {
    const chart = logarithmic([point('2026-09-28', 0, null), point('2026-09-29', null, 1_000_000), point('2026-09-30', 10_000_000, null)])
    expect(chart.series[0]?.segments).toHaveLength(2)
    expect(chart.series[0]?.isolated[0]?.y).toBe(chart.bottom)
    expect(chart.series[1]?.isolated).toHaveLength(1)
    expect(chart.series.every((series) => !/NaN|Infinity/.test(series.path))).toBe(true)
  })

  it('handles empty, zero-only and sub-million categories with finite coordinates', () => {
    for (const points of [[], [point('2026-09-30', 0, null)], [point('2026-09-30', 190.84, null)]]) {
      const chart = logarithmic(points)
      expect(chart.y(0)).toBe(chart.bottom)
      expect(chart.yTicks.length).toBeGreaterThan(1)
      expect(chart.series.every((series) => !/NaN|Infinity/.test(series.path))).toBe(true)
      expect(chart.yTicks.every((value) => Number.isFinite(chart.y(value)) && chart.y(value) >= chart.top && chart.y(value) <= chart.bottom)).toBe(true)
    }
  })

  it('rescales from visible platforms and extends ticks above one billion when needed', () => {
    const chart = logarithmic([point('2026-09-30', 10_000_000_000, 10_000_000)])
    expect(chart.yTicks.at(-1)).toBe(10_000_000_000)
    const hidden = buildChartGeometry({ points: data, visiblePlatforms: ['polymarket'], width: 800, height: 336, scale: 'symlog' })
    expect(hidden.yTicks.at(-1)).toBe(100_000_000)
  })
})

describe('nearest date selection', () => {
  it('clamps outside bounds, selects the closest date and resolves ties to the earlier date', () => {
    expect(nearestPointIndex([], 0)).toBe(-1)
    expect(nearestPointIndex([10], 0)).toBe(0)
    expect(nearestPointIndex([10, 20, 30], -50)).toBe(0)
    expect(nearestPointIndex([10, 20, 30], 15)).toBe(0)
    expect(nearestPointIndex([10, 20, 30], 16)).toBe(1)
    expect(nearestPointIndex([10, 20, 30], 200)).toBe(2)
  })
})
