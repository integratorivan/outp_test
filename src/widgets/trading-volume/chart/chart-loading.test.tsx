import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { dashboardCategories, type DashboardCategory } from '../../../entities/volume/categories'
import { daySchema } from '../../../entities/volume/model'
import { selectCategoryBreakdown } from '../../../entities/volume/select/selectors'
import { selectVolumeSummary } from '../../../entities/volume/select/summary'
import { TradingVolume } from '../trading-volume'
import type { VolumeDashboard } from '../use-volume-dashboard'

const loadingDashboard: VolumeDashboard = {
  points: [],
  granularity: 'day',
  period: null,
  categoryPoints: [],
  categoryPeriod: null,
  summary: selectVolumeSummary([]),
  summaryGranularity: 'day',
  summaryPeriod: null,
  window: null,
  bounds: null,
  historyPoints: [],
  orderedCategories: [...dashboardCategories],
  categoryBreakdown: selectCategoryBreakdown([], {}),
  isLoading: true,
  isFetching: true,
  hasError: false,
  sourceErrors: [],
}

function renderWithErrors(
  sourceErrors: Array<Omit<VolumeDashboard['sourceErrors'][number], 'otherHasData' | 'otherFailed'> & Partial<Pick<VolumeDashboard['sourceErrors'][number], 'otherHasData' | 'otherFailed'>>>,
  points: VolumeDashboard['points'] = [],
  selectedCategories: readonly DashboardCategory[] = dashboardCategories,
  extras: Partial<Pick<VolumeDashboard['sourceErrors'][number], 'otherHasData' | 'otherFailed'>> = {},
) {
  const day = points[0]?.day
  const period = day ? { startDay: day, endDay: day } : null
  return renderToStaticMarkup(createElement(TradingVolume, {
    dashboard: {
      ...loadingDashboard,
      points,
      period,
      summary: selectVolumeSummary(points),
      sourceErrors: sourceErrors.map((error) => ({
        ...error,
        otherHasData: extras.otherHasData ?? points.some((point) => {
          const other = error.platform === 'kalshi' ? 'polymarket' : 'kalshi'
          return point[other] !== null
        }),
        otherFailed: extras.otherFailed ?? false,
      })),
      hasError: sourceErrors.length > 0,
      isLoading: false,
      isFetching: sourceErrors.some((error) => error.isRetrying),
    },
    visiblePlatforms: ['kalshi', 'polymarket'],
    onVisiblePlatformsChange: () => {},
    view: 'platforms',
    scale: 'linear',
    granularity: 'day',
    onViewChange: () => {},
    onGranularityChange: () => {},
    selectedCategories,
    onWindowChange: () => {},
    onSelectAllCategories: () => {},
    onToggleCategory: () => {},
  }))
}

