import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { dashboardCategories } from '../../../entities/volume/categories'
import { daySchema, type DashboardVolumeRow } from '../../../entities/volume/model'
import { selectCategoryBreakdown } from '../../../entities/volume/select/selectors'
import { CategoryBreakdownSkeleton, CategoryBreakdownTable } from './category-breakdown-table'

const day = daySchema.parse('2026-01-01')
const rows: DashboardVolumeRow[] = [
  { day, platform: 'polymarket', category: 'sports', volumeUsd: 10 },
  { day, platform: 'polymarket', category: 'politics', volumeUsd: 40 },
  { day, platform: 'kalshi', category: 'sports', volumeUsd: 800 },
  { day, platform: 'kalshi', category: 'politics', volumeUsd: 200 },
  { day, platform: 'kalshi', category: 'other', volumeUsd: 2000 },
]

function renderTable(source = rows, selected: readonly DashboardVolumeRow['category'][] = dashboardCategories) {
  return renderToStaticMarkup(createElement(CategoryBreakdownTable, {
    breakdown: selectCategoryBreakdown(source, {}),
    selected,
    categoryPoints: [],
  }))
}

describe('CategoryBreakdownTable', () => {
  it('shows within-platform bars and a split Polymarket|Kalshi bar in Total', () => {
    const html = renderTable()
    expect(html).toContain('scaleX(0.2)')
    expect(html).toContain('scaleX(0.8)')
    expect(html).toContain('bg-platform-polymarket')
    expect(html).toContain('bg-platform-kalshi')
    expect(html).toContain('$10')
    expect(html).toContain('Доля внутри платформы: 20')
    expect(html).toContain('Polymarket 1')
  })

  it('renders a loading skeleton that mirrors the table layout', () => {
    const html = renderToStaticMarkup(createElement(CategoryBreakdownSkeleton))
    expect(html).toContain('aria-label="Загрузка структуры по категориям"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Структура по категориям')
    expect(html).toContain('Категория')
    expect(html).toContain('Polymarket')
    expect(html).toContain('Kalshi')
    expect(html.match(/data-slot="skeleton"/g)?.length).toBeGreaterThan(40)
    expect(html.match(/<svg\b/g)?.length).toBe(dashboardCategories.length)
    expect(html).toContain('M1 12 L6 9 L11 11')
    expect(html).toContain('sm:hidden')
    expect(html).toContain('hidden min-w-0 sm:block')
  })

  it('renders desktop sort headers, mobile sort chips, cards, and selected footer under active rows', () => {
    const html = renderTable(rows, ['sports'])
    expect(html.match(/aria-sort=/g)).toHaveLength(1)
    expect(html).toContain('aria-sort="descending"')
    expect(html.match(/aria-label="Сортировать:/g)).toHaveLength(6)
    expect(html).toContain('aria-label="Сортировать по"')
    expect(html).toContain('aria-label="Сортировать по: Категория"')
    expect(html).toContain('sm:hidden')
    expect(html).toContain('hidden min-w-0 sm:block')
    expect(html).not.toContain('Нажмите на строку')
    expect(html).not.toContain('cursor-pointer')
    expect(html).not.toContain('min-w-[44rem]')
    expect(html).not.toContain('<select')
    expect(html).toContain('hover:bg-transparent')
    expect(html).toContain('active:bg-transparent')
    expect(html).toContain('Итого (выбранные)')
    expect(html).toContain('tabular-nums')
    const footer = html.slice(html.indexOf('<tfoot'), html.indexOf('</tfoot>'))
    expect(footer).toContain('$10')
    expect(footer).toContain('$800')
    expect(footer).not.toContain('$3K')
    expect(html.indexOf('Спорт')).toBeLessThan(html.indexOf('Итого (выбранные)'))
    expect(html.indexOf('Итого (выбранные)')).toBeLessThan(html.indexOf('Политика'))
  })

  it('preserves missing platform data as a dash, not a fabricated zero amount', () => {
    const html = renderTable(rows.filter((row) => row.platform === 'kalshi'))
    expect(html).not.toContain('$0')
    expect(html).toContain('нулевой объём в прошлом периоде')
    expect(html).toContain('Для всей доступной истории предыдущего периода нет.')
  })
})
