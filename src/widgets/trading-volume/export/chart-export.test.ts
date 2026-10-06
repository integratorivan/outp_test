import { describe, expect, it } from 'vitest'

import { dashboardCategories } from '../../../entities/volume/categories'
import type { CategoryChartPoint, VolumePoint } from '../../../entities/volume/dashboard/dashboard'
import { daySchema } from '../../../entities/volume/model'
import { buildCategoryCsv, buildChartExportMetadata, buildVolumeCsv, chartExportFilename } from './chart-export'

const points: VolumePoint[] = [
  { day: daySchema.parse('2026-09-21'), endDay: daySchema.parse('2026-09-27'), kalshi: 0, polymarket: null },
  { day: daySchema.parse('2026-09-28'), endDay: daySchema.parse('2026-10-04'), kalshi: 1250.75, polymarket: 3500.5 },
]

const categoryPoints: CategoryChartPoint[] = [
  { day: daySchema.parse('2026-09-21'), endDay: daySchema.parse('2026-09-27'), total: null, values: { sports: null } },
  { day: daySchema.parse('2026-09-28'), endDay: daySchema.parse('2026-10-04'), total: 4751.25, values: { sports: 1250.75, politics: 3500.5 } },
]

describe('chart export', () => {
  it.each([
    ['2026-09-02', '2026-10-01', 'Объём по категориям · 2 сент. – 1 окт. 2026'],
    ['2026-10-01', '2026-10-07', 'Объём по категориям · 1 окт. – 7 окт. 2026'],
    ['2026-10-01', '2026-10-01', 'Объём по категориям · 1 окт. 2026'],
    ['2025-12-29', '2026-01-04', 'Объём по категориям · 29 дек. 2025 – 4 янв. 2026'],
  ])('includes the displayed period from %s to %s in the image title', (start, end, title) => {
    expect(buildChartExportMetadata({
      view: 'categories',
      period: { startDay: daySchema.parse(start), endDay: daySchema.parse(end) },
      categories: [...dashboardCategories].reverse(),
    })).toEqual({ title, categorySelection: 'Категории: все' })
  })

  it('names only selected categories in the supplied visual order', () => {
    expect(buildChartExportMetadata({
      view: 'categories',
      period: null,
      categories: ['sports', 'crypto', 'politics'],
    })).toEqual({
      title: 'Объём по категориям',
      categorySelection: 'Категории: Спорт, Криптовалюты, Политика',
    })
  })

  it('labels a single-platform category export so its totals are not mistaken for the combined market', () => {
    expect(buildChartExportMetadata({
      view: 'categories',
      period: null,
      categories: ['sports'],
      visiblePlatforms: ['kalshi'],
    }).title).toBe('Объём по категориям · Kalshi')
  })

  it('labels the platform view while retaining its category filter context', () => {
    expect(buildChartExportMetadata({
      view: 'platforms',
      period: { startDay: daySchema.parse('2026-09-21'), endDay: daySchema.parse('2026-10-04') },
      categories: ['sports'],
    })).toEqual({
      title: 'Объём по платформам · 21 сент. – 4 окт. 2026',
      categorySelection: 'Категории: Спорт',
    })
  })

  it('exports unformatted USD values, leaving missing data blank rather than zero', () => {
    expect(buildVolumeCsv({ points, visiblePlatforms: ['kalshi', 'polymarket'] })).toBe(
      '\uFEFFperiod_start,period_end,kalshi_usd,polymarket_usd\r\n' +
      '2026-09-21,2026-09-27,0,\r\n' +
      '2026-09-28,2026-10-04,1250.75,3500.5\r\n',
    )
  })

  it('includes only visible platforms and the supplied filtered points', () => {
    expect(buildVolumeCsv({ points: points.slice(1), visiblePlatforms: ['polymarket'] })).toBe(
      '\uFEFFperiod_start,period_end,polymarket_usd\r\n2026-09-28,2026-10-04,3500.5\r\n',
    )
  })

  it('exports category totals and per-category USD values, leaving missing data blank', () => {
    expect(buildCategoryCsv({ points: categoryPoints, categories: ['sports', 'politics'] })).toBe(
      '\uFEFFperiod_start,period_end,total_usd,sports_usd,politics_usd\r\n' +
      '2026-09-21,2026-09-27,,,\r\n' +
      '2026-09-28,2026-10-04,4751.25,1250.75,3500.5\r\n',
    )
  })

  it('names downloads by the full displayed interval, including the end of the last week', () => {
    expect(chartExportFilename(points)).toBe('outpoll-volume-2026-09-21-2026-10-04')
    expect(chartExportFilename(categoryPoints)).toBe('outpoll-volume-2026-09-21-2026-10-04')
    expect(chartExportFilename([])).toBe('outpoll-volume')
  })
})