describe('source errors in TradingVolume', () => {
  it.each(['kalshi', 'polymarket'] as const)('names the failed %s source and offers its own retry button', (platform) => {
    const label = platform === 'kalshi' ? 'Kalshi' : 'Polymarket'
    const html = renderWithErrors([{ platform, kind: 'load', isRetrying: false, retry: vi.fn() }])
    expect(html).toContain(`Не удалось загрузить данные ${label}`)
    expect(html).toContain(`aria-label="Повторить загрузку ${label}"`)
    expect(html.match(/role="alert"/g)).toHaveLength(1)
    expect(html).not.toContain('Обновите страницу')
  })

  it('shows both source errors even when no categories are selected', () => {
    const html = renderWithErrors([
      { platform: 'kalshi', kind: 'load', isRetrying: false, retry: vi.fn() },
      { platform: 'polymarket', kind: 'load', isRetrying: false, retry: vi.fn() },
    ], [], [])
    expect(html.match(/role="alert"/g)).toHaveLength(2)
    expect(html).toContain('Повторить загрузку Kalshi')
    expect(html).toContain('Повторить загрузку Polymarket')
    expect(html).toContain('Категории не выбраны')
    expect(html.indexOf('role="alert"')).toBeLessThan(html.indexOf('Категории не выбраны'))
  })

  it('keeps Kalshi chart data when Polymarket fails on first load', () => {
    const day = daySchema.parse('2026-10-01')
    const html = renderWithErrors(
      [{ platform: 'polymarket', kind: 'load', isRetrying: false, retry: vi.fn() }],
      [{ day, endDay: day, kalshi: 100, polymarket: null }],
    )
    expect(html).toContain('Не удалось загрузить данные Polymarket')
    expect(html).toContain('Данные этой платформы недоступны. Данные Kalshi остаются видимыми.')
    expect(html).not.toContain('если они загружены')
    expect(html).toContain('aria-label="Повторить загрузку Polymarket"')
    expect(html).toContain('aria-label="Polymarket: данные недоступны"')
    expect(html.match(/<button\b[^>]*aria-label="Polymarket: данные недоступны"[^>]*>/)?.[0]).toContain('disabled')
    expect(html).toContain('$100')
    expect(html).toContain('Выбрать дату на графике')
    expect(html).not.toContain('Не удалось загрузить данные Kalshi')
    expect(html).not.toContain('Не удалось загрузить историю')
    expect(html).not.toContain('Загрузка графика торгового оборота')
    expect(html).not.toContain('aria-busy="true"')
  })

  it('names both sources when both fail to load', () => {
    const html = renderWithErrors(
      [
        { platform: 'kalshi', kind: 'load', isRetrying: false, retry: vi.fn() },
        { platform: 'polymarket', kind: 'load', isRetrying: false, retry: vi.fn() },
      ],
      [],
      dashboardCategories,
      { otherHasData: false, otherFailed: true },
    )
    expect(html).toContain('Данные этой платформы недоступны. Polymarket тоже не загрузился.')
    expect(html).toContain('Данные этой платформы недоступны. Kalshi тоже не загрузился.')
    expect(html).toContain('aria-label="Kalshi: данные недоступны"')
    expect(html).toContain('aria-label="Polymarket: данные недоступны"')
  })

  it('keeps the chart and totals visible when a snapshot refresh fails', () => {
    const day = daySchema.parse('2026-10-01')
    const html = renderWithErrors([
      { platform: 'kalshi', kind: 'refresh', isRetrying: false, retry: vi.fn() },
    ], [{ day, endDay: day, kalshi: 100, polymarket: 200 }])
    expect(html).toContain('Не удалось обновить')
    expect(html).toContain('Показываем предыдущий снимок этой платформы')
    expect(html).toContain('Его данные могут быть устаревшими')
    expect(html).toContain('Выбрать дату на графике')
    expect(html).toContain('$100')
    expect(html).toContain('$200')
    expect(html).not.toContain('Не удалось загрузить историю')
    expect(html).not.toContain('Загрузка графика торгового оборота')
  })

  it('disables the retry button and indicates an ongoing refresh', () => {
    const html = renderWithErrors([
      { platform: 'polymarket', kind: 'refresh', isRetrying: true, retry: vi.fn() },
    ])
    const button = html.match(/<button\b[^>]*aria-label="Повторить загрузку Polymarket"[^>]*>[\s\S]*?<\/button>/)?.[0]
    expect(button).toContain('disabled')
    expect(button).toContain('aria-busy="true"')
    expect(button).toContain('Загрузка…')
  })
})

