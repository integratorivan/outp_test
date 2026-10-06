import { createElement, createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { dashboardCategories } from '../../../entities/volume/categories'
import type { CategoryChartPoint } from '../../../entities/volume/dashboard/dashboard'
import { formatPeriod } from '../../../entities/volume/lib/format'
import { daySchema } from '../../../entities/volume/model'
import { CategoryAreaChart } from './category-area-chart'

const day = daySchema.parse('2026-09-30')

function renderChart(point: CategoryChartPoint) {
  return renderToStaticMarkup(createElement(CategoryAreaChart, {
    points: [point],
    orderedCategories: dashboardCategories,
    categories: dashboardCategories,
    granularity: point.day === point.endDay ? 'day' : 'week',
    onActivePointChange: () => {},
    svgRef: createRef<SVGSVGElement>(),
  }))
}

describe('category chart interaction', () => {
  it('keeps the date accessible without an extra summary above the plot', () => {
    const html = renderChart({ day, endDay: day, total: 235, values: { sports: 100, crypto: 80, other: 30, finance: 20, politics: 5 } })
    expect(html).toContain('30 сентября 2026 г.')
    expect(html).not.toContain('30.09.26')
    expect(html).toContain('Итого: $235')
    expect(html).not.toContain('data-category-preview')
    expect(html).not.toContain('Ещё')
    expect(html).not.toMatch(/<li\b/)
  })

  it('keeps a full weekly period and confirmed zero in the accessible value', () => {
    const endDay = daySchema.parse('2026-10-06')
    const html = renderChart({ day, endDay, total: 0, values: { sports: 0 } })
    expect(html).toContain(formatPeriod(day, endDay))
    expect(html).toContain('Итого: $0')
    expect(html).not.toContain('Ещё')
  })

  it('renders subtle gradients and separate outlines without a mount fade', () => {
    const html = renderChart({ day, endDay: day, total: 100, values: { sports: 100 } })
    expect(html).toContain('data-category-series="sports"')
    expect(html).toContain('<linearGradient')
    expect(html).toContain('category-gradient-top')
    expect(html).toContain('category-boundary')
    expect(html).not.toContain('fill-opacity="0.88"')
    expect(html).not.toContain('opacity:0')
  })

  it('distinguishes missing data from confirmed zero', () => {
    const html = renderChart({ day, endDay: day, total: null, values: { sports: null } })
    expect(html).toContain('aria-valuetext="Нет данных"')
    expect(html).not.toContain('Итого: $0')
    expect(html).not.toMatch(/<li\b/)
  })

  it('marks known sums with missing platform data instead of calling them complete totals', () => {
    const html = renderChart({ day, endDay: day, total: 235, values: { sports: 235 }, partial: true })
    expect(html).toContain('Известный оборот: $235. Неполные данные.')
    expect(html).not.toContain('Итого:')
  })

  it('dashes a partial point with a pale fill', () => {
    const html = renderChart({ day, endDay: day, total: 20, values: { sports: 20 }, partial: true })
    expect(html).toContain('Известный оборот: $20. Неполные данные.')
    expect(html).toContain('stroke-dasharray="5 5"')
    expect(html).toContain('category-partial-fill')
    expect(html).not.toContain('неполная неделя')
  })
})
