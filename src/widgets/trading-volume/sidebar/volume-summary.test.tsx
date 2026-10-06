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
  summaryPeriod: { days: 30, full: false, previous: null },
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
  it('keeps amounts and shares in separate stat cards with platform hover accents', () => {
    const html = renderSummary(completeDashboard)

    expect(html).toContain('data-platform="polymarket"')
    expect(html).toContain('data-platform="kalshi"')
    expect(html.match(/data-variant="stat"/g)).toHaveLength(2)
    expect(html).toContain('Polymarket</h2>')
    expect(html).toContain('Kalshi</h2>')
    expect(html.match(/Оборот за 30 дней/g)).toHaveLength(2)
    expect(html).toContain('$100')
    expect(html).toContain('$300')
    expect(html).toContain('25 % всего оборота')
    expect(html).toContain('75 % всего оборота')
    expect(html).toContain('по 1 общему дню')
    expect(html.match(/role="meter"/g)).toHaveLength(2)
    expect(html).toContain('aria-valuenow="25"')
    expect(html).toContain('aria-valuenow="75"')
    expect(html).toContain('+12 %')
    expect(html).toContain('-5 %')
    expect(html.match(/к 30 дням/g)?.length).toBeGreaterThanOrEqual(2)
    expect(html).toContain('text-positive')
    expect(html).toContain('text-destructive')
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

  it.each([[7, '7 дней', '7 дням'], [90, '90 дней', '90 дням']] as const)('labels the %s-day selected period and comparison consistently', (days, label, comparison) => {
    const html = renderSummary({ ...completeDashboard, summaryPeriod: { days, full: false, previous: null } })
    expect(html.match(new RegExp(`Оборот за ${label}`, 'g'))).toHaveLength(2)
    expect(html.match(new RegExp(`к ${comparison}`, 'g'))?.length).toBeGreaterThanOrEqual(2)
  })

  it('labels a custom window by its length', () => {
    const html = renderSummary({ ...completeDashboard, summaryPeriod: { days: 14, full: false, previous: null } })
    expect(html.match(/Оборот за 14 дней/g)).toHaveLength(2)
    expect(html.match(/к 14 дням/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('does not compare all-time totals to an invented previous period', () => {
    const html = renderSummary({ ...completeDashboard, summaryPeriod: { days: 400, full: true, previous: null } })
    expect(html.match(/Оборот за всё время/g)).toHaveLength(2)
    expect(html).not.toMatch(/к \d+ дням/)
    expect(html).not.toContain('Сравнение недоступно')
  })

  it('does not turn missing data into a zero amount or share', () => {
    const html = renderSummary({ ...completeDashboard, summary: selectVolumeSummary([]) })

    expect(html.match(/Нет данных/g)).toHaveLength(2)
    expect(html.match(/Доля общего оборота недоступна/g)).toHaveLength(2)
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
    expect(html).toContain('нет данных 3 окт.')
    expect(html).toContain('80')
    expect(html).toContain('20')
    expect(html).toContain('по 1 общему дню')
    expect(html).not.toContain('Неполный период')
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