describe('chart loading in TradingVolume', () => {
  const chartControls = {
    granularity: 'day' as const,
    onGranularityChange: () => {},
    onViewChange: () => {},
    onWindowChange: () => {},
    onSelectAllCategories: () => {},
    onToggleCategory: () => {},
  }

  it.each(['platforms', 'categories'] as const)('can recover when both platforms are hidden in the %s view', (view) => {
    const html = renderToStaticMarkup(createElement(TradingVolume, {
      dashboard: loadingDashboard,
      visiblePlatforms: [],
      onVisiblePlatformsChange: () => {},
      view,
      scale: 'linear',
      selectedCategories: dashboardCategories,
      ...chartControls,
    }))
    expect(html).toContain('Обе платформы скрыты')
    expect(html).toContain('Показать обе платформы')
    expect(html.match(/aria-label="Платформы на графике"/g)).toHaveLength(1)
    expect(html).not.toContain('<svg aria-hidden="true" width="100%"')
  })

  it('keeps platform, period and chart-step controls without a settings button', () => {
    const html = renderToStaticMarkup(createElement(TradingVolume, {
      visiblePlatforms: ['kalshi', 'polymarket'],
      onVisiblePlatformsChange: () => {},
      dashboard: { ...loadingDashboard, granularity: 'week' },
      view: 'platforms',
      scale: 'symlog',
      selectedCategories: dashboardCategories,
      ...chartControls,
      granularity: 'week',
    }))
    const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? []
    expect(buttons.some((button) => button.includes('День'))).toBe(true)
    expect(buttons.some((button) => button.includes('Неделя'))).toBe(true)
    expect(buttons.find((button) => button.includes('Bars'))).toBeUndefined()
    expect(buttons.find((button) => button.includes('Lines'))).toBeUndefined()
    expect(html).not.toContain('Детализация графика')
    expect(html.match(/aria-label="Что показать на графике"/g)).toHaveLength(1)
    expect(html).toContain('data-slot="tabs"')
    expect(html.match(/aria-label="Платформы на графике"/g)).toHaveLength(1)
    expect(html.match(/aria-label="Шаг графика"/g)).toHaveLength(1)
    expect(html).not.toContain('role="switch"')
    expect(html).toContain('aria-label="Загрузка категорий"')
    expect(html).not.toContain('aria-label="Категории на графике"')
    expect(html).not.toContain('data-slot="toggle"')
    expect(html).not.toContain('Выбранные категории')
    expect(html).not.toContain('data-slot="dropdown-menu-trigger"')
    expect(html.match(/aria-label="Период наблюдения"/g)).toHaveLength(1)
    expect(html).not.toContain('aria-label="Настройки графика"')
    expect(html.slice(html.indexOf('</aside>'))).not.toContain('data-slot="popover-trigger"')
    const platforms = html.match(/<div\b[^>]*aria-label="Платформы на графике"[^>]*>/)?.[0]
    expect(platforms).toContain('data-variant="default"')
    expect(platforms).toContain('data-spacing="1"')
    expect(html).not.toContain('aria-pressed:bg-primary')
  })

  it('disables week mode when the period has fewer than three complete weeks', () => {
    const html = renderToStaticMarkup(createElement(TradingVolume, {
      dashboard: {
        ...loadingDashboard,
        isLoading: false,
        isFetching: false,
        window: { from: daySchema.parse('2026-09-16'), to: daySchema.parse('2026-09-30') },
        bounds: { firstDay: daySchema.parse('2026-01-01'), lastDay: daySchema.parse('2026-10-06') },
      },
      visiblePlatforms: ['kalshi', 'polymarket'],
      onVisiblePlatformsChange: () => {},
      view: 'platforms',
      scale: 'linear',
      selectedCategories: dashboardCategories,
      ...chartControls,
      granularity: 'week',
    }))
    const weekButton = html.match(/<button\b[^>]*>Неделя<\/button>/)?.[0]
    expect(weekButton).toContain('disabled')
    expect(weekButton).toContain('aria-pressed="false"')
    expect(html).toContain('title="Для недель выбери период от 3 недель"')
    expect(html).toContain('16–30 сент 2026 · 15 дн.')
    const dayButton = html.match(/<button\b[^>]*>День<\/button>/)?.[0]
    expect(dayButton).toContain('aria-pressed="true"')
  })

  it('renders the category breakdown in its own card after the chart', () => {
    const day = daySchema.parse('2026-10-01')
    const html = renderToStaticMarkup(createElement(TradingVolume, {
      visiblePlatforms: ['kalshi', 'polymarket'],
      onVisiblePlatformsChange: () => {},
      dashboard: { ...loadingDashboard, isLoading: false, isFetching: false, period: { startDay: day, endDay: day } },
      view: 'platforms',
      scale: 'linear',
      selectedCategories: dashboardCategories,
      ...chartControls,
    }))
    expect(html.match(/data-variant="stat"/g)).toHaveLength(2)
    expect(html.indexOf('aria-label="Категории на графике"')).toBeLessThan(html.indexOf('</aside>'))
    const cards = html.slice(html.indexOf('</aside>')).split('data-slot="card"')
    expect(cards).toHaveLength(3)
    expect(cards[1]).not.toContain('Настройки графика')
    expect(cards[1]).not.toContain('Структура по категориям')
    expect(cards[2]).toContain('Структура по категориям')
  })

  it('preserves the loading illustration without the settings button', () => {
    const html = renderToStaticMarkup(
      createElement(TradingVolume, {
        visiblePlatforms: ['kalshi', 'polymarket'],
        onVisiblePlatformsChange: () => {},
        dashboard: loadingDashboard,
        view: 'platforms',
        scale: 'linear',
        selectedCategories: dashboardCategories,
        ...chartControls,
      }),
    )

    expect(html).toContain('aria-busy="true"')
    expect(html).toMatch(/\binert\b/)
    expect(html).toContain('data-loading="true"')
    expect(html).not.toContain('role="switch"')
    expect(html.match(/aria-label="Платформы на графике"/g)).toHaveLength(1)
    expect(html).not.toContain('aria-label="Настройки графика"')
    expect(html).not.toContain('Загрузка данных…')
    expect(html).toContain('aria-label="Загрузка графика торгового оборота"')
    expect(html).toContain('Грузим данные с Polymarket')
    expect(html).toContain('aria-label="Загрузка категорий"')
    expect(html).toContain('aria-label="Загрузка структуры по категориям"')
    expect(html).toContain('Структура по категориям')
    expect(html).toContain('class="chart-loading-track"')
    expect(html).not.toContain('class="chart-loading-bar"')
  })

  it.each(['platforms', 'categories'] as const)('keeps one set of category buttons in the %s view, including empty selection', (view) => {
    const day = daySchema.parse('2026-10-01')
    const dashboard: VolumeDashboard = {
      ...loadingDashboard,
      isLoading: false,
      isFetching: false,
      period: { startDay: day, endDay: day },
      categoryPeriod: { startDay: day, endDay: day },
      points: [{ day, endDay: day, kalshi: null, polymarket: null }],
      categoryPoints: [{ day, endDay: day, total: 50, values: { sports: 50 } }],
    }
    for (const selectedCategories of [dashboardCategories, []]) {
      const html = renderToStaticMarkup(createElement(TradingVolume, {
        dashboard,
        visiblePlatforms: ['kalshi', 'polymarket'],
        onVisiblePlatformsChange: () => {},
        view,
        scale: 'linear',
        selectedCategories,
        ...chartControls,
      }))
      expect(html.match(/aria-label="Платформы на графике"/g)).toHaveLength(1)
      expect(html).not.toMatch(/max-sm:(h|size)-11/)
      expect(html.match(/aria-label="Категории на графике"/g)).toHaveLength(1)
      expect(html.match(/data-slot="toggle"/g)).toHaveLength(dashboardCategories.length)
      expect(html).not.toContain('Выбранные категории')
      expect(html).not.toContain('data-slot="dropdown-menu-trigger"')
      if (!selectedCategories.length) expect(html).toContain('Категории не выбраны')
      else if (view === 'categories') expect(html).toContain('Выбрать дату на графике категорий')
    }
  })
})
