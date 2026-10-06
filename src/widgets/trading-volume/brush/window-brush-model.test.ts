import { describe, expect, it } from 'vitest'
import { daySchema } from '../../../entities/volume/model'
import { windowDays } from '../../../entities/volume/dashboard/dashboard'
import { brushHandleDistance, brushInset, brushViewport } from './window-brush-model'

const bounds = { firstDay: daySchema.parse('2021-06-30'), lastDay: daySchema.parse('2026-10-01') }

describe('brush context scale', () => {
  it.each([280, 360, 900])('keeps seven-day handles at least 72px apart at %spx', (width) => {
    const window = { from: daySchema.parse('2026-09-25'), to: bounds.lastDay }
    const viewport = brushViewport(window, bounds, width)
    const distance = (windowDays(window) - 1) / (windowDays(viewport) - 1) * (width - 2 * brushInset)
    expect(distance).toBeGreaterThanOrEqual(brushHandleDistance)
    expect(viewport.from <= window.from).toBe(true)
    expect(viewport.to >= window.to).toBe(true)
    expect(viewport.from >= bounds.firstDay).toBe(true)
    expect(viewport.to <= bounds.lastDay).toBe(true)
  })

  it('uses all history when the selection is wide enough', () => {
    const window = { from: bounds.firstDay, to: bounds.lastDay }
    expect(brushViewport(window, bounds, 360)).toEqual(window)
  })

  it('fits context around a middle window without changing its dates', () => {
    const window = { from: daySchema.parse('2024-01-01'), to: daySchema.parse('2024-01-07') }
    const viewport = brushViewport(window, bounds, 360)
    expect(viewport.from < window.from).toBe(true)
    expect(viewport.to > window.to).toBe(true)
    expect(window).toEqual({ from: '2024-01-01', to: '2024-01-07' })
  })
})
