import { describe, expect, it } from 'vitest'

import type { ChartScale, VolumePoint } from '../../../entities/volume/dashboard/dashboard'
import { daySchema } from '../../../entities/volume/model'
import { buildChartGeometry, chartCameraY } from './chart-model'
import { createChartFrame, interpolateChartFrame, sampleSeriesY } from './chart-transition'

function point(day: string, kalshi: number | null, polymarket: number | null = null): VolumePoint {
  return { day: daySchema.parse(day), endDay: daySchema.parse(day), kalshi, polymarket }
}

function frame(points: readonly VolumePoint[], scale: ChartScale = 'linear') {
  return createChartFrame(buildChartGeometry({ points, visiblePlatforms: ['kalshi', 'polymarket'], width: 800, height: 336, scale }))
}

const before = frame([point('2026-09-28', 10), point('2026-09-29', 90), point('2026-09-30', 30)])
const after = frame([point('2026-09-24', 30), point('2026-09-25', 10), point('2026-09-26', 80), point('2026-09-27', 60), point('2026-09-28', 20), point('2026-09-29', 40), point('2026-09-30', 10)])

function kalshi(frame: ReturnType<typeof createChartFrame>) {
  return frame.series.find((series) => series.platform === 'kalshi')?.segments ?? []
}

describe('chart transitions', () => {
  it('starts at the displayed frame and ends at the exact target, without accumulated sampling points', () => {
    const transition = interpolateChartFrame(before, after)
    expect(transition(0)).toBe(before)
    expect(transition(1)).toBe(after)
  })

  it('morphs a single opaque line when the number of observations changes', () => {
    const middle = interpolateChartFrame(before, after)(0.5)
    expect(kalshi(middle)).toHaveLength(1)
    expect(kalshi(middle)[0]?.opacity).toBe(1)
    const x = before.camera.left + (before.camera.right - before.camera.left) / 2
    const fromY = sampleSeriesY(kalshi(before), x)
    const toY = sampleSeriesY(kalshi(after), x)
    expect(fromY).toBeTypeOf('number')
    expect(toY).toBeTypeOf('number')
    if (fromY !== null && toY !== null) expect(sampleSeriesY(kalshi(middle), x)).toBeCloseTo((fromY + toY) / 2)
  })

  it('retains every peak from both drawings instead of downsampling the transition', () => {
    const middle = interpolateChartFrame(before, after)(0.5)
    const xs = kalshi(middle).flatMap((segment) => segment.positions.map((position) => position.x))
    for (const source of [before, after]) {
      for (const position of kalshi(source).flatMap((segment) => segment.positions)) expect(xs).toContain(position.x)
    }
  })

  it('retargets from an interrupted presentation, not from the previous destination', () => {
    const displayed = interpolateChartFrame(before, after)(0.3)
    const reverse = interpolateChartFrame(displayed, before)
    expect(reverse(0)).toBe(displayed)
    expect(reverse(1)).toBe(before)
    const x = before.camera.left
    const displayedY = sampleSeriesY(kalshi(displayed), x)
    const targetY = sampleSeriesY(kalshi(before), x)
    if (displayedY !== null && targetY !== null) expect(sampleSeriesY(kalshi(reverse(0.5)), x)).toBeCloseTo((displayedY + targetY) / 2)
  })

  it('never joins missing observations or replaces gaps with zero during a morph', () => {
    const gap = frame([point('2026-09-26', 10), point('2026-09-27', 20), point('2026-09-28', null), point('2026-09-29', 40), point('2026-09-30', 30)])
    const changed = frame([point('2026-09-26', 20), point('2026-09-27', 40), point('2026-09-28', null), point('2026-09-29', 10), point('2026-09-30', 20)])
    const middle = interpolateChartFrame(gap, changed)(0.5)
    expect(kalshi(middle)).toHaveLength(2)
    expect(sampleSeriesY(kalshi(middle), (gap.camera.left + gap.camera.right) / 2)).toBeNull()
  })

  it('fades only appearing or disappearing coverage, including isolated points', () => {
    const empty = frame([])
    const single = frame([point('2026-09-30', 10)])
    const appearing = kalshi(interpolateChartFrame(empty, single)(0.4))
    expect(appearing).toHaveLength(1)
    expect(appearing[0]?.positions).toHaveLength(1)
    expect(appearing[0]?.opacity).toBeCloseTo(0.4)
    expect(kalshi(interpolateChartFrame(single, empty)(0.4))[0]?.opacity).toBeCloseTo(0.6)
  })

  it('keeps shared axis labels unique and animates their positions with the drawing', () => {
    const middle = interpolateChartFrame(before, after)(0.5)
    expect(new Set(middle.xTicks.map((tick) => tick.key)).size).toBe(middle.xTicks.length)
    expect(new Set(middle.yTicks.map((tick) => tick.value)).size).toBe(middle.yTicks.length)
    expect(middle.xTicks.find((tick) => tick.day === '2026-09-30')?.opacity).toBe(1)
    expect(middle.yTicks.find((tick) => tick.value === 0)?.y).toBe(before.camera.bottom)
  })

  it('moves unchanged values and shared Y ticks through the same scale', () => {
    const large = frame([point('2026-09-29', 20, 300), point('2026-09-30', 40, 200)])
    const small = frame([point('2026-09-29', 20, 30), point('2026-09-30', 40, 20)])
    const middle = interpolateChartFrame(large, small)(0.5)
    expect(sampleSeriesY(kalshi(middle), middle.camera.left)).toBeCloseTo(chartCameraY(middle.camera, 20))
    const shared = middle.yTicks.find((tick) => tick.value === 0)
    expect(shared?.opacity).toBe(1)
    expect(shared?.y).toBe(middle.camera.bottom)
  })

  it('selects X label format from elapsed time, not daily or weekly observations', () => {
    const dailyHistory = frame([point('2021-06-30', 10), point('2026-10-01', 100)])
    expect(dailyHistory.xTicks.every((tick) => tick.format === 'month' || tick.format === 'year')).toBe(true)
    expect(dailyHistory.xTicks.find((tick) => tick.day === '2022-01-01')?.format).toBe('year')
    const shortWeeks = createChartFrame(buildChartGeometry({
      points: [{ ...point('2026-09-21', 300), endDay: daySchema.parse('2026-09-27') }, { ...point('2026-09-28', 600), endDay: daySchema.parse('2026-10-04') }],
      visiblePlatforms: ['kalshi'], width: 800, height: 336,
    }))
    expect(shortWeeks.xTicks.every((tick) => tick.format === 'date')).toBe(true)
  })

  it('keeps lines, ticks and camera aligned when symlog changes are interrupted', () => {
    const data = [point('2026-09-28', 0), point('2026-09-29', 1_000_000), point('2026-09-30', 1_000_000_000)]
    const linear = frame(data)
    const logarithmic = frame(data, 'symlog')
    const transition = interpolateChartFrame(linear, logarithmic)
    const middle = transition(0.4)
    const x = (middle.camera.left + middle.camera.right) / 2
    const expectedY = chartCameraY(middle.camera, 1_000_000)
    expect(sampleSeriesY(kalshi(middle), x)).toBeCloseTo(expectedY)
    expect(middle.yTicks.find((tick) => tick.value === 1_000_000)?.y).toBeCloseTo(expectedY)
    const retargeted = interpolateChartFrame(middle, linear)(0.5)
    expect(sampleSeriesY(kalshi(retargeted), x)).toBeCloseTo(chartCameraY(retargeted.camera, 1_000_000))
    expect(retargeted.yTicks.find((tick) => tick.value === 1_000_000)?.y).toBeCloseTo(chartCameraY(retargeted.camera, 1_000_000))
    expect(retargeted.yTicks.find((tick) => tick.value === 0)?.y).toBe(retargeted.camera.bottom)
    expect(transition(1)).toBe(logarithmic)
  })

  it('does not restart an already fading gap when another change interrupts it', () => {
    const full = frame([point('2026-09-26', 10), point('2026-09-27', 20), point('2026-09-28', 30), point('2026-09-29', 40), point('2026-09-30', 50)])
    const gap = frame([point('2026-09-26', 10), point('2026-09-27', 20), point('2026-09-28', null), point('2026-09-29', 40), point('2026-09-30', 50)])
    const displayed = interpolateChartFrame(full, gap)(0.6)
    const next = interpolateChartFrame(displayed, gap)(0.5)
    const center = (full.camera.left + full.camera.right) / 2
    const covering = kalshi(next).find((segment) => segment.positions.some((position) => position.x === center))
    expect(covering?.opacity).toBeCloseTo(0.2)
    expect(sampleSeriesY(kalshi(gap), center)).toBeNull()
  })

  it('handles daily to weekly topology and rapid successive changes with finite geometry', () => {
    const weeklyGeometry = buildChartGeometry({ points: [{ ...point('2026-09-21', 300), endDay: daySchema.parse('2026-09-27') }, { ...point('2026-09-28', 600), endDay: daySchema.parse('2026-10-04') }], visiblePlatforms: ['kalshi'], width: 800, height: 336 })
    const weekly = createChartFrame(weeklyGeometry)
    let displayed = before
    for (let index = 0; index < 15; index += 1) {
      displayed = interpolateChartFrame(displayed, index % 2 ? after : weekly)(0.25)
      for (const segment of kalshi(displayed)) {
        for (const position of segment.positions) expect(Number.isFinite(position.x) && Number.isFinite(position.y)).toBe(true)
      }
    }
    expect(interpolateChartFrame(displayed, weekly)(1)).toBe(weekly)
  })

  it('morphs day↔week between correctly scaled endpoints instead of parking on the wrong domain', () => {
    const daily = frame([
      point('2026-09-28', 40),
      point('2026-09-29', 50),
      point('2026-09-30', 45),
      point('2026-10-01', 55),
      point('2026-10-02', 35),
      point('2026-10-03', 60),
      point('2026-10-04', 42),
    ])
    const weekly = createChartFrame(buildChartGeometry({
      points: [{ day: daySchema.parse('2026-09-28'), endDay: daySchema.parse('2026-10-04'), kalshi: 327, polymarket: null }],
      visiblePlatforms: ['kalshi'],
      width: 800,
      height: 336,
    }))
    const x = (daily.camera.left + daily.camera.right) / 2
    const fromY = sampleSeriesY(kalshi(daily), x)
    const toY = sampleSeriesY(kalshi(weekly), x)
    expect(fromY).toBeTypeOf('number')
    expect(toY).toBeTypeOf('number')
    if (fromY === null || toY === null) return

    // Weekly totals drawn on the old daily domain park far above the plot.
    const wrongDomainY = chartCameraY(daily.camera, 327)
    const middle = interpolateChartFrame(daily, weekly)(0.5)
    const middleY = sampleSeriesY(kalshi(middle), x)
    expect(middleY).toBeTypeOf('number')
    if (middleY === null) return

    expect(middleY).toBeGreaterThanOrEqual(daily.camera.top - 1)
    expect(middleY).toBeLessThanOrEqual(daily.camera.bottom + 1)
    expect(Math.abs(middleY - wrongDomainY)).toBeGreaterThan(Math.abs(fromY - toY))
    expect(middle.camera.domainMax).toBeCloseTo(1 / ((1 / daily.camera.domainMax + 1 / weekly.camera.domainMax) / 2))
  })
})
