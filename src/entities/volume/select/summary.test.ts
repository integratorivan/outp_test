import { describe, expect, it } from 'vitest'

import { shiftDay, type VolumePoint } from '../dashboard/dashboard'
import { daySchema, type Day } from '../model'
import { selectVolumeSummary } from './summary'

function point(day: Day, kalshi: number | null, polymarket: number | null): VolumePoint {
  return { day, endDay: day, kalshi, polymarket }
}

describe('volume summary', () => {
  it('sums the displayed observations and calculates shares, not growth', () => {
    const start = daySchema.parse('2026-10-01')
    const summary = selectVolumeSummary([
      point(start, 60, 10),
      point(shiftDay(start, 1), 30, 20),
    ])
    expect(summary.kalshi.total).toBe(90)
    expect(summary.polymarket.total).toBe(30)
    expect(summary.kalshi.share).toBe(0.75)
    expect(summary.polymarket.share).toBe(0.25)
    expect(summary.kalshi.commonDays).toBe(2)
    expect(summary.kalshi.shareBasisDays).toBe(2)
  })

  it('compares complete equal-length periods independently for each platform', () => {
    const start = daySchema.parse('2026-10-01')
    const days = [start, shiftDay(start, 1)]
    const current = days.map((day, index) => point(day, index === 0 ? 56 : 56, index === 0 ? 30 : 20))
    const previous = days.map((day) => point(shiftDay(day, -2), 50, 50))
    const summary = selectVolumeSummary(current, previous)
    expect(summary.kalshi.change).toBe(0.12)
    expect(summary.polymarket.change).toBe(-0.5)
    expect(summary.kalshi.changeBasisDays).toBe(2)
  })

  it('computes change on paired shifted days only', () => {
    const start = daySchema.parse('2026-10-01')
    const d1 = shiftDay(start, 1)
    expect(
      selectVolumeSummary([point(start, 100, 100), point(d1, 100, null)], [point(shiftDay(start, -2), 50, 50), point(shiftDay(d1, -2), 50, 50)]).polymarket.change,
    ).toBe(1)
    const summary = selectVolumeSummary(
      [point(start, 100, 100), point(d1, 100, 100)],
      [point(shiftDay(start, -2), 50, null), point(shiftDay(d1, -2), 50, 50)],
    )
    expect(summary.kalshi.change).toBe(1)
    expect(summary.polymarket.change).toBe(1)
    expect(summary.kalshi.changeBasisDays).toBe(2)
    expect(summary.polymarket.changeBasisDays).toBe(1)
    expect(selectVolumeSummary([point(start, 100, 100)], [point(shiftDay(start, -2), 50, 50)]).kalshi.change).toBeNull()
    expect(selectVolumeSummary([point(start, 100, 100)]).kalshi.change).toBeNull()
  })

  it('handles flat, zero and newly active volume without dividing by zero', () => {
    const start = daySchema.parse('2026-10-01')
    const prev = shiftDay(start, -1)
    expect(selectVolumeSummary([point(start, 100, 0)], [point(prev, 100, 50)]).kalshi.change).toBe(0)
    expect(selectVolumeSummary([point(start, 100, 0)], [point(prev, 100, 50)]).polymarket.change).toBe(-1)
    expect(selectVolumeSummary([point(start, 100, 0)], [point(prev, 0, 0)]).kalshi.change).toBeNull()
    expect(selectVolumeSummary([point(start, 100, 0)], [point(prev, 0, 0)]).polymarket.change).toBeNull()
  })

  it('does not report missing platform data as zero or a 100% share', () => {
    const summary = selectVolumeSummary([point(daySchema.parse('2026-10-01'), 100, null)])
    expect(summary.polymarket.total).toBeNull()
    expect(summary.polymarket.availablePoints).toBe(0)
    expect(summary.kalshi.share).toBeNull()
    expect(summary.polymarket.share).toBeNull()
    expect(summary.kalshi.commonDays).toBe(0)
  })

  it('calculates share on intersection days when coverage is partial', () => {
    const start = daySchema.parse('2026-10-01')
    const summary = selectVolumeSummary([point(start, 100, null), point(shiftDay(start, 1), 200, 50)])
    expect(summary.polymarket.total).toBe(50)
    expect(summary.polymarket.availablePoints).toBe(1)
    expect(summary.polymarket.expectedPoints).toBe(2)
    expect(summary.kalshi.share).toBe(0.8)
    expect(summary.polymarket.share).toBe(0.2)
    expect(summary.kalshi.commonDays).toBe(1)
    expect(summary.kalshi.missingDays).toEqual([])
    expect(summary.polymarket.missingDays).toEqual([start])
  })

  it('preserves confirmed zero volume without dividing by zero', () => {
    const summary = selectVolumeSummary([point(daySchema.parse('2026-10-01'), 0, 0)])
    expect(summary.kalshi.total).toBe(0)
    expect(summary.polymarket.total).toBe(0)
    expect(summary.kalshi.share).toBeNull()
  })

  it('distinguishes an empty selection from a zero-volume period', () => {
    const summary = selectVolumeSummary([])
    expect(summary.kalshi.total).toBeNull()
    expect(summary.polymarket.total).toBeNull()
    expect(summary.kalshi.expectedPoints).toBe(0)
    expect(summary.kalshi.missingDays).toEqual([])
  })
})
