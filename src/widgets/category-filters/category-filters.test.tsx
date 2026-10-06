import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { dashboardCategories } from '../../entities/volume/categories'
import { CategoryFilters, CategoryFiltersSkeleton, orderCategoryList } from './category-filters'

function renderCategories(selected: readonly (typeof dashboardCategories)[number][]) {
  return renderToStaticMarkup(createElement(CategoryFilters, {
    selected,
    orderedCategories: dashboardCategories,
    values: { other: 6_880_000_000, culture: null, weather: 0 },
    onToggleCategory: () => {},
  }))
}

describe('category buttons', () => {
  it('shows every category as a toggle without a dropdown or duplicate summary', () => {
    const html = renderCategories(['other', 'culture', 'weather'])
    expect(html.match(/<button\b/g)).toHaveLength(dashboardCategories.length)
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(3)
    expect(html).toContain('aria-label="Категории на графике"')
    expect(html).not.toContain('data-slot="dropdown-menu-trigger"')
    expect(html).not.toContain('Выбранные категории')
  })

  it('renders a chip grid skeleton while categories load', () => {
    const html = renderToStaticMarkup(createElement(CategoryFiltersSkeleton))
    expect(html).toContain('aria-label="Загрузка категорий"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('grid-cols-2')
    expect(html.match(/data-slot="skeleton"/g)).toHaveLength(dashboardCategories.length * 4)
  })

  it('marks selected categories with a visible check and hides the check for unselected categories', () => {
    const html = renderCategories(['other'])
    const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? []
    const selected = buttons.find((button) => button.includes('Другое'))
    const unselected = buttons.find((button) => button.includes('Спорт'))
    expect(selected).toContain('aria-pressed="true"')
    expect(selected).toContain('lucide-check')
    expect(selected).not.toContain('invisible')
    expect(unselected).toContain('aria-pressed="false"')
    expect(unselected).toContain('invisible')
    expect(html).toContain('aria-pressed:bg-control-selected')
    expect(html).not.toContain('control-selected-border')
    expect(html).not.toContain('aria-pressed:bg-primary')
    expect(html).not.toContain('text-primary')
    expect(html).not.toContain('max-sm:h-11')
  })

  it('shows amounts only for selected categories with known values, including zero', () => {
    const html = renderCategories(['other', 'culture', 'weather'])
    const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? []
    expect(buttons.find((button) => button.includes('Другое'))).toContain('$6.88B')
    expect(buttons.find((button) => button.includes('Погода'))).toContain('$0')
    expect(buttons.find((button) => button.includes('Культура'))).not.toContain('$')
    expect(renderCategories(['culture'])).not.toContain('$6.88B')
  })

  it('reserves the same amount width for known, missing and unselected values', () => {
    for (const selected of [dashboardCategories, []]) {
      const html = renderCategories(selected)
      expect(html.match(/<span class="w-\[8ch\] shrink-0 text-right /g)).toHaveLength(dashboardCategories.length)
    }
  })

  it('ranks selected amounts descending and leaves missing amounts in place', () => {
    expect(orderCategoryList(
      ['politics', 'combo', 'finance', 'sports'],
      { politics: 94_900_000, combo: 938_000_000, finance: 317_000_000, sports: 94_900_000 },
      ['politics', 'combo', 'finance', 'sports'],
    )).toEqual(['combo', 'finance', 'politics', 'sports'])
    expect(orderCategoryList(
      ['politics', 'combo', 'finance'],
      { politics: 94_900_000, combo: 938_000_000, finance: 317_000_000 },
      ['politics'],
    )).toEqual(['politics', 'combo', 'finance'])
  })

  it('keeps all buttons available when no categories are selected', () => {
    const html = renderCategories([])
    expect(html.match(/<button\b/g)).toHaveLength(dashboardCategories.length)
    expect(html).not.toContain('aria-pressed="true"')
    expect(html).not.toContain('$')
  })
})
