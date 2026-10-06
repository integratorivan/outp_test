import { Check } from 'lucide-react'

import type { DashboardCategory } from '../../entities/volume/categories'
import { dashboardCategories } from '../../entities/volume/categories'
import type { CategoryChartPoint } from '../../entities/volume/dashboard/dashboard'
import { formatUsdCompact } from '../../entities/volume/lib/format'
import { dashboardCategoryColor, dashboardCategoryLabels } from '../../entities/volume/lib/labels'
import { Skeleton } from '../../shared/ui/skeleton'
import { Toggle } from '../../shared/ui/toggle'
import { cn } from '../../shared/ui/utils'

type CategoryFiltersProps = {
  selected: readonly DashboardCategory[]
  orderedCategories: readonly DashboardCategory[]
  values: CategoryChartPoint['values']
  onToggleCategory: (category: DashboardCategory) => void
}

const chipLabelWidths = [
  'w-14', 'w-20', 'w-16', 'w-12', 'w-16', 'w-20',
  'w-14', 'w-20', 'w-12', 'w-14', 'w-10',
] as const

export function CategoryFilters({
  selected,
  orderedCategories,
  values,
  onToggleCategory,
}: CategoryFiltersProps) {
  const selectedSet = new Set(selected)

  return (
    <div
      role="group"
      aria-label="Категории на графике"
      className="grid min-w-0 grid-cols-2 gap-1.5"
    >
      {orderedCategories.map((category) => {
        const enabled = selectedSet.has(category)
        const value = enabled ? values[category] ?? null : null
        return (
          <Toggle
            key={category}
            variant="chip"
            size="sm"
            pressed={enabled}
            onPressedChange={() => onToggleCategory(category)}
            className="h-7 min-w-0 justify-start rounded-md px-2 text-xs leading-4"
          >
            <span
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                enabled ? dashboardCategoryColor[category].dot : 'bg-muted-foreground/40',
              )}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-left">{dashboardCategoryLabels[category]}</span>
            <span className="w-[8ch] shrink-0 text-right font-mono text-[11px] font-semibold leading-none text-subtle tabular-nums">
              {value !== null ? formatUsdCompact(value) : '—'}
            </span>
            <Check
              data-icon="inline-end"
              aria-hidden="true"
              className={cn('size-3! shrink-0', !enabled && 'invisible')}
            />
          </Toggle>
        )
      })}
    </div>
  )
}

export function CategoryFiltersSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Загрузка категорий"
      className="grid min-w-0 grid-cols-2 gap-1.5"
    >
      {dashboardCategories.map((category, index) => (
        <div
          key={category}
          className="flex h-7 min-w-0 items-center gap-2 rounded-md bg-muted/55 px-2"
        >
          <Skeleton className="size-1.5 shrink-0 rounded-full bg-muted-foreground/25" />
          <Skeleton className={cn('h-2.5 shrink-0 rounded-sm bg-muted-foreground/20', chipLabelWidths[index] ?? 'w-14')} />
          <span className="min-w-0 flex-1" aria-hidden="true" />
          <Skeleton className="h-2.5 w-9 shrink-0 rounded-sm bg-muted-foreground/20" />
          <Skeleton className="size-3 shrink-0 rounded-sm bg-muted-foreground/15" />
        </div>
      ))}
    </div>
  )
}
