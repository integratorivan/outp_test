import { createElement, createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { VolumePoint } from '../../../entities/volume/dashboard/dashboard'
import { formatCompactPeriod, formatShortPeriod } from '../../../entities/volume/lib/format'
import { daySchema } from '../../../entities/volume/model'
import { VolumeChart } from './volume-chart'

const day = daySchema.parse('2026-09-28')
const endDay = daySchema.parse('2026-10-04')

describe('platform chart date label', () => {
  it.each(['day', 'week'] as const)('reserves a label above the plot for the selected %s', (granularity) => {
    const point: VolumePoint = {
      day,
      endDay: granularity === 'week' ? endDay : day,
      kalshi: 10,
      polymarket: null,
    }
    const html = renderToStaticMarkup(createElement(VolumeChart, {
      points: [point],
      visiblePlatforms: ['kalshi', 'polymarket'],
      granularity,
      scale: 'linear',
      svgRef: createRef<SVGSVGElement>(),
    }))
    expect(html).toContain('data-chart-date=""')
    expect(html.indexOf('data-chart-date')).toBeLessThan(html.indexOf('<svg'))
    expect(html).toContain(
      granularity === 'week'
        ? formatCompactPeriod(point.day, point.endDay)
        : formatShortPeriod(point.day, point.endDay),
    )
    expect(html).toContain('Polymarket: Нет данных')
  })

  it('labels the actual dates and duration of a partial calendar week', () => {
    const lastDay = daySchema.parse('2026-10-01')
    const html = renderToStaticMarkup(createElement(VolumeChart, {
      points: [{ day, endDay: lastDay, kalshi: 40, polymarket: 0 }],
      visiblePlatforms: ['kalshi', 'polymarket'],
      granularity: 'week',
      scale: 'linear',
      svgRef: createRef<SVGSVGElement>(),
    }))
    expect(html).toContain(`${formatCompactPeriod(day, lastDay)} · 4 дня`)
    expect(html).toContain('Kalshi: $40. Polymarket: $0.')
    expect(html).not.toContain('04.10.26')
  })

  it('dashes the trailing incomplete week and keeps it selectable', () => {
    const lastDay = daySchema.parse('2026-10-01')
    const html = renderToStaticMarkup(createElement(VolumeChart, {
      points: [
        { day: daySchema.parse('2026-09-21'), endDay: daySchema.parse('2026-09-27'), kalshi: 70, polymarket: 0 },
        { day, endDay: lastDay, kalshi: 40, polymarket: 0, incompleteWeek: true },
      ],
      visiblePlatforms: ['kalshi', 'polymarket'],
      granularity: 'week',
      scale: 'linear',
      svgRef: createRef<SVGSVGElement>(),
    }))
    expect(html).toContain(`${formatCompactPeriod(day, lastDay)} · 4 дня`)
    expect(html).toContain('Kalshi: $40. Polymarket: $0.')
    expect(html).toContain('stroke-dasharray="5 5"')
    expect(html).not.toContain('неполная неделя')
  })

  it('labels a gapped week with a known sum as incomplete data', () => {
    const html = renderToStaticMarkup(createElement(VolumeChart, {
      points: [{ day, endDay, kalshi: 40, polymarket: 20, partial: true }],
      visiblePlatforms: ['kalshi', 'polymarket'],
      granularity: 'week',
      scale: 'linear',
      svgRef: createRef<SVGSVGElement>(),
    }))
    expect(html).toContain(`${formatCompactPeriod(day, endDay)} · неполные данные`)
    expect(html).toContain('Kalshi: $40. Polymarket: $20.')
  })
})
