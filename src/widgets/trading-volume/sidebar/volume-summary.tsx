import { Info } from 'lucide-react'
import { useId } from 'react'

import { formatDaysCount, formatDaysDative, formatShare, formatUsdFull, formatUsdSummary, formatVolumeChange } from '../../../entities/volume/lib/format'
import type { Platform } from '../../../entities/volume/model'
import type { PlatformVolumeSummary } from '../../../entities/volume/select/summary'
import { Button } from '../../../shared/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../shared/ui/card'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '../../../shared/ui/popover'
import { Progress } from '../../../shared/ui/progress'
import { Skeleton } from '../../../shared/ui/skeleton'
import { cn } from '../../../shared/ui/utils'
import type { VolumeDashboard } from '../use-volume-dashboard'

const labels = { polymarket: 'Polymarket', kalshi: 'Kalshi' }
const sourceDescriptions = {
  polymarket: 'Источник — Dune; оборот в USD учитывается по taker-side, без повторного учёта второй стороны сделки.',
  kalshi: 'Источник — Dune; оборот в USD суммируется по дневным данным Kalshi.',
}

export function VolumeSummary({
  dashboard,
  className,
}: {
  dashboard: VolumeDashboard
  className?: string
}) {
  return (
    <section
      className={cn('grid min-w-0 grid-cols-2 gap-group', className)}
      aria-label="Суммарный оборот за выбранный период"
    >
      <VolumeSummaryCard
        platform="polymarket"
        summary={dashboard.summary.polymarket}
        loading={dashboard.isLoading}
        granularity={dashboard.summaryGranularity}
        period={dashboard.summaryPeriod}
      />
      <VolumeSummaryCard
        platform="kalshi"
        summary={dashboard.summary.kalshi}
        loading={dashboard.isLoading}
        granularity={dashboard.summaryGranularity}
        period={dashboard.summaryPeriod}
      />
    </section>
  )
}

function VolumeSummaryCard({
  platform,
  summary,
  loading,
  granularity,
  period,
}: {
  platform: Platform
  summary: PlatformVolumeSummary
  loading: boolean
  granularity: 'day' | 'week'
  period: { days: number; full: boolean } | null
}) {
  const titleId = useId()
  const partial =
    summary.availablePoints < summary.expectedPoints && summary.total !== null
  const shareLabel = summary.share === null
    ? 'Доля общего оборота недоступна'
    : `${formatShare(summary.share)} всего оборота`
  const periodLabel = period === null ? 'выбранный период' : period.full ? 'всё время' : formatDaysCount(period.days)

  return (
    <article
      className="volume-summary-card flex h-full min-h-0 min-w-0"
      data-platform={platform}
      aria-labelledby={titleId}
      aria-busy={loading}
    >
      <Card
        variant="stat"
        className="h-full min-h-0 min-w-0 flex-1 gap-2 [--card-spacing:--spacing(2)]"
      >
        <CardHeader className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn('size-1.5 shrink-0 rounded-full', platform === 'polymarket' ? 'bg-platform-polymarket' : 'bg-platform-kalshi')}
            aria-hidden="true"
          />
          <CardTitle className="min-w-0 flex-1">
            <h2 id={titleId}>{labels[platform]}</h2>
          </CardTitle>
          <CardAction className="shrink-0 self-center">
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Как рассчитан оборот ${labels[platform]}`}
                  />
                }
              >
                <Info aria-hidden="true" strokeWidth={1.75} />
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={8}
                className="max-h-(--available-height) w-[min(20rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain p-4"
              >
                <PopoverHeader>
                  <PopoverTitle>Оборот {labels[platform]}</PopoverTitle>
                  <PopoverDescription>
                    {sourceDescriptions[platform]}
                    {partial &&
                      ` Доступно ${summary.availablePoints} из ${summary.expectedPoints} ${granularity === 'week' ? 'недельных' : 'дневных'} точек; пропуски не считаются нулём.`}
                  </PopoverDescription>
                </PopoverHeader>
              </PopoverContent>
            </Popover>
          </CardAction>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-1 flex-col justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[11px] leading-4 text-muted-foreground">
              Оборот за {periodLabel}
            </span>
            {loading ? (
              <Skeleton className="h-6 w-24 max-w-full" aria-label="Загрузка оборота" />
            ) : (
              <p
                title={summary.total === null ? undefined : formatUsdFull(summary.total)}
                className={cn(
                  'font-mono text-lg leading-tight font-medium tracking-tighter text-foreground tabular-nums',
                  summary.total === null && 'text-subtle',
                )}
              >
                {summary.total === null ? '—' : formatUsdSummary(summary.total)}
              </p>
            )}
            {!loading && (partial || summary.total === null) && (
              <span className="text-[11px] leading-4 text-muted-foreground">
                {partial ? 'Неполный период' : 'Нет данных'}
              </span>
            )}
            {period !== null && !period.full && (loading ? (
              <Skeleton className="h-4 w-36 max-w-full" aria-label="Загрузка сравнения" />
            ) : (
              <p
                title={
                  summary.change === null
                    ? 'Нужно полное покрытие обоих периодов и ненулевой оборот в предыдущем периоде.'
                    : `${formatVolumeChange(summary.change)} к ${formatDaysDative(period.days)}`
                }
                className={cn(
                  'truncate text-[11px] leading-4 text-muted-foreground',
                  summary.change !== null && summary.change > 0 && 'text-positive',
                  summary.change !== null && summary.change < 0 && 'text-destructive',
                )}
              >
                {summary.change === null ? 'Сравнение недоступно' : (
                  <>
                    <span className="font-mono tabular-nums">{formatVolumeChange(summary.change)}</span>
                    {' к '}{formatDaysDative(period.days)}
                  </>
                )}
              </p>
            ))}
          </div>
          {loading ? (
            <Skeleton className="h-4 w-full" aria-label="Загрузка доли оборота" />
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-[11px] leading-4 text-muted-foreground">
                {summary.share === null ? shareLabel : (
                  <><span className="font-mono tabular-nums">{formatShare(summary.share)}</span> всего оборота</>
                )}
              </p>
              {summary.share !== null && (
                <Progress
                  role="meter"
                  value={summary.share * 100}
                  aria-label={`Доля общего оборота ${labels[platform]}`}
                  aria-valuetext={shareLabel}
                  className="h-1"
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </article>
  )
}
