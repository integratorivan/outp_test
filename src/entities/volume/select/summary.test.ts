import { describe, expect, it } from 'vitest'

import type { VolumePoint } from '../dashboard/dashboard'
import { daySchema } from '../model'
import { selectVolumeSummary } from './summary'

function point(kalshi: number | null, polymarket: number | null): VolumePoint {
  const day = daySchema.parse('2026-10-01')
  return { day, endDay: day, kalshi, polymarket }
}

describe('volume summary', () => {
  it('sums the displayed observations and calculates shares, not growth', () => {
    const summary = selectVolumeSummary([point(60, 10), point(30, 20)])
    expect(summary.kalshi.total).toBe(90)
    expect(summary.polymarket.total).toBe(30)
    expect(summary.kalshi.share).toBe(0.75)
    expect(summary.polymarket.share).toBe(0.25)
  })

  it('compares complete equal-length periods independently for each platform', () => {
    const summary = selectVolumeSummary([point(56, 30), point(56, 20)], [point(50, 50), point(50, 50)])
    expect(summary.kalshi.change).toBe(0.12)
    expect(summary.polymarket.change).toBe(-0.5)
  })

  it('withholds change for missing coverage in either period or a different length', () => {
    expect(selectVolumeSummary([point(100, 100), point(100, null)], [point(50, 50), point(50, 50)]).polymarket.change).toBeNull()
    const summary = selectVolumeSummary([point(100, 100), point(100, 100)], [point(50, null), point(50, 50)])
    expect(summary.kalshi.change).toBe(1)
    expect(summary.polymarket.change).toBeNull()
    expect(selectVolumeSummary([point(100, 100)], [point(50, 50), point(50, 50)]).kalshi.change).toBeNull()
    expect(selectVolumeSummary([point(100, 100)]).kalshi.change).toBeNull()
  })

  it('handles flat, zero and newly active volume without dividing by zero', () => {
    expect(selectVolumeSummary([point(100, 0)], [point(100, 50)]).kalshi.change).toBe(0)
    expect(selectVolumeSummary([point(100, 0)], [point(100, 50)]).polymarket.change).toBe(-1)
    expect(selectVolumeSummary([point(100, 0)], [point(0, 0)]).kalshi.change).toBeNull()
    expect(selectVolumeSummary([point(100, 0)], [point(0, 0)]).polymarket.change).toBeNull()
  })

  it('does not report missing platform data as zero or a 100% share', () => {
    const summary = selectVolumeSummary([point(100, null)])
    expect(summary.polymarket.total).toBeNull()
    expect(summary.polymarket.availablePoints).toBe(0)
    expect(summary.kalshi.share).toBeNull()
    expect(summary.polymarket.share).toBeNull()
  })

  it('marks partial sums and does not compare different coverage', () => {
    const summary = selectVolumeSummary([point(100, null), point(200, 50)])
    expect(summary.polymarket.total).toBe(50)
    expect(summary.polymarket.availablePoints).toBe(1)
    expect(summary.polymarket.expectedPoints).toBe(2)
    expect(summary.kalshi.share).toBeNull()
    expect(summary.polymarket.share).toBeNull()
  })

  it('preserves confirmed zero volume without dividing by zero', () => {
    const summary = selectVolumeSummary([point(0, 0)])
    expect(summary.kalshi.total).toBe(0)
    expect(summary.polymarket.total).toBe(0)
    expect(summary.kalshi.share).toBeNull()
  })

  it('distinguishes an empty selection from a zero-volume period', () => {
    const summary = selectVolumeSummary([])
    expect(summary.kalshi.total).toBeNull()
    expect(summary.polymarket.total).toBeNull()
    expect(summary.kalshi.expectedPoints).toBe(0)
  })
})
