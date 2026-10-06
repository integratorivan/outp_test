import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'

import type { DashboardCategory } from '../../../entities/volume/categories'
import type { CategoryChartPoint } from '../../../entities/volume/dashboard/dashboard'
import { formatDateTick, formatPeriod, formatShortPeriod, formatUsd, formatUsdCompact, formatUsdTick, formatShare, formatWeekChartCaption } from '../../../entities/volume/lib/format'
import { dashboardCategoryColor, dashboardCategoryLabels } from '../../../entities/volume/lib/labels'
import type { Day } from '../../../entities/volume/model'
import { buildCategoryChartGeometry, buildCategoryTooltipRows, categoryAreaPath, categoryOutlinePath, positionCategoryTooltip } from './category-chart-model'
import { nearestPointIndex } from '../chart/chart-model'
import { useChartWindow, type ChartWindowControl } from '../chart/use-chart-window'
import { usePlotWidth } from '../hooks/use-plot-width'
import { cn } from '../../../shared/ui/utils'

type CategoryAreaChartProps = {
  points: readonly CategoryChartPoint[]
  orderedCategories: readonly DashboardCategory[]
  categories: readonly DashboardCategory[]
  granularity: 'day' | 'week'
  onActivePointChange: (point: CategoryChartPoint | null) => void
  svgRef: RefObject<SVGSVGElement | null>
  analysisSelected?: boolean
  onAnalyzePoint?: (point: CategoryChartPoint, position: { left: number }) => void
  windowControl?: ChartWindowControl
  plotWidth?: number
}

