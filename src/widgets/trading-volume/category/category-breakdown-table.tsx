import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { animate, motion, useMotionValue, type Transition } from 'motion/react'
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

import type { DashboardCategory } from '../../../entities/volume/categories'
import { dashboardCategories } from '../../../entities/volume/categories'
import type { CategoryChartPoint } from '../../../entities/volume/dashboard/dashboard'
import {
  formatPercent,
  formatPeriod,
  formatShare,
  formatUsdCompact,
  formatUsdFull,
} from '../../../entities/volume/lib/format'
import { dashboardCategoryColor, dashboardCategoryLabels } from '../../../entities/volume/lib/labels'
import type { Platform } from '../../../entities/volume/model'
import type { CategoryBreakdown } from '../../../entities/volume/select/selectors'
import { Button } from '../../../shared/ui/button'
import { Skeleton } from '../../../shared/ui/skeleton'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/ui/table'
import { cn } from '../../../shared/ui/utils'
import {
  categoryDelta,
  categoryPlatformShares,
  categoryTrendPath,
  categoryTrendSeries,
  selectCategoryTableTotals,
  sortCategoryRows,
  type CategorySort,
  type CategorySortKey,
} from './category-breakdown-model'

const platforms: readonly Platform[] = ['polymarket', 'kalshi']
const sortOptions = [
  ['category', 'Категория'],
  ['polymarket', 'Polymarket'],
  ['kalshi', 'Kalshi'],
  ['total', 'Всего'],
  ['share', 'Доля'],
  ['delta', 'Δ'],
] as const satisfies ReadonlyArray<readonly [CategorySortKey, string]>
const sparkWidth = 48
const sparkHeight = 16
const sparkSkeletonPaths = [
  { d: 'M1 12 L6 9 L11 11 L17 5 L23 8 L29 3 L35 7 L41 4 L47 6', endY: 6 },
  { d: 'M1 8 L7 10 L12 6 L18 9 L24 4 L30 7 L36 5 L42 10 L47 8', endY: 8 },
  { d: 'M1 13 L6 11 L12 12 L18 7 L24 9 L29 4 L35 6 L41 2 L47 5', endY: 5 },
  { d: 'M1 6 L7 8 L13 5 L19 9 L25 6 L31 10 L37 7 L43 11 L47 9', endY: 9 },
  { d: 'M1 10 L6 7 L11 9 L16 4 L22 6 L28 3 L34 8 L40 5 L47 7', endY: 7 },
  { d: 'M1 4 L6 6 L12 3 L18 7 L23 5 L29 9 L35 6 L41 8 L47 4', endY: 4 },
  { d: 'M1 11 L7 8 L13 10 L19 6 L25 8 L31 3 L37 5 L42 2 L47 4', endY: 4 },
  { d: 'M1 7 L6 5 L12 8 L17 4 L23 7 L28 5 L34 9 L40 6 L47 8', endY: 8 },
  { d: 'M1 9 L7 11 L12 8 L18 10 L24 5 L30 8 L35 4 L41 7 L47 3', endY: 3 },
  { d: 'M1 5 L6 8 L11 6 L17 10 L22 7 L28 11 L33 8 L39 12 L47 9', endY: 9 },
  { d: 'M1 12 L7 10 L12 7 L18 9 L24 5 L29 7 L35 3 L41 6 L47 2', endY: 2 },
  { d: 'M1 8 L6 11 L11 7 L17 10 L22 6 L28 9 L34 5 L40 8 L47 4', endY: 4 },
] as const
const updateTransition = {
  type: 'tween',
  duration: 0.18,
  ease: [0.23, 1, 0.32, 1],
} satisfies Transition
const reducedMotionQuery = '(prefers-reduced-motion: reduce)'
const skeletonLabelWidths = [
  'w-16', 'w-20', 'w-14', 'w-16', 'w-12', 'w-20',
  'w-24', 'w-16', 'w-14', 'w-12', 'w-18', 'w-10',
] as const
const skeletonAmountWidths = [
  'w-12', 'w-10', 'w-14', 'w-11', 'w-9', 'w-12',
  'w-10', 'w-12', 'w-11', 'w-9', 'w-12', 'w-10',
] as const

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(reducedMotionQuery)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function getReducedMotion() {
  return window.matchMedia(reducedMotionQuery).matches
}

