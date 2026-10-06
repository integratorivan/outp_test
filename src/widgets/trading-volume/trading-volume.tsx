import {
  CalendarOff,
  ChartNoAxesColumn,
  EyeOff,
  Layers2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import type { DashboardCategory } from '../../entities/volume/categories'
import type {
  CategoryChartPoint,
  ChartScale,
  ChartView,
  VolumeGranularity,
  VolumeRange,
  VolumeWindow,
} from '../../entities/volume/dashboard/dashboard'
import { countCompleteWeeks, displayedGranularity, matchWindowPreset, minCompleteWeeks, presetWindow } from '../../entities/volume/dashboard/dashboard'
import { formatShortPeriod, formatSidebarPeriod } from '../../entities/volume/lib/format'
import { dashboardCategoryLabels, volumeGranularities, volumeRanges } from '../../entities/volume/lib/labels'
import type { Platform } from '../../entities/volume/model'
import { buildCategoryAnalysisContext, buildPlatformAnalysisContext, type AnalysisContext } from '../../features/chart-analysis/model'
import type { WindowChangeMode } from '../../features/volume-filters/use-volume-filters'
import { Button } from '../../shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../shared/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '../../shared/ui/empty'
import { Tabs, TabsList, TabsTrigger } from '../../shared/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '../../shared/ui/toggle-group'
import { cn } from '../../shared/ui/utils'
import { orderCategoryList } from '../category-filters/category-filters'
import { CategoryAreaChart } from './category/category-area-chart'
import { CategoryBreakdownSkeleton, CategoryBreakdownTable } from './category/category-breakdown-table'
import { ChartExportDialog } from './export/chart-export-dialog'
import {
  buildCategoryCsv,
  buildChartExportMetadata,
  buildVolumeCsv,
  chartExportFilename,
} from './export/chart-export'
import { ChartLoading } from './chart/chart-loading'
import type { VolumeDashboard } from './use-volume-dashboard'
import { VolumeChart } from './chart/volume-chart'
import { VolumeSidebar } from './sidebar/volume-sidebar'
import { VolumeSourceErrors } from './sidebar/volume-source-errors'
import { WindowBrush } from './brush/window-brush'
import type { ChartWindowControl } from './chart/use-chart-window'

const ChartAnalysisPanel = lazy(() => import('../../features/chart-analysis/chart-analysis-panel'))
const platforms: readonly Platform[] = ['kalshi', 'polymarket']
const labels = { kalshi: 'Kalshi', polymarket: 'Polymarket' }
const lastPresetKey = 'outpoll:volume-preset'

function readLastPreset(): VolumeRange {
  const stored = typeof window === 'undefined' ? null : window.localStorage.getItem(lastPresetKey)
  return stored === '7d' || stored === '30d' || stored === '90d' || stored === 'all' ? stored : '30d'
}

type TradingVolumeProps = {
  dashboard: VolumeDashboard
  visiblePlatforms: readonly Platform[]
  onVisiblePlatformsChange: (platforms: readonly Platform[]) => void
  view: ChartView
  scale: ChartScale
  granularity: VolumeGranularity
  onViewChange: (view: ChartView) => void
  onGranularityChange: (granularity: VolumeGranularity) => void
  selectedCategories: readonly DashboardCategory[]
  onWindowChange: (window: VolumeWindow, mode: WindowChangeMode) => void
  onSelectAllCategories: () => void
  onToggleCategory: (category: DashboardCategory) => void
}

export function TradingVolume({
  dashboard,
  visiblePlatforms,
  onVisiblePlatformsChange,
  view,
  scale,
  granularity,
  onViewChange,
  onGranularityChange,
  selectedCategories,
  onWindowChange,
  onSelectAllCategories,
  onToggleCategory,
}: TradingVolumeProps) {
  const [interacting, setInteracting] = useState(false)
  const [lastPreset, setLastPreset] = useState<VolumeRange>(readLastPreset)
  const volumeWindow = dashboard.window
  const bounds = dashboard.bounds
  const preset = volumeWindow && bounds ? matchWindowPreset(volumeWindow, bounds) : null
  const completeWeeks = volumeWindow && bounds ? countCompleteWeeks(volumeWindow, bounds) : null
  const weekEnabled = completeWeeks === null || completeWeeks >= minCompleteWeeks
  const chartGranularity = displayedGranularity(granularity, completeWeeks)
  const weekHint = 'Для недель выбери период от 3 недель'

  useEffect(() => {
    if (granularity === 'week' && !weekEnabled) onGranularityChange('day')
  }, [granularity, weekEnabled, onGranularityChange])

  function applyPreset(value: VolumeRange) {
    if (!bounds) return
    window.localStorage.setItem(lastPresetKey, value)
    setLastPreset(value)
    setInteracting(false)
    onWindowChange(presetWindow(value, bounds), 'push')
  }

  function previewWindow(next: VolumeWindow) {
    setInteracting(true)
    onWindowChange(next, 'preview')
  }

  function commitWindow(next: VolumeWindow, mode: 'push' | 'replace') {
    setInteracting(false)
    onWindowChange(next, mode)
  }
  function debounceWindow(next: VolumeWindow) {
    setInteracting(false)
    onWindowChange(next, 'debounced-replace')
  }

  const windowControl: ChartWindowControl | undefined = volumeWindow && bounds ? {
    window: volumeWindow,
    bounds,
    onZoom: debounceWindow,
    onPanPreview: previewWindow,
    onPanCommit: (next) => commitWindow(next, 'replace'),
    onReset: () => applyPreset(lastPreset),
  } : undefined

  const [activeCategoryPoint, setActiveCategoryPoint] = useState<CategoryChartPoint | null>(null)
  const [analysisSelection, setAnalysisSelection] = useState<{
    context: AnalysisContext
    position: { left: number }
  } | null>(null)
  const platformSvgRef = useRef<SVGSVGElement>(null)
  const categorySvgRef = useRef<SVGSVGElement>(null)
  const svgRef = view === 'categories' ? categorySvgRef : platformSvgRef
  const chartRef = useRef<HTMLDivElement>(null)
  const [plotWidth, setPlotWidth] = useState(0)
  useLayoutEffect(() => {
    const node = chartRef.current
    if (!node) return
    const apply = (next: number) => {
      if (next > 0) setPlotWidth((current) => (current === next ? current : next))
    }
    apply(node.clientWidth)
    const observer = new ResizeObserver(([entry]) => {
      if (entry) apply(entry.contentRect.width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    setAnalysisSelection(null)
  }, [view, volumeWindow, selectedCategories, visiblePlatforms, dashboard.points, dashboard.categoryPoints])
  const unavailablePlatforms = useMemo(
    () => new Set(
      dashboard.sourceErrors
        .filter((error) => error.kind === 'load')
        .map((error) => error.platform),
    ),
    [dashboard.sourceErrors],
  )
  const chartPlatforms = useMemo(
    () => visiblePlatforms.filter((platform) => !unavailablePlatforms.has(platform)),
    [visiblePlatforms, unavailablePlatforms],
  )
  const allPlatformsUnavailable = platforms.every((platform) => unavailablePlatforms.has(platform))
  const hasVisibleData = useMemo(
    () =>
      dashboard.points.some((point) =>
        chartPlatforms.some((platform) => point[platform] !== null),
      ),
    [dashboard.points, chartPlatforms],
  )
  const hasVisibleCategoryData = useMemo(
    () => dashboard.categoryPoints.some((point) => point.total !== null),
    [dashboard.categoryPoints],
  )
  const categoryTotals = useMemo(
    (): Partial<Record<DashboardCategory, number | null>> => Object.fromEntries(dashboard.categoryBreakdown.rows.map((row) => {
      const values = chartPlatforms.flatMap((platform) => row[platform] === null ? [] : [row[platform]])
      return [row.category, values.length ? values.reduce((sum, value) => sum + value, 0) : null]
    })),
    [dashboard.categoryBreakdown, chartPlatforms],
  )
  const categoryList = useMemo(
    () => orderCategoryList(dashboard.orderedCategories, categoryTotals, selectedCategories),
    [dashboard.orderedCategories, categoryTotals, selectedCategories],
  )
  const period = view === 'categories' ? dashboard.categoryPeriod : dashboard.period
  const hasChartData = view === 'categories' ? hasVisibleCategoryData : hasVisibleData
  // Smallest categories sit at the bottom of the stack, the largest on top, in a fixed
  // all-time-volume order so range changes never reshuffle the bands.
  const stackCategories = useMemo(
    () => dashboard.orderedCategories.filter((category) => selectedCategories.includes(category)).reverse(),
    [dashboard.orderedCategories, selectedCategories],
  )
  const exportData = useMemo(() => {
    const categories = [...stackCategories].reverse()
    const metadata = buildChartExportMetadata({ view, period, categories, visiblePlatforms: chartPlatforms })
    if (view === 'categories') {
      return {
        csvText: buildCategoryCsv({ points: dashboard.categoryPoints, categories: selectedCategories }),
        points: dashboard.categoryPoints,
        metadata,
        legend: categories.map((category) => ({
          label: dashboardCategoryLabels[category],
          colorVar: `--category-${category}`,
        })),
      }
    }
    return {
      csvText: buildVolumeCsv({ points: dashboard.points, visiblePlatforms: chartPlatforms }),
      points: dashboard.points,
      metadata,
      legend: chartPlatforms.map((platform) => ({
        label: labels[platform],
        colorVar: `--platform-${platform}`,
      })),
    }
  }, [view, period, stackCategories, dashboard.categoryPoints, dashboard.points, selectedCategories, chartPlatforms])
  const reduceMotion = useReducedMotion()
  const categoryTableTransitionKey = JSON.stringify([
    selectedCategories,
    [...chartPlatforms].sort(),
  ])
  const contentKey = !selectedCategories.length
    ? 'categories'
    : !chartPlatforms.length && !allPlatformsUnavailable
      ? 'hidden'
      : dashboard.isLoading
        ? 'loading'
        : hasChartData
          ? `chart-${view}`
          : 'empty'
  const showingChart = contentKey.startsWith('chart-')
  const viewTransition = {
    duration: reduceMotion ? 0 : 0.22,
    ease: [0.22, 1, 0.36, 1] as const,
  }

  const rangeControls = (
    <div
      role="group"
      aria-label="Период наблюдения"
      className="flex min-w-0 flex-wrap items-center gap-1"
    >
      {volumeRanges.map((item) => (
        <Button
          key={item.value}
          variant="ghost"
          size="default"
          aria-pressed={preset === item.value}
          disabled={!bounds}
          onClick={() => applyPreset(item.value)}
          className={cn(
            'min-h-9 flex-1 rounded-full px-2.5 sm:min-h-8 sm:flex-none sm:px-3',
            preset === item.value
              ? 'bg-muted text-foreground hover:bg-muted'
              : 'text-muted-foreground',
          )}
        >
          {item.value === 'all' ? (
            <>
              <span className="sm:hidden">Всё</span>
              <span className="hidden sm:inline">{item.label}</span>
            </>
          ) : (
            item.label
          )}
        </Button>
      ))}
      {preset === null && volumeWindow && (
        <span className="inline-flex min-h-9 shrink-0 items-center rounded-full bg-muted px-2.5 text-sm leading-6 font-medium whitespace-nowrap text-foreground sm:min-h-8 sm:px-3">
          Свой
          <span className="hidden sm:inline">&nbsp;период</span>
        </span>
      )}
    </div>
  )

  const granularityControls = (
    <div
      role="group"
      aria-label="Шаг графика"
      className="flex min-w-0 flex-1 items-center gap-1"
    >
      {volumeGranularities.map((item) => {
        const disabled = item.value === 'week' && !weekEnabled
        return (
          <span
            key={item.value}
            className="inline-flex min-w-0 flex-1 sm:flex-none"
            title={disabled ? weekHint : undefined}
          >
            <Button
              variant="ghost"
              size="default"
              aria-pressed={chartGranularity === item.value}
              disabled={disabled}
              onClick={() => onGranularityChange(item.value)}
              className={cn(
                'min-h-9 w-full rounded-full px-2.5 sm:min-h-8 sm:w-auto sm:px-3',
                chartGranularity === item.value
                  ? 'bg-muted text-foreground hover:bg-muted'
                  : 'text-muted-foreground',
              )}
            >
              {item.label}
            </Button>
          </span>
        )
      })}
    </div>
  )

  return (
    <section
      aria-label="Сравнение торгового оборота"
      aria-busy={dashboard.isLoading}
      inert={dashboard.isLoading || undefined}
      data-loading={dashboard.isLoading || undefined}
      className="grid min-w-0 grid-cols-4 items-start gap-group sm:grid-cols-6 lg:grid-cols-12"
    >
      <VolumeSidebar
        dashboard={dashboard}
        selectedCategories={selectedCategories}
        orderedCategories={categoryList}
        values={view === 'categories' && activeCategoryPoint ? activeCategoryPoint.values : categoryTotals}
        periodLabel={view === 'categories' && activeCategoryPoint
          ? formatSidebarPeriod(activeCategoryPoint.day, activeCategoryPoint.endDay)
          : volumeWindow ? formatSidebarPeriod(volumeWindow.from, volumeWindow.to) : 'За выбранный период'}
        onToggleCategory={onToggleCategory}
      />
      <Card className="col-span-full min-w-0 max-lg:order-1 overflow-visible lg:col-span-7 lg:col-start-1 lg:row-start-1 xl:col-span-8">
        <CardHeader className="min-w-0 max-sm:px-2">
          <CardTitle className="sr-only">
            <h2>Торговый оборот</h2>
          </CardTitle>
          <div className="flex min-w-0 flex-nowrap items-center justify-between gap-3">
            <Tabs
              value={view}
              onValueChange={(value) => {
                if (value === 'platforms' || value === 'categories') onViewChange(value)
              }}
              className="min-w-0 shrink"
            >
              <TabsList aria-label="Что показать на графике">
                <TabsTrigger value="platforms">Платформы</TabsTrigger>
                <TabsTrigger value="categories">Категории</TabsTrigger>
              </TabsList>
            </Tabs>
            <ToggleGroup
              multiple
              variant="default"
              size="default"
              spacing={1}
              value={[...chartPlatforms]}
              onValueChange={(values) =>
                onVisiblePlatformsChange(
                  platforms.filter((platform) =>
                    values.includes(platform) && !unavailablePlatforms.has(platform),
                  ),
                )
              }
              aria-label="Платформы на графике"
              className="ml-auto shrink-0"
            >
              {platforms.map((platform) => {
                const unavailable = unavailablePlatforms.has(platform)
                const visible = chartPlatforms.includes(platform)
                return (
                  <ToggleGroupItem
                    key={platform}
                    value={platform}
                    disabled={unavailable}
                    aria-label={unavailable
                      ? `${labels[platform]}: данные недоступны`
                      : `${labels[platform]}: ${visible ? 'скрыть' : 'показать'} на графике`}
                    className="max-sm:size-7 max-sm:px-0"
                  >
                    <span
                      className={cn(
                        'size-2.5 shrink-0 rounded-full sm:size-2',
                        platform === 'kalshi' ? 'bg-platform-kalshi' : 'bg-platform-polymarket',
                        (!visible || unavailable) && 'opacity-40',
                      )}
                      aria-hidden="true"
                    />
                    <span className="max-sm:sr-only">{labels[platform]}</span>
                  </ToggleGroupItem>
                )
              })}
            </ToggleGroup>
          </div>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-4 max-sm:px-2 sm:px-(--card-spacing)">
          <VolumeSourceErrors errors={dashboard.sourceErrors} />
          <div ref={chartRef} className="relative grid min-w-0">
            <AnimatePresence initial={false}>
              <motion.div
                key={contentKey}
                className="isolate flex min-w-0 flex-col gap-4 [grid-area:1/1]"
                initial={contentKey === 'loading' ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                // Keep the loading frame opaque while the chart fades in so the slot never goes empty.
                exit={contentKey === 'loading'
                  ? { opacity: 1, y: 0 }
                  : { opacity: 0, y: -4, transition: { ...viewTransition, duration: reduceMotion ? 0 : 0.16 } }}
                transition={viewTransition}
              >
                {!selectedCategories.length ? (
                  <ChartState
                    tone="brand"
                    icon={Layers2}
                    title="Категории не выбраны"
                    description="Включите хотя бы одну категорию — или сразу все."
                  >
                    <Button
                      onClick={onSelectAllCategories}
                    >
                      Выбрать все
                    </Button>
                  </ChartState>
                ) : !chartPlatforms.length ? (
                  <ChartState
                    tone="muted"
                    icon={EyeOff}
                    title="Обе платформы скрыты"
                    description="Включите Kalshi или Polymarket над графиком, чтобы снова увидеть оборот."
                  >
                    <Button
                      onClick={() => onVisiblePlatformsChange(
                        platforms.filter((platform) => !unavailablePlatforms.has(platform)),
                      )}
                    >
                      Показать обе платформы
                    </Button>
                  </ChartState>
                ) : dashboard.isLoading ? (
                  <ChartLoading />
                ) : !hasChartData ? (
                  dashboard.hasError && !period ? (
                    <ChartState
                      tone="warning"
                      icon={TriangleAlert}
                      title="Не удалось загрузить историю"
                      description="Повторите загрузку нужной платформы с помощью кнопок над графиком."
                    />
                  ) : period ? (
                    <ChartState
                      tone="muted"
                      icon={CalendarOff}
                      title="Нет данных за этот период"
                      description="Для включённых платформ в выбранном диапазоне нет полных точек. Сдвиньте период или включите вторую линию."
                    />
                  ) : (
                    <ChartState
                      tone="muted"
                      icon={ChartNoAxesColumn}
                      title="История пока пуста"
                      description="Источник не вернул торговый оборот. Пропуски на графике не заполняются нулём."
                    />
                  )
                ) : view === 'categories' ? (
                  <CategoryAreaChart
                    points={dashboard.categoryPoints}
                    orderedCategories={dashboard.orderedCategories}
                    categories={stackCategories}
                    granularity={chartGranularity}
                    onActivePointChange={setActiveCategoryPoint}
                    windowControl={windowControl}
                    analysisSelected={Boolean(analysisSelection)}
                    plotWidth={plotWidth}
                    onAnalyzePoint={(point, position) => setAnalysisSelection((current) => current ? null : {
                      position,
                      context: buildCategoryAnalysisContext({
                        point,
                        previous: dashboard.categoryPoints[dashboard.categoryPoints.indexOf(point) - 1],
                        categories: selectedCategories,
                        platforms: chartPlatforms,
                        granularity: chartGranularity,
                      }),
                    })}
                    svgRef={categorySvgRef}
                  />
                ) : (
                  <VolumeChart
                    points={dashboard.points}
                    visiblePlatforms={chartPlatforms}
                    granularity={chartGranularity}
                    scale={scale}
                    analysisSelected={Boolean(analysisSelection)}
                    instantTransition={interacting}
                    windowControl={windowControl}
                    plotWidth={plotWidth}
                    onAnalyzePoint={(point, position) => setAnalysisSelection((current) => current ? null : {
                      position,
                      context: buildPlatformAnalysisContext({
                        point,
                        previous: dashboard.points[dashboard.points.indexOf(point) - 1],
                        categories: selectedCategories,
                        platforms: chartPlatforms,
                        granularity: chartGranularity,
                      }),
                    })}
                    svgRef={platformSvgRef}
                  />
                )}
              </motion.div>
            </AnimatePresence>
            {showingChart && analysisSelection && (
              <p
                data-chart-analysis-action=""
                className="pointer-events-none absolute top-0 w-60 max-w-[calc(100%-1rem)] whitespace-nowrap text-center font-mono text-xs text-muted-foreground tabular-nums"
                style={{
                  left: `clamp(8px, calc(${analysisSelection.position.left}% - 120px), calc(100% - 248px))`,
                }}
              >
                {formatShortPeriod(analysisSelection.context.startDay, analysisSelection.context.endDay)}
              </p>
            )}
          </div>
          {showingChart && volumeWindow && bounds && dashboard.historyPoints.length > 1 && (
            <WindowBrush
              points={dashboard.historyPoints}
              visiblePlatforms={chartPlatforms}
              window={volumeWindow}
              bounds={bounds}
              onPreview={previewWindow}
              onCommit={(next) => commitWindow(next, 'push')}
              onDebounced={debounceWindow}
            />
          )}
          {showingChart && analysisSelection && (
            <Suspense fallback={null}>
              <ChartAnalysisPanel
                key={JSON.stringify(analysisSelection.context)}
                context={analysisSelection.context}
                onClose={() => setAnalysisSelection(null)}
              />
            </Suspense>
          )}
          <div className="flex min-w-0 flex-col gap-2">
            {rangeControls}
            <div className="flex min-w-0 items-center gap-2">
              {granularityControls}
              <div className="shrink-0 self-center">
                <ChartExportDialog
                  csvText={exportData.csvText}
                  filename={chartExportFilename(exportData.points)}
                  legend={exportData.legend}
                  metadata={exportData.metadata}
                  svgRef={svgRef}
                  disabled={!showingChart}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      {(dashboard.isLoading || dashboard.period) && (
        <Card className="col-span-full min-w-0 max-lg:order-3 lg:col-span-7 lg:col-start-1 lg:row-start-2 xl:col-span-8">
          <CardContent className="max-sm:px-2">
            {dashboard.isLoading ? (
              <CategoryBreakdownSkeleton />
            ) : (
              <CategoryBreakdownTable
                breakdown={dashboard.categoryBreakdown}
                selected={selectedCategories}
                categoryPoints={dashboard.categoryPoints}
                transitionKey={categoryTableTransitionKey}
              />
            )}
          </CardContent>
        </Card>
      )}
    </section>
  )
}

type ChartStateTone = 'brand' | 'muted' | 'warning'

function ChartState({
  icon: Icon,
  tone,
  title,
  description,
  children,
}: {
  icon: LucideIcon
  tone: ChartStateTone
  title: string
  description?: string
  children?: ReactNode
}) {
  return (
    <Empty
      className="min-h-[340px] min-[480px]:min-h-[372px] min-[900px]:min-h-[420px]"
      role="status"
    >
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon
            className={cn(
              tone === 'warning'
                ? 'text-destructive'
                : tone === 'brand'
                  ? 'text-primary'
                  : 'text-muted-foreground',
            )}
            aria-hidden="true"
            strokeWidth={1.75}
          />
        </EmptyMedia>
        <EmptyTitle>
          <h3>{title}</h3>
        </EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {children && (
        <EmptyContent className="flex-row flex-wrap justify-center">
          {children}
        </EmptyContent>
      )}
    </Empty>
  )
}
