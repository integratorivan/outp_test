import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { dashboardCategories } from '../../../entities/volume/categories'
import { daySchema } from '../../../entities/volume/model'
import { selectCategoryBreakdown } from '../../../entities/volume/select/selectors'
import { selectVolumeSummary } from '../../../entities/volume/select/summary'
import type { VolumeDashboard } from '../use-volume-dashboard'
import { VolumeSummary } from './volume-summary'

const completeDashboard: VolumeDashboard = {
  points: [],
  granularity: 'day',
  period: null,
  categoryPoints: [],
  categoryPeriod: null,
  summary: {
    polymarket: { total: 100, share: 0.25, change: 0.12, availablePoints: 1, expectedPoints: 1, missingDays: [], commonDays: 1, shareBasisDays: 1, changeBasisDays: 1 },
    kalshi: { total: 300, share: 0.75, change: -0.05, availablePoints: 1, expectedPoints: 1, missingDays: [], commonDays: 1, shareBasisDays: 1, changeBasisDays: 1 },
  },
  summaryGranularity: 'day',
  summaryPeriod: {
    days: 30,
    full: false,
    previous: { startDay: daySchema.parse('2026-08-02'), endDay: daySchema.parse('2026-08-31') },
  },
  window: null,
  bounds: null,
  historyPoints: [],
  orderedCategories: [...dashboardCategories],
  categoryBreakdown: selectCategoryBreakdown([], {}),
  isLoading: false,
  isFetching: false,
  hasError: false,
  sourceErrors: [],
}

function renderSummary(dashboard: VolumeDashboard) {
  return renderToStaticMarkup(createElement(VolumeSummary, { dashboard }))
}

describe('VolumeSummary', () => {
  it('keeps the platform name, amount and delta in each card and the share on one bar', () => {
    const html = renderSummary(completeDashboard)

    expect(html).toContain('data-platform="polymarket"')
    expect(html).toContain('data-platform="kalshi"')
    expect(html.match(/data-variant="stat"/g)).toHaveLength(2)
    expect(html).toContain('Polymarket</h2>')
    expect(html).toContain('Kalshi</h2>')
    expect(html).not.toContain('Оборот за')
    expect(html).toContain('$100')
    expect(html).toContain('$300')
    expect(html).toContain('aria-label="Доля оборота: Polymarket 25%, Kalshi 75%"')
    expect(html.match(/role="img"/g)).toHaveLength(1)
    expect(html).not.toContain('всего оборота')
    expect(html).not.toContain('role="meter"')
    expect(html).toContain('+12%')
    expect(html).toContain('-5%')
    expect(html.match(/к пред\. периоду/g)).toHaveLength(2)
    expect(html).toContain('К предыдущему периоду: 2–31 августа 2026')
    expect(html).not.toMatch(/к \d+ дням/)
    expect(html).toContain('text-positive')
    expect(html).toContain('text-destructive')
    expect(html).not.toContain('data-caveat')
    expect(html).not.toContain('по 1 общему дню')
  })

  it('shows compact amounts with exact totals in titles', () => {
    const html = renderSummary({
      ...completeDashboard,
      summary: {
        polymarket: { ...completeDashboard.summary.polymarket, total: 2_161_633_016 },
        kalshi: { ...completeDashboard.summary.kalshi, total: 13_665_575_548 },
      },
    })
    expect(html).toContain('$2.16B')
    expect(html).toContain('$13.7B')
    expect(html).toContain('title="$2,161,633,016"')
    expect(html).toContain('title="$13,665,575,548"')
  })

  it.each([7, 14, 90])('names the previous window instead of “к %s дням”', (days) => {
    const previous = completeDashboard.summaryPeriod?.previous ?? null
    const html = renderSummary({ ...completeDashboard, summaryPeriod: { days, full: false, previous } })
    expect(html.match(/к пред\. периоду/g)).toHaveLength(2)
    expect(html).toContain('К предыдущему периоду: 2–31 августа 2026')
    expect(html).not.toContain('Оборот за')
    expect(html).not.toMatch(/к \d+ дням/)
  })

  it('does not compare all-time totals to an invented previous period', () => {
    const html = renderSummary({ ...completeDashboard, summaryPeriod: { days: 400, full: true, previous: null } })
    expect(html).not.toContain('Оборот за')
    expect(html).not.toContain('к пред. периоду')
    expect(html).not.toContain('Сравнение недоступно')
  })

  it('does not turn missing data into a zero amount or share', () => {
    const html = renderSummary({ ...completeDashboard, summary: selectVolumeSummary([]) })

    expect(html.match(/Нет данных/g)).toHaveLength(2)
    expect(html.match(/data-caveat="true"/g)).toHaveLength(2)
    expect(html).not.toContain('Доля общего оборота недоступна')
    expect(html).not.toContain('role="img"')
    expect(html).not.toContain('$0')
    expect(html).not.toContain('0.0%')
  })

  it('shows coverage footnotes and intersection share for a partial period', () => {
    const summary = selectVolumeSummary([
      { day: daySchema.parse('2026-10-03'), endDay: daySchema.parse('2026-10-03'), kalshi: 100, polymarket: null },
      { day: daySchema.parse('2026-10-04'), endDay: daySchema.parse('2026-10-04'), kalshi: 200, polymarket: 50 },
    ])
    const html = renderSummary({ ...completeDashboard, summary })

    expect(html).toContain('$50')
    expect(html).toContain('$300')
    expect(html).toContain('1 из 2 дня')
    expect(html).toContain('нет данных 3 окт. 2026')
    expect(html).toContain('aria-label="Доля оборота: Polymarket 20%, Kalshi 80%"')
    expect(html).toContain('по 1 общему дню')
    expect(html.match(/data-caveat="true"/g)).toHaveLength(2)
    expect(html).not.toContain('Неполный период')
    expect(html).not.toContain('всего оборота')
    expect(html).not.toContain('2 из 2')
  })

  it('shows loading placeholders instead of stale amounts and shares', () => {
    const html = renderSummary({ ...completeDashboard, isLoading: true })

    expect(html.match(/aria-busy="true"/g)).toHaveLength(2)
    expect(html.match(/aria-label="Загрузка оборота"/g)).toHaveLength(2)
    expect(html).not.toContain('$100')
    expect(html).not.toContain('$300')
    expect(html).not.toContain('%')
  })
})
