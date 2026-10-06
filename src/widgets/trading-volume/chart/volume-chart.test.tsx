import { createElement, createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { VolumePoint } from '../../../entities/volume/dashboard/dashboard'
import { formatCompactPeriod, formatShortPeriod, formatWeekChartCaption } from '../../../entities/volume/lib/format'
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

  it('captions the weekly range and names a platform hole in the tooltip', () => {
    const previous = daySchema.parse('2026-09-21')
    const html = renderToStaticMarkup(createElement(VolumeChart, {
      points: [
        { day: previous, endDay: daySchema.parse('2026-09-27'), kalshi: 70, polymarket: 70, kalshiDays: 7, polymarketDays: 7 },
        { day, endDay, kalshi: 50, polymarket: 70, kalshiDays: 5, kalshiTotal: 50, polymarketDays: 7, polymarketTotal: 70, partial: true, partialPlatforms: ['kalshi'] },
      ],
      visiblePlatforms: ['kalshi', 'polymarket'],
      granularity: 'week',
      scale: 'linear',
      svgRef: createRef<SVGSVGElement>(),
    }))
    expect(html).toContain('data-week-caption=""')
    expect(html).toContain(formatWeekChartCaption(previous, endDay))
    expect(html).toContain('Kalshi: 5 из 7 дн.')
    expect(html).toContain('Kalshi: $50')
    expect(html).not.toContain('Polymarket: 5 из 7')
    expect(html).not.toContain('≈')
    expect(html).not.toContain('/день')
    expect(html).not.toContain('>в день</text>')
    expect(html).toContain('stroke-dasharray="5 5"')
  })
})
