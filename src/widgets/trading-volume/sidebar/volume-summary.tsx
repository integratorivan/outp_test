import { Info } from 'lucide-react'
import { useId } from 'react'

import {
  formatAvailableDays,
  formatChangeBasisFootnote,
  formatCommonDaysBasis,
  formatMissingDaysLabel,
  formatShare,
  formatShortPeriod,
  formatUsdFull,
  formatUsdSummary,
  formatVolumeChange,
} from '../../../entities/volume/lib/format'
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
import { Skeleton } from '../../../shared/ui/skeleton'
import { cn } from '../../../shared/ui/utils'
import type { VolumeDashboard } from '../use-volume-dashboard'

const labels = { polymarket: 'Polymarket', kalshi: 'Kalshi' }
const sourceDescriptions = {
  polymarket: 'Источник — Dune; оборот в USD учитывается по taker-side, без повторного учёта второй стороны сделки.',
  kalshi: 'Источник — Dune; оборот в USD суммируется по дневным данным Kalshi.',
}

function sentence(text: string) {
  return `${text.slice(0, 1).toUpperCase()}${text.slice(1)}.`
}

function summaryCaveats(
  summary: PlatformVolumeSummary,
  period: VolumeDashboard['summaryPeriod'],
): string[] {
  if (summary.total === null) return ['Нет данных за выбранный период.']
  const notes: string[] = []
  const missingLabel = formatMissingDaysLabel(summary.missingDays)
  if (summary.availablePoints < summary.expectedPoints) {
    const coverage = formatAvailableDays(summary.availablePoints, summary.expectedPoints)
    const detail = missingLabel ? `${coverage}; ${missingLabel.replace(/\.$/, '')}` : `${coverage}; пропуски не считаются нулём`
    notes.push(`${detail}.`)
  }
  if (summary.change !== null) {
    const basis = formatChangeBasisFootnote(summary.changeBasisDays, summary.availablePoints)
    if (basis) notes.push(sentence(basis))
  } else if (period && !period.full) {
    notes.push('Сравнение с предыдущим периодом недоступно: нужен хотя бы один день с данными за прошлое окно и ненулевой оборот в нём.')
  }
  if (summary.share !== null && summary.shareBasisDays < summary.expectedPoints) {
    notes.push(`Доля оборота считается ${formatCommonDaysBasis(summary.shareBasisDays)}.`)
  } else if (summary.share === null && summary.expectedPoints > 0) {
    notes.push('Доля общего оборота недоступна.')
  }
  return notes
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
      className={cn('grid min-w-0 grid-cols-2 gap-x-group gap-y-2', className)}
      aria-label="Суммарный оборот за выбранный период"
    >
      <VolumeSummaryCard
        platform="polymarket"
        summary={dashboard.summary.polymarket}
        loading={dashboard.isLoading}
        period={dashboard.summaryPeriod}
      />
      <VolumeSummaryCard
        platform="kalshi"
        summary={dashboard.summary.kalshi}
        loading={dashboard.isLoading}
        period={dashboard.summaryPeriod}
      />
      <VolumeShareBar
        polymarket={dashboard.summary.polymarket.share}
        kalshi={dashboard.summary.kalshi.share}
        loading={dashboard.isLoading}
      />
    </section>
  )
}

function VolumeShareBar({
  polymarket,
  kalshi,
  loading,
}: {
  polymarket: number | null
  kalshi: number | null
  loading: boolean
}) {
  if (loading) {
    return <Skeleton className="col-span-full h-4 w-full" aria-label="Загрузка доли оборота" />
  }
  if (polymarket === null || kalshi === null) return null
  const polymarketLabel = formatShare(polymarket)
  const kalshiLabel = formatShare(kalshi)
  return (
    <div
      className="col-span-full flex min-w-0 items-center gap-2"
      role="img"
      aria-label={`Доля оборота: Polymarket ${polymarketLabel}, Kalshi ${kalshiLabel}`}
    >
      <span className="shrink-0 font-mono text-[11px] leading-4 text-platform-polymarket-text tabular-nums">{polymarketLabel}</span>
      <span className="flex h-1 min-w-0 flex-1 overflow-hidden rounded-full" aria-hidden="true">
        <span className="h-full bg-platform-polymarket" style={{ width: `${polymarket * 100}%` }} />
        <span className="h-full bg-platform-kalshi" style={{ width: `${kalshi * 100}%` }} />
      </span>
      <span className="shrink-0 font-mono text-[11px] leading-4 text-platform-kalshi tabular-nums">{kalshiLabel}</span>
    </div>
  )
}

function VolumeSummaryCard({
  platform,
  summary,
  loading,
  period,
}: {
  platform: Platform
  summary: PlatformVolumeSummary
  loading: boolean
  period: VolumeDashboard['summaryPeriod']
}) {
  const titleId = useId()
  const caveatId = useId()
  const notes = loading ? [] : summaryCaveats(summary, period)
  const comparisonTitle = period?.previous
    ? `К предыдущему периоду: ${formatShortPeriod(period.previous.startDay, period.previous.endDay)}`
    : 'К предыдущему периоду'

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
                    aria-describedby={notes.length > 0 ? caveatId : undefined}
                    data-caveat={notes.length > 0 ? 'true' : undefined}
                    className={notes.length > 0 ? 'text-caution hover:text-caution aria-expanded:text-caution' : undefined}
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
                    {notes.length > 0 && ` ${notes.join(' ')}`}
                  </PopoverDescription>
                </PopoverHeader>
              </PopoverContent>
            </Popover>
          </CardAction>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-0.5">
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
          {period !== null && !period.full && (loading ? (
            <Skeleton className="h-4 w-28 max-w-full" aria-label="Загрузка сравнения" />
          ) : summary.change !== null && (
            <p title={comparisonTitle} className="truncate text-[11px] leading-4 text-muted-foreground">
              <span
                className={cn(
                  'font-mono tabular-nums',
                  summary.change > 0 && 'text-positive',
                  summary.change < 0 && 'text-destructive',
                )}
              >
                {formatVolumeChange(summary.change)}
              </span>
              {' '}к пред. периоду
            </p>
          ))}
          {notes.length > 0 && <p id={caveatId} className="sr-only">{notes.join(' ')}</p>}
        </CardContent>
      </Card>
    </article>
  )
}