function getServerReducedMotion() {
  return true
}

function defaultSortDirection(key: CategorySortKey): CategorySort['direction'] {
  return key === 'category' ? 'ascending' : 'descending'
}

type CategoryBreakdownTableProps = {
  breakdown: CategoryBreakdown
  selected: readonly DashboardCategory[]
  categoryPoints: readonly CategoryChartPoint[]
  transitionKey?: string | number
}

type CategoryTotals = ReturnType<typeof selectCategoryTableTotals>

export function CategoryBreakdownSkeleton() {
  return (
    <div
      className="flex min-w-0 flex-col gap-4"
      role="status"
      aria-busy="true"
      aria-label="Загрузка структуры по категориям"
    >
      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-sm leading-6 font-medium tracking-tight">
          Структура по категориям
        </h2>
        <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto sm:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sortOptions.map(([key]) => (
            <Skeleton key={key} className="h-7 w-16 shrink-0 rounded-full" />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-0 sm:hidden">
        {dashboardCategories.map((category, index) => (
          <div key={category} className="flex flex-col gap-2 border-b border-border py-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Skeleton className="size-2 shrink-0 rounded-full" />
                <Skeleton className={cn('h-4', skeletonLabelWidths[index])} />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Skeleton className={cn('h-4', skeletonAmountWidths[index])} />
                <Skeleton className="h-3 w-10" />
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-3 w-10" />
              </div>
              <Skeleton className="h-2 w-full rounded-sm" />
            </div>
          </div>
        ))}
        <div className="flex flex-col gap-2 border-t border-border py-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <Skeleton className="h-4 w-28" />
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-3 w-10" />
            </div>
          </div>
          <Skeleton className="h-2 w-full rounded-sm" />
        </div>
      </div>

      <div className="hidden min-w-0 sm:block">
        <Table className="text-sm tabular-nums [&_td]:px-2 [&_td]:py-2.5 [&_th]:px-2 [&_tr>:first-child]:pl-0 [&_tr>:last-child]:pr-0">
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[16%]" />
            <col className="w-[16%]" />
            <col className="w-[20%]" />
            <col className="w-[10%]" />
            <col className="w-[18%]" />
          </colgroup>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {sortOptions.map(([key, label]) => (
                <TableHead
                  key={key}
                  scope="col"
                  className={cn(
                    'h-auto py-1',
                    key === 'category' ? 'text-left' : 'text-right',
                  )}
                >
                  <span className={cn(
                    'inline-flex h-7 items-center px-1 text-[13px] text-muted-foreground',
                    key === 'category' ? 'justify-start' : 'w-full justify-end',
                  )}
                  >
                    {label}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {dashboardCategories.map((category, index) => (
              <TableRow key={category} className="hover:bg-transparent">
                <TableHead scope="row">
                  <div className="flex min-w-0 items-center gap-2">
                    <Skeleton className="size-2 shrink-0 rounded-full" />
                    <Skeleton className={cn('h-4', skeletonLabelWidths[index])} />
                  </div>
                </TableHead>
                {platforms.map((platform) => (
                  <TableCell key={platform} className="text-right">
                    <div className="ml-auto flex w-full max-w-24 min-w-0 flex-col items-end gap-1">
                      <Skeleton className={cn('h-3.5', skeletonAmountWidths[index])} />
                      <Skeleton className="h-1.5 w-full rounded-sm" />
                    </div>
                  </TableCell>
                ))}
                <TableCell className="text-right">
                  <div className="ml-auto flex w-full max-w-28 min-w-0 flex-col items-end gap-1.5">
                    <Skeleton className={cn('h-3.5', skeletonAmountWidths[(index + 3) % skeletonAmountWidths.length])} />
                    <Skeleton className="h-2 w-full rounded-sm" />
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Skeleton className="ml-auto h-4 w-10" />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex min-w-0 items-center justify-end gap-2">
                    <CategoryTrendSkeleton index={index} />
                    <Skeleton className="h-3.5 w-10" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter className="border-t bg-transparent">
            <TableRow className="hover:bg-transparent">
              <TableHead scope="row" className="bg-transparent">
                <Skeleton className="h-4 w-28" />
              </TableHead>
              {platforms.map((platform) => (
                <TableCell key={platform} className="text-right">
                  <Skeleton className="ml-auto h-4 w-12" />
                </TableCell>
              ))}
              <TableCell className="text-right">
                <div className="flex min-w-0 flex-col items-end gap-1.5">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-2 w-full max-w-28 rounded-sm" />
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="ml-auto h-4 w-10" />
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="ml-auto h-4 w-10" />
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  )
}

export function CategoryBreakdownTable(props: CategoryBreakdownTableProps) {
  const { breakdown, selected, categoryPoints, transitionKey } = props
  const [sort, setSort] = useState<CategorySort>({ key: 'total', direction: 'descending' })
  const rows = sortCategoryRows(breakdown, sort, selected)
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const activeRows = rows.filter((row) => selectedSet.has(row.category))
  const inactiveRows = rows.filter((row) => !selectedSet.has(row.category))
  const totals = selectCategoryTableTotals(breakdown, selected)
  const comparisonDescription = breakdown.comparisonPeriod
    ? `Δ к предыдущему периоду: ${formatPeriod(breakdown.comparisonPeriod.startDay, breakdown.comparisonPeriod.endDay)}`
    : 'Для всей доступной истории предыдущего периода нет.'
  const SortIcon = sort.direction === 'ascending' ? ArrowUp : ArrowDown

  function changeSort(key: CategorySortKey) {
    setSort((previous) => ({
      key,
      direction: previous.key === key
        ? previous.direction === 'ascending' ? 'descending' : 'ascending'
        : defaultSortDirection(key),
    }))
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-sm leading-6 font-medium tracking-tight">
          Структура по категориям
        </h2>
        <div
          role="group"
          aria-label="Сортировать по"
          className="flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto sm:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {sortOptions.map(([key, label]) => {
            const active = sort.key === key
            return (
              <Button
                key={key}
                variant="ghost"
                size="sm"
                aria-pressed={active}
                aria-label={`Сортировать по: ${key === 'delta' ? 'изменение к прошлому периоду' : label}`}
                onClick={() => changeSort(key)}
                className={cn(
                  'h-7 shrink-0 rounded-full px-2.5 active:bg-transparent',
                  active
                    ? 'bg-muted text-foreground hover:bg-muted'
                    : 'text-muted-foreground',
                )}
              >
                {label}
                {active && <SortIcon data-icon="inline-end" aria-hidden="true" />}
              </Button>
            )
          })}
        </div>
      </div>

      <p className="sr-only">
        Торговый оборот и доля каждой категории за выбранный период.
        В колонке «Всего» полоса делит оборот между Polymarket и Kalshi.
        {' '}{comparisonDescription}
        Пустая ячейка Δ — неполные данные или нулевой объём в прошлом периоде.
      </p>

      <div className="flex flex-col gap-0 sm:hidden">
        {activeRows.map((row) => (
          <CategoryMobileCard
            key={row.category}
            row={row}
            delta={categoryDelta(row, breakdown)}
            active
          />
        ))}
        <CategoryMobileTotals totals={totals} hasInactiveBelow={inactiveRows.length > 0} />
        {inactiveRows.map((row) => (
          <CategoryMobileCard
            key={row.category}
            row={row}
            delta={categoryDelta(row, breakdown)}
            active={false}
          />
        ))}
      </div>

      <div className="hidden min-w-0 sm:block">
        <Table className="text-sm tabular-nums [&_td]:px-2 [&_td]:py-2.5 [&_th]:px-2 [&_tr>:first-child]:pl-0 [&_tr>:last-child]:pr-0">
          <TableCaption className="sr-only">
            Торговый оборот и доля каждой категории за выбранный период.
            В колонке «Всего» полоса делит оборот между Polymarket и Kalshi.
            {' '}{comparisonDescription}
            Пустая ячейка Δ — неполные данные или нулевой объём в прошлом периоде.
          </TableCaption>
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[16%]" />
            <col className="w-[16%]" />
            <col className="w-[20%]" />
            <col className="w-[10%]" />
            <col className="w-[18%]" />
          </colgroup>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {sortOptions.map(([key, label]) => {
                const active = sort.key === key
                const Icon = active ? sort.direction === 'ascending' ? ArrowUp : ArrowDown : ArrowUpDown
                return (
                  <TableHead
                    key={key}
                    scope="col"
                    aria-sort={active ? sort.direction : undefined}
                    className={cn(
                      'h-auto py-1 font-mono tabular-nums',
                      key === 'category' ? 'text-left font-sans' : 'text-right',
                    )}
                    title={key === 'delta' ? comparisonDescription : undefined}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        'h-7 w-full gap-1 px-1 py-0 text-[13px] hover:bg-transparent hover:text-foreground active:bg-transparent active:text-foreground',
                        key === 'category' ? 'justify-start' : 'justify-end font-mono tabular-nums',
                      )}
                      aria-label={`Сортировать: ${key === 'delta' ? 'изменение к прошлому периоду' : label}`}
                      onClick={() => changeSort(key)}
                    >
                      <span>{label}</span>
                      <Icon data-icon="inline-end" aria-hidden="true" />
                    </Button>
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody className="font-mono tabular-nums">
            {rows.map((row) => (
              <CategoryDesktopRow
                key={row.category}
                row={row}
                platformTotals={breakdown.totals}
                delta={categoryDelta(row, breakdown)}
                active={selected.includes(row.category)}
                trend={categoryTrendSeries(categoryPoints, row.category)}
                transitionKey={transitionKey}
              />
            ))}
          </TableBody>
          <TableFooter className="border-t bg-transparent font-mono tabular-nums">
            <TableRow className="hover:bg-transparent">
              <TableHead scope="row" className="bg-transparent font-sans">Итого (выбранные)</TableHead>
              {platforms.map((platform) => (
                <TableCell key={platform} className="text-right" title={totals[platform] === null ? undefined : formatUsdFull(totals[platform])}>
                  {totals[platform] === null ? '—' : formatUsdCompact(totals[platform])}
                </TableCell>
              ))}
              <TableCell className="text-right" title={totals.total === null ? undefined : formatUsdFull(totals.total)}>
                <div className="flex min-w-0 flex-col items-end gap-1.5">
                  <span>{totals.total === null ? '—' : formatUsdCompact(totals.total)}</span>
                  <PlatformSplitBar row={totals} />
                </div>
              </TableCell>
              <TableCell className="text-right">
                {totals.share === null ? '—' : formatShare(totals.share)}
              </TableCell>
              <TableCell className="text-right"><CategoryDeltaValue value={totals.delta} /></TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  )
}

function CategoryMobileCard({
  row,
  delta,
  active,
}: {
  row: CategoryBreakdown['rows'][number]
  delta: number | null
  active: boolean
}) {
  return (
    <article
      data-active={active}
      className={cn(
        'flex flex-col gap-2 border-b border-border py-3',
        active ? 'opacity-100' : 'opacity-50',
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 font-sans">
          <span
            className={cn('size-2 shrink-0 rounded-full', dashboardCategoryColor[row.category].dot)}
            aria-hidden="true"
          />
          <span className="min-w-0 font-medium">{dashboardCategoryLabels[row.category]}</span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 font-mono tabular-nums">
          <span className="text-sm" title={row.total === null ? undefined : formatUsdFull(row.total)}>
            {row.total === null ? '—' : formatUsdCompact(row.total)}
          </span>
          <CategoryDeltaValue value={delta} />
        </div>
      </div>
      <PlatformSplitLabeled row={row} />
    </article>
  )
}

function CategoryMobileTotals({
  totals,
  hasInactiveBelow,
}: {
  totals: CategoryTotals
  hasInactiveBelow: boolean
}) {
  return (
    <article
      className={cn(
        'flex flex-col gap-2 border-t border-border py-3',
        hasInactiveBelow && 'border-b',
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <span className="font-sans text-sm font-medium">Итого (выбранные)</span>
        <div className="flex shrink-0 flex-col items-end gap-0.5 font-mono tabular-nums">
          <span className="text-sm" title={totals.total === null ? undefined : formatUsdFull(totals.total)}>
            {totals.total === null ? '—' : formatUsdCompact(totals.total)}
          </span>
          <CategoryDeltaValue value={totals.delta} />
        </div>
      </div>
      <PlatformSplitLabeled row={totals} />
    </article>
  )
}

function CategoryDesktopRow({
  row,
  platformTotals,
  delta,
  active,
  trend,
  transitionKey,
}: {
  row: CategoryBreakdown['rows'][number]
  platformTotals: CategoryBreakdown['totals']
  delta: number | null
  active: boolean
  trend: readonly number[]
  transitionKey: CategoryBreakdownTableProps['transitionKey']
}) {
  const reduceMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    getServerReducedMotion,
  )
  const opacity = useMotionValue(1)
  const updateKey = JSON.stringify([
    transitionKey,
    active,
    row.polymarket,
    row.kalshi,
    row.total,
    row.share,
    platformTotals,
    delta,
    trend,
  ])
  const previousUpdate = useRef(updateKey)
  const transition: Transition = reduceMotion
    ? { duration: 0 }
    : updateTransition
  const layout = reduceMotion ? false : 'position'
  const platformShares = categoryPlatformShares(row)

  useLayoutEffect(() => {
    if (reduceMotion) {
      previousUpdate.current = updateKey
      opacity.set(1)
      return
    }
    if (previousUpdate.current === updateKey) return
    previousUpdate.current = updateKey

    const controls = animate(opacity, [opacity.get(), 0.82, 1], {
      ...updateTransition,
      times: [0, 0.25, 1],
    })
    return () => controls.stop()
  }, [updateKey, reduceMotion, opacity])

  return (
    <TableRow
      data-active={active}
      className={cn('hover:bg-transparent', active ? 'opacity-100' : 'opacity-50')}
    >
      <TableHead scope="row" className="font-sans">
        <motion.div
          className="flex min-w-0 w-full items-center gap-2"
          layout={layout}
          initial={false}
          transition={transition}
        >
          <span
            className={cn('size-2 shrink-0 rounded-full', dashboardCategoryColor[row.category].dot)}
            aria-hidden="true"
          />
          <span className="min-w-0 font-medium whitespace-nowrap">
            {dashboardCategoryLabels[row.category]}
          </span>
        </motion.div>
      </TableHead>
      {platforms.map((platform) => {
        const amount = row[platform]
        const platformTotal = platformTotals[platform]
        const share = amount !== null && platformTotal !== null && platformTotal > 0
          ? amount / platformTotal
          : null
        return (
          <TableCell key={platform} className="text-right">
            <motion.div
              className="flex min-w-0 w-full flex-col items-end gap-1"
              layout={layout}
              initial={false}
              transition={transition}
              title={
                amount === null || share === null
                  ? undefined
                  : `${formatUsdFull(amount)} · ${formatShare(share)} внутри платформы`
              }
            >
              <motion.span className="tabular-nums" style={{ opacity }}>
                {amount === null ? '—' : formatUsdCompact(amount)}
                {amount !== null && share !== null && (
                  <span className="sr-only">
                    {' '}Доля внутри платформы: {formatShare(share)}
                  </span>
                )}
              </motion.span>
              <span
                className="block h-1.5 w-full max-w-24 overflow-hidden rounded-sm bg-muted"
                aria-hidden="true"
              >
                <CategoryVolumeBar
                  platform={platform}
                  ratio={share ?? 0}
                  reduceMotion={reduceMotion}
                />
              </span>
            </motion.div>
          </TableCell>
        )
      })}
      <TableCell
        className="text-right"
        title={
          row.total === null
            ? undefined
            : [
                formatUsdFull(row.total),
                platformShares.polymarket !== null ? `Polymarket ${formatShare(platformShares.polymarket)}` : null,
                platformShares.kalshi !== null ? `Kalshi ${formatShare(platformShares.kalshi)}` : null,
              ].filter(Boolean).join(' · ')
        }
      >
        <motion.div
          className="flex min-w-0 flex-col items-end gap-1.5"
          layout={layout}
          initial={false}
          transition={transition}
        >
          <motion.span className="tabular-nums" style={{ opacity }}>
            {row.total === null ? '—' : formatUsdCompact(row.total)}
          </motion.span>
          <PlatformSplitBar row={row} />
        </motion.div>
      </TableCell>
      <TableCell className="text-right">
        <motion.span
          className="inline-block tabular-nums"
          layout={layout}
          initial={false}
          style={{ opacity }}
          transition={transition}
        >
          {row.share === null ? '—' : formatShare(row.share)}
        </motion.span>
      </TableCell>
      <TableCell className="text-right">
        <motion.div
          className="flex min-w-0 items-center justify-end gap-2"
          layout={layout}
          initial={false}
          transition={transition}
          style={{ opacity }}
        >
          <CategoryTrendSparkline values={trend} />
          <CategoryDeltaValue value={delta} />
        </motion.div>
      </TableCell>
    </TableRow>
  )
}

function PlatformSplitLabeled({
  row,
}: {
  row: Pick<CategoryBreakdown['rows'][number], 'kalshi' | 'polymarket'>
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3 font-mono text-[11px] tabular-nums text-muted-foreground">
        <span title={row.polymarket === null ? undefined : formatUsdFull(row.polymarket)}>
          {row.polymarket === null ? '—' : formatUsdCompact(row.polymarket)}
        </span>
        <span title={row.kalshi === null ? undefined : formatUsdFull(row.kalshi)}>
          {row.kalshi === null ? '—' : formatUsdCompact(row.kalshi)}
        </span>
      </div>
      <PlatformSplitBar row={row} className="max-w-none" />
    </div>
  )
}

function PlatformSplitBar({
  row,
  className,
}: {
  row: Pick<CategoryBreakdown['rows'][number], 'kalshi' | 'polymarket'>
  className?: string
}) {
  const shares = categoryPlatformShares(row)
  if (shares.polymarket === null && shares.kalshi === null) {
    return <span className={cn('block h-2 w-full max-w-28 rounded-sm bg-muted', className)} aria-hidden="true" />
  }
  return (
    <span
      className={cn('flex h-2 w-full max-w-28 overflow-hidden rounded-sm bg-muted', className)}
      aria-hidden="true"
    >
      {shares.polymarket !== null && (
        <span
          className="h-full bg-platform-polymarket"
          style={{ width: `${shares.polymarket * 100}%` }}
        />
      )}
      {shares.kalshi !== null && (
        <span
          className="h-full bg-platform-kalshi"
          style={{ width: `${shares.kalshi * 100}%` }}
        />
      )}
    </span>
  )
}

function CategoryTrendSkeleton({ index }: { index: number }) {
  const spark = sparkSkeletonPaths[index % sparkSkeletonPaths.length] ?? sparkSkeletonPaths[0]
  return (
    <svg
      width={sparkWidth}
      height={sparkHeight}
      viewBox={`0 0 ${sparkWidth} ${sparkHeight}`}
      className="shrink-0 animate-pulse text-muted-foreground/45"
      aria-hidden="true"
    >
      <path
        d={`${spark.d} V${sparkHeight} H1 Z`}
        fill="currentColor"
        className="opacity-20"
      />
      <path
        d={spark.d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="47" cy={spark.endY} r="1.25" fill="currentColor" className="opacity-70" />
    </svg>
  )
}

function CategoryTrendSparkline({ values }: { values: readonly number[] }) {
  const path = useMemo(() => categoryTrendPath(values, sparkWidth, sparkHeight), [values])
  if (!path) return <span className="inline-block w-12" aria-hidden="true" />
  return (
    <svg
      width={sparkWidth}
      height={sparkHeight}
      viewBox={`0 0 ${sparkWidth} ${sparkHeight}`}
      className="shrink-0 text-muted-foreground"
      aria-hidden="true"
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CategoryDeltaValue({ value }: { value: number | null }) {
  if (value === null) return null
  return (
    <span
      title="Изменение суммарного оборота к предыдущему периоду"
      className={cn(
        'tabular-nums',
        value > 0 && 'text-positive',
        value < 0 && 'text-destructive',
      )}
    >
      {value > 0 ? '+' : ''}{formatPercent(value)}
    </span>
  )
}

function CategoryVolumeBar({
  platform,
  ratio,
  reduceMotion,
}: {
  platform: Platform
  ratio: number
  reduceMotion: boolean
}) {
  const transform = useMotionValue(`scaleX(${Math.max(0, Math.min(1, ratio))})`)

  useLayoutEffect(() => {
    const target = `scaleX(${Math.max(0, Math.min(1, ratio))})`
    if (reduceMotion) {
      transform.set(target)
      return
    }
    const controls = animate(transform, target, updateTransition)
    return () => controls.stop()
  }, [ratio, reduceMotion, transform])

  return (
    <motion.span
      className={cn(
        'block h-full w-full origin-left rounded-[inherit]',
        platform === 'polymarket'
          ? 'bg-platform-polymarket'
          : 'bg-platform-kalshi',
      )}
      style={{ transform }}
    />
  )
}
