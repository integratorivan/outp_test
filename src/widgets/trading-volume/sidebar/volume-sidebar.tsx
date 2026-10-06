import { ChevronDown } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'

import type { DashboardCategory } from '../../../entities/volume/categories'
import type { CategoryChartPoint } from '../../../entities/volume/dashboard/dashboard'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '../../../shared/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../shared/ui/collapsible'
import { Skeleton } from '../../../shared/ui/skeleton'
import { cn } from '../../../shared/ui/utils'
import { CategoryFilters, CategoryFiltersSkeleton } from '../../category-filters/category-filters'
import type { VolumeDashboard } from '../use-volume-dashboard'
import { VolumeSummary } from './volume-summary'

const desktopQuery = '(min-width: 1024px)'

function subscribeDesktop(onChange: () => void) {
  const media = window.matchMedia(desktopQuery)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function isDesktop() {
  return window.matchMedia(desktopQuery).matches
}

function serverDesktop() {
  return true
}

type VolumeSidebarProps = {
  dashboard: VolumeDashboard
  selectedCategories: readonly DashboardCategory[]
  orderedCategories: readonly DashboardCategory[]
  values: CategoryChartPoint['values']
  periodLabel: string
  onToggleCategory: (category: DashboardCategory) => void
}

export function VolumeSidebar({ dashboard, selectedCategories, orderedCategories, values, periodLabel, onToggleCategory }: VolumeSidebarProps) {
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop, serverDesktop)
  const [expanded, setExpanded] = useState(false)
  const loading = dashboard.isLoading

  return (
    <aside
      aria-label="Платформы и категории"
      className="col-span-full min-w-0 max-lg:contents lg:sticky lg:top-group lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-1 lg:self-start xl:col-span-4 xl:col-start-9"
    >
      <div className="contents lg:flex lg:max-h-[calc(100svh-var(--spacing-group)*2)] lg:min-w-0 lg:flex-col lg:gap-group lg:overflow-y-auto">
        <VolumeSummary
          dashboard={dashboard}
          className="col-span-full max-lg:order-0"
        />
        <Collapsible
          open={desktop || expanded || loading}
          onOpenChange={setExpanded}
          className="col-span-full min-w-0 max-lg:order-2"
        >
          <Card className="min-w-0 gap-2 py-2 [--card-spacing:--spacing(2)]" aria-busy={loading}>
            {desktop ? (
              <CardHeader className="gap-0.5">
                <CardTitle><h2>Категории</h2></CardTitle>
                {loading ? (
                  <Skeleton className="h-3.5 w-40 max-w-full" aria-label="Загрузка периода категорий" />
                ) : (
                  <CardDescription className="text-[11px] leading-4">{periodLabel}</CardDescription>
                )}
              </CardHeader>
            ) : (
              <CardHeader className="gap-0 p-0">
                <CollapsibleTrigger
                  render={
                    <button
                      type="button"
                      disabled={loading}
                      className={cn(
                        'grid w-full grid-cols-[1fr_auto] items-center gap-x-2 px-(--card-spacing) py-0.5 text-left outline-none transition-colors',
                        'hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset',
                        loading && 'pointer-events-none',
                      )}
                    />
                  }
                >
                  <CardTitle><h2>Категории</h2></CardTitle>
                  <CardAction className="relative col-start-2 row-start-1 flex items-center gap-1.5 self-center justify-self-end">
                    {loading ? (
                      <Skeleton className="h-3 w-8" aria-hidden="true" />
                    ) : (
                      <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                        {selectedCategories.length}/{orderedCategories.length}
                      </span>
                    )}
                    <ChevronDown
                      className="size-3.5 text-muted-foreground transition-transform in-data-panel-open:rotate-180"
                      aria-hidden="true"
                    />
                  </CardAction>
                </CollapsibleTrigger>
              </CardHeader>
            )}
            <CollapsibleContent keepMounted>
              <CardContent>
                {loading ? (
                  <CategoryFiltersSkeleton />
                ) : (
                  <CategoryFilters
                    selected={selectedCategories}
                    orderedCategories={orderedCategories}
                    values={values}
                    onToggleCategory={onToggleCategory}
                  />
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>
    </aside>
  )
}