export function CategoryAreaChart({ points, orderedCategories, categories, granularity, onActivePointChange, svgRef, onAnalyzePoint, analysisSelected = false, windowControl, plotWidth = 0 }: CategoryAreaChartProps) {
  const plotRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const width = usePlotWidth(plotRef, plotWidth)
  const [tooltipSize, setTooltipSize] = useState({ width: 0, height: 0 })
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null)
  const [selectedDay, setSelectedDay] = useState<Day | null>(null)
  const [active, setActive] = useState(false)
  const height = width < 480 ? 280 : width < 900 ? 336 : 420
  const geometry = useMemo(() => buildCategoryChartGeometry({ points, categories, width, height }), [points, categories, width, height])
  const gestures = useChartWindow(plotRef, { left: geometry.left, right: geometry.right, width }, windowControl, () => setActive(false))
  const selectedSet = useMemo(() => new Set(categories), [categories])
  const selectedIndex = selectedDay ? points.findIndex((point) => point.day <= selectedDay && selectedDay <= point.endDay) : -1
  const currentIndex = selectedIndex >= 0 ? selectedIndex : Math.max(0, points.length - 1)
  const selected = points[currentIndex]
  const selectedX = selected ? geometry.x(selected.day) : geometry.right
  const weekCaption = granularity === 'week' && points[0] && points.at(-1)
    ? formatWeekChartCaption(points[0].day, points.at(-1)!.endDay)
    : ''
  const tooltipPosition = positionCategoryTooltip({
    ...(cursorPosition ?? { x: selectedX, y: geometry.top + 80 }),
    width,
    height: height + 80,
    tooltipWidth: tooltipSize.width,
    tooltipHeight: tooltipSize.height,
    compact: width < 480,
  })
  const plotClipId = useId()
  const gradientId = useId()

  const compactTooltip = width < 640
  const tooltipRows = buildCategoryTooltipRows({
    point: selected,
    categories: orderedCategories.filter((category) => selectedSet.has(category)),
    limit: compactTooltip ? 3 : 5,
  })
  const showTooltip = active && tooltipRows.length > 0
  const valueText = selected && selected.total !== null
    ? `${formatPeriod(selected.day, selected.endDay)} ${selected.partial ? 'Известный оборот' : 'Итого'}: ${formatUsd(selected.total)}.${selected.partial ? ' Неполные данные.' : ''}`
    : 'Нет данных'

  useLayoutEffect(() => {
    onActivePointChange(active ? selected ?? null : null)
    return () => onActivePointChange(null)
  }, [active, selected, onActivePointChange])

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current
    if (!tooltip) return
    const measure = () => {
      const { width, height } = tooltip.getBoundingClientRect()
      setTooltipSize({ width, height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(tooltip)
    return () => observer.disconnect()
  }, [showTooltip])

  function selectAtPointer(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const cssX = event.clientX - rect.left
    const x = cssX * width / rect.width
    const y = event.clientY - rect.top
    const localX = Math.max(geometry.left, Math.min(geometry.right, x))
    const index = nearestPointIndex(geometry.pointXs, localX)
    const point = points[index]
    setCursorPosition({ x, y })
    if (point) setSelectedDay(point.day)
    setActive(true)
    return point
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!gestures.end(event)) return
    const point = selectAtPointer(event)
    if (point) onAnalyzePoint?.(point, { left: geometry.x(point.day) / width * 100 })
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.key === 'Enter' || event.key === ' ') && selected && onAnalyzePoint) {
      event.preventDefault()
      onAnalyzePoint(selected, { left: selectedX / width * 100 })
      return
    }
    let index: number
    switch (event.key) {
      case 'ArrowLeft': index = Math.max(0, currentIndex - 1); break
      case 'ArrowRight': index = Math.min(points.length - 1, currentIndex + 1); break
      case 'Home': index = 0; break
      case 'End': index = points.length - 1; break
      default: return
    }
    event.preventDefault()
    setCursorPosition(null)
    const point = points[index]
    if (point) setSelectedDay(point.day)
    setActive(true)
  }

  return (
    <figure className="flex min-w-0 flex-col gap-4">
      <div
        ref={plotRef}
        role="slider"
        tabIndex={points.length ? 0 : -1}
        aria-label={granularity === 'week' ? 'Выбрать неделю на графике категорий' : 'Выбрать дату на графике категорий'}
        aria-description={onAnalyzePoint ? 'Клик мышью или Enter показывает бота AI для выбранного периода.' : undefined}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, points.length - 1)}
        aria-valuenow={Math.max(0, currentIndex)}
        aria-valuetext={valueText}
        onPointerDown={(event) => { if (gestures.down(event)) selectAtPointer(event) }}
        onPointerMove={(event) => { if (gestures.move(event)) selectAtPointer(event) }}
        onPointerUp={onPointerUp}
        onPointerCancel={gestures.end}
        onDoubleClick={gestures.reset}
        onPointerLeave={(event) => { if (event.pointerType === 'mouse') setActive(false) }}
        onLostPointerCapture={gestures.end}
        onFocus={() => { setCursorPosition(null); setActive(true) }}
        onBlur={() => { if (!gestures.isPressed()) setActive(false) }}
        onKeyDown={onKeyDown}
        className={cn(
          'relative min-w-0 touch-pan-y pt-5 outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0',
          gestures.panning ? 'cursor-grabbing' : 'cursor-crosshair',
        )}
      >
        {weekCaption && (
          <p
            data-week-caption=""
            className={cn(
              'pointer-events-none absolute top-0 left-0 font-mono text-xs text-muted-foreground tabular-nums',
              active && 'invisible',
            )}
          >
            {weekCaption}
          </p>
        )}
        {selected && (
          <div data-chart-date="" aria-hidden="true" className={cn('pointer-events-none absolute top-0 w-60 max-w-[calc(100%-1rem)] text-center font-mono text-xs text-muted-foreground tabular-nums', (!active || analysisSelected) && 'invisible')} style={{ left: `clamp(8px, calc(${selectedX / width * 100}% - 120px), calc(100% - 248px))` }}>
            {formatShortPeriod(selected.day, selected.endDay)}
          </div>
        )}
        <svg ref={svgRef} aria-hidden="true" width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="block select-none">
          <defs>
            <clipPath id={plotClipId}>
              <rect x={geometry.left - 4} y={geometry.top - 4} width={geometry.right - geometry.left + 8} height={geometry.bottom - geometry.top + 8} />
            </clipPath>
            {geometry.areas.map((area) => (
              <linearGradient key={area.category} id={`${gradientId}-${area.category}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={area.color} className="category-gradient-top" />
                <stop offset="100%" stopColor={area.color} className="category-gradient-bottom" />
              </linearGradient>
            ))}
          </defs>
          <g>
            {geometry.yTicks.map((tick) => (
              <g key={tick.value}>
                <line x1={geometry.left} x2={geometry.right} y1={tick.y} y2={tick.y} stroke="var(--stroke)" strokeDasharray="3 5" strokeLinecap="round" />
                <text x={geometry.left - 12} y={tick.y} dy="0.35em" textAnchor="end" className="chart-axis">{formatUsdTick(tick.value)}</text>
              </g>
            ))}
          </g>
          <g>
            {geometry.xTicks.map((tick) => {
              const anchor = tick.x - geometry.left < 24 ? 'start' : geometry.right - tick.x < 24 ? 'end' : 'middle'
              return (
                <text key={`${tick.day}-${tick.format}`} x={tick.x} y={height - 12} textAnchor={anchor} className="chart-axis" data-date-format={tick.format}>{formatDateTick(tick.day, tick.format)}</text>
              )
            })}
          </g>
          <g clipPath={`url(#${plotClipId})`} data-export-series>
            {geometry.areas.map((area) => (
              <g key={area.category} data-category-series={area.category}>
                {area.segments.map((segment, index) => (
                  <g key={index}>
                    <path d={categoryAreaPath(segment)} fill={`url(#${gradientId}-${area.category})`} className={segment.dashed ? 'category-partial-fill' : undefined} />
                    <path
                      d={categoryOutlinePath(segment)}
                      stroke={area.color}
                      className="category-boundary"
                      strokeDasharray={segment.dashed ? '5 5' : undefined}
                    />
                  </g>
                ))}
              </g>
            ))}
          </g>
          {active && <line data-export-ignore x1={selectedX} x2={selectedX} y1={geometry.top} y2={geometry.bottom} stroke="var(--stroke-strong)" strokeDasharray="3 5" pointerEvents="none" />}
        </svg>
        {showTooltip && selected && (
          <div
            ref={tooltipRef}
            data-export-ignore
            className="pointer-events-none absolute z-10 w-max max-w-[calc(100%_-_1rem)] overflow-hidden rounded-control border bg-popover shadow-md"
            style={tooltipPosition}
          >
            {(!compactTooltip || selected.partial) && (
              <div className="flex flex-col gap-1 border-b px-3 py-1.5 text-right text-xs">
                <span className="whitespace-nowrap font-mono font-semibold tabular-nums">
                  {selected.partial ? 'Известный оборот' : 'Всего'} <span className="inline-block w-[8ch] text-right">{formatUsdCompact(selected.total ?? 0)}</span>
                </span>
                {selected.partial && <span className="text-muted-foreground">Неполные данные</span>}
              </div>
            )}
            <ul className={cn(
              'grid gap-x-2 px-3 py-2',
              compactTooltip ? 'grid-cols-[auto_minmax(0,1fr)_auto]' : 'grid-cols-[auto_minmax(max-content,1fr)_auto_auto]',
            )}>
              {tooltipRows.map((row) => (
                <li
                  key={row.category}
                  className={cn(
                    'grid min-h-6 grid-cols-subgrid items-center text-xs leading-4',
                    compactTooltip ? 'col-span-3' : 'col-span-4',
                    row.value === 0 ? 'text-muted-foreground' : 'text-foreground',
                  )}
                >
                  <span className={cn('size-2 rounded-full', dashboardCategoryColor[row.category].dot)} aria-hidden="true" />
                  <span className="min-w-0 whitespace-normal break-words">{dashboardCategoryLabels[row.category]}</span>
                  <span className="w-[8ch] whitespace-nowrap text-right font-mono font-semibold tabular-nums">{formatUsdCompact(row.value)}</span>
                  {!compactTooltip && (
                    <span className="w-[6ch] whitespace-nowrap text-right font-mono tabular-nums text-muted-foreground sm:w-14">{formatShare(row.share)}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </figure>
  )
}
