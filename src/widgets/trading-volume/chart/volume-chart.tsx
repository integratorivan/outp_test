import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, type Transition } from 'motion/react'
import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'

import { windowDays, type ChartScale, type VolumePoint } from '../../../entities/volume/dashboard/dashboard'
import { formatCompactPeriod, formatDateTick, formatDaysCount, formatPeriod, formatShortPeriod, formatUsd, formatUsdCompact, formatUsdTick, formatWeeklyDailyAverage } from '../../../entities/volume/lib/format'
import type { Day, Platform } from '../../../entities/volume/model'
import { buildChartGeometry, chartRevealX, nearestPointIndex } from './chart-model'
import { useChartWindow, type ChartWindowControl } from './use-chart-window'
import { usePlotWidth } from '../hooks/use-plot-width'
import { createChartFrame, sampleSeriesY, type ChartFrame } from './chart-transition'
import { useChartTransition } from './use-chart-transition'
import { cn } from '../../../shared/ui/utils'

const platforms: readonly Platform[] = ['kalshi', 'polymarket']
const labels = { kalshi: 'Kalshi', polymarket: 'Polymarket' }
const colors = { kalshi: 'var(--platform-kalshi)', polymarket: 'var(--platform-polymarket)' }

type VolumeChartProps = {
  points: readonly VolumePoint[]
  visiblePlatforms: readonly Platform[]
  granularity: 'day' | 'week'
  scale: ChartScale
  svgRef: RefObject<SVGSVGElement | null>
  analysisSelected?: boolean
  onAnalyzePoint?: (point: VolumePoint, position: { left: number }) => void
  windowControl?: ChartWindowControl
  instantTransition?: boolean
  plotWidth?: number
}

export function VolumeChart({ points, visiblePlatforms, granularity, scale, svgRef, onAnalyzePoint, analysisSelected = false, windowControl, instantTransition = false, plotWidth = 0 }: VolumeChartProps) {
  const plotRef = useRef<HTMLDivElement>(null)
  const clipRectRef = useRef<SVGRectElement>(null)
  const dateLabelRef = useRef<HTMLSpanElement>(null)
  const cursorX = useRef<number | null>(null)
  const dateX = useMotionValue(160)
  const width = usePlotWidth(plotRef, plotWidth)
  const [selectedDay, setSelectedDay] = useState<Day | null>(null)
  const [active, setActive] = useState(false)
  const [pointerSelection, setPointerSelection] = useState(true)
  const clipReady = useRef(false)
  const clipRight = useMotionValue(0)
  const reduceMotion = useReducedMotion()
  const height = width < 480 ? 280 : width < 900 ? 336 : 420
  // Keep target domain on the frame so day↔week morphs with the camera, not as a Y wipe.
  const geometry = useMemo(() => buildChartGeometry({ points, visiblePlatforms, width, height, scale }), [points, visiblePlatforms, width, height, scale])
  const gestures = useChartWindow(plotRef, { left: geometry.left, right: geometry.right, width }, windowControl, () => setActive(false))
  const target = useMemo(() => createChartFrame(geometry), [geometry])
  const frame = useChartTransition(target, reduceMotion, instantTransition)
  const selectedIndex = selectedDay ? points.findIndex((point) => point.day <= selectedDay && selectedDay <= point.endDay) : -1
  const currentIndex = selectedIndex >= 0 ? selectedIndex : Math.max(0, points.length - 1)
  const selected = points[currentIndex]
  const selectedX = selected ? geometry.x(selected.day) : geometry.right
  const selectedDays = selected ? windowDays({ from: selected.day, to: selected.endDay }) : 0
  const partialWeek = selected?.partial
    ? ' · неполные данные'
    : granularity === 'week' && selectedDays > 0 && selectedDays < 7 ? ` · ${formatDaysCount(selectedDays)}` : ''
  const dateText = selected
    ? (width < 480 && selected.day !== selected.endDay
      ? formatCompactPeriod(selected.day, selected.endDay)
      : formatShortPeriod(selected.day, selected.endDay)) + partialWeek
    : ''
  const labelsOnLeft = selectedX > Math.max(width / 2, geometry.right - 160)
  const labelX = selectedX
  // Keep the trailing incomplete-week stub bright when the crosshair is on the last full week.
  // Otherwise the hover wipe clips at Monday and the chart looks like a mid-air cliff.
  const revealX = chartRevealX({ selectedX, selectedIndex: currentIndex, points, x: geometry.x })
  const clipId = useId()
  const plotClipId = useId()
  const axisClipId = useId()
  const labelGlide: Transition = reduceMotion || !pointerSelection ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 40, mass: 0.6 }

  const pointLabels = selected
    ? platforms.flatMap((platform) => {
        const value = selected[platform]
        if (!visiblePlatforms.includes(platform) || value === null) return []
        const series = frame.series.find((entry) => entry.platform === platform)
        const y = sampleSeriesY(series?.segments ?? [], selectedX)
        if (y === null) return []
        const label = granularity === 'week' ? formatWeeklyDailyAverage(value) : formatUsdCompact(value)
        return [{ platform, value, label, pointY: y, y }]
      }).sort((a, b) => a.y - b.y)
    : []
  const labelGap = 40
  const labelTop = geometry.top + 18
  const labelBottom = geometry.bottom - 18
  if (pointLabels.length === 2 && pointLabels[0] && pointLabels[1] && pointLabels[1].y - pointLabels[0].y < labelGap) {
    const middle = (pointLabels[0].y + pointLabels[1].y) / 2
    pointLabels[0].y = middle - labelGap / 2
    pointLabels[1].y = middle + labelGap / 2
    if (pointLabels[1].y > labelBottom) {
      pointLabels[1].y = labelBottom
      pointLabels[0].y = labelBottom - labelGap
    }
    if (pointLabels[0].y < labelTop) {
      pointLabels[0].y = labelTop
      pointLabels[1].y = labelTop + labelGap
    }
  }
  for (const entry of pointLabels) entry.y = Math.max(labelTop, Math.min(labelBottom, entry.y))

  useLayoutEffect(() => {
    const target = active ? revealX : geometry.right
    // Jump on first layout so remounts (platforms ↔ categories) never wipe-in from x=0.
    if (reduceMotion || !clipReady.current) {
      clipRight.set(target)
      clipReady.current = true
      return
    }
    const controls = animate(clipRight, target, { type: 'spring', stiffness: 500, damping: 45 })
    return () => controls.stop()
  }, [active, revealX, geometry.right, reduceMotion, clipRight])

  useMotionValueEvent(clipRight, 'change', (latest) => {
    clipRectRef.current?.setAttribute('width', String(Math.max(0, latest - geometry.left)))
  })

  function moveDateLabel(x: number) {
    const labelWidth = dateLabelRef.current?.offsetWidth ?? 0
    dateX.set(Math.max(8, Math.min(width - labelWidth - 8, x - labelWidth / 2)))
  }

  useLayoutEffect(() => {
    moveDateLabel(cursorX.current ?? selectedX)
  }, [active, selectedX, dateText, width, dateX])

  function selectAtPointer(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const cssX = event.clientX - rect.left
    const localX = Math.max(geometry.left, Math.min(geometry.right, cssX * width / rect.width))
    const index = nearestPointIndex(geometry.pointXs, localX)
    setPointerSelection(true)
    const point = points[index]
    if (point) setSelectedDay(point.day)
    cursorX.current = event.pointerType === 'mouse' ? localX : null
    moveDateLabel(cursorX.current ?? (point ? geometry.x(point.day) : selectedX))
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
    setPointerSelection(false)
    cursorX.current = null
    const point = points[index]
    if (point) {
      setSelectedDay(point.day)
      const pointX = geometry.x(point.day)
      moveDateLabel(pointX)
      clipRight.stop()
      clipRight.set(chartRevealX({ selectedX: pointX, selectedIndex: index, points, x: geometry.x }))
    }
    setActive(true)
  }

  const valueText = selected
    ? `${formatPeriod(selected.day, selected.endDay)}${partialWeek} Kalshi: ${platformValueText(selected, 'kalshi', granularity)}. Polymarket: ${platformValueText(selected, 'polymarket', granularity)}.`
    : 'Нет данных'

  return (
    <figure className="flex min-w-0 flex-col gap-4">
      <div
        ref={plotRef}
        role="slider"
        tabIndex={points.length ? 0 : -1}
        aria-label={granularity === 'week' ? 'Выбрать неделю на графике' : 'Выбрать дату на графике'}
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
        onFocus={() => {
          setPointerSelection(false)
          cursorX.current = null
          moveDateLabel(selectedX)
          setActive(true)
        }}
        onBlur={() => { if (!gestures.isPressed()) setActive(false) }}
        onKeyDown={onKeyDown}
        className={cn(
          'relative min-w-0 touch-pan-y pt-5 outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0',
          gestures.panning ? 'cursor-grabbing' : 'cursor-crosshair',
        )}
      >
        <motion.div
          data-chart-date=""
          aria-hidden="true"
          className={cn('pointer-events-none absolute left-0 top-0', (!active || analysisSelected) && 'invisible')}
          style={{ x: dateX }}
        >
          <span
            ref={dateLabelRef}
            className="inline-block whitespace-nowrap font-mono text-xs text-muted-foreground tabular-nums"
          >
            {dateText}
          </span>
        </motion.div>
        <svg ref={svgRef} aria-hidden="true" width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="block select-none">
          <defs>
            <clipPath id={plotClipId}>
              <rect x={geometry.left - 4} y={geometry.top - 4} width={geometry.right - geometry.left + 8} height={geometry.bottom - geometry.top + 8} />
            </clipPath>
            <clipPath id={axisClipId}>
              <rect x={0} y={geometry.top - 8} width={width} height={geometry.bottom - geometry.top + 16} />
            </clipPath>
            <clipPath id={clipId}>
              <rect ref={clipRectRef} x={geometry.left} y={0} width={Math.max(0, clipRight.get() - geometry.left)} height={height} />
            </clipPath>
          </defs>
          {granularity === 'week' && (
            <text x={geometry.left - 12} y={10} textAnchor="end" className="chart-axis">в день</text>
          )}
          <g clipPath={`url(#${axisClipId})`}>
            {frame.yTicks.map((tick) => (
              <g key={tick.value} opacity={tick.opacity}>
                <line x1={geometry.left} x2={geometry.right} y1={tick.y} y2={tick.y} stroke="var(--stroke)" strokeDasharray="3 5" strokeLinecap="round" />
                <text x={geometry.left - 12} y={tick.y} dy="0.35em" textAnchor="end" className="chart-axis">{formatUsdTick(tick.value)}</text>
              </g>
            ))}
          </g>
          <g>
            {frame.xTicks.map((tick) => (
              <text key={tick.key} x={tick.x} y={height - 12} opacity={tick.opacity} textAnchor={tick.anchor} className="chart-axis" data-date-format={tick.format}>{formatDateTick(tick.day, tick.format)}</text>
            ))}
          </g>
          <g clipPath={`url(#${plotClipId})`}>
            <g opacity={0.22} data-export-ignore><SeriesMarks series={frame.series} /></g>
            <g clipPath={`url(#${clipId})`} data-export-series><SeriesMarks series={frame.series} /></g>
          </g>
          {active && <line data-export-ignore x1={selectedX} x2={selectedX} y1={geometry.top} y2={geometry.bottom} stroke="var(--stroke-strong)" strokeDasharray="3 5" pointerEvents="none" />}
          {pointLabels.map((entry) => (
            <g key={entry.platform} data-export-ignore transform={`translate(${selectedX} ${entry.pointY})`}>
              <circle cx={0} cy={0} r={active ? 5 : 4} fill={colors[entry.platform]} stroke="var(--card)" strokeWidth="2" />
            </g>
          ))}
        </svg>
        {active && pointLabels.map((entry) => (
          <motion.div
            key={entry.platform}
            data-export-ignore
            data-series-label={entry.platform}
            className="pointer-events-none absolute top-5 left-0 z-10 w-0"
            style={{ x: labelX }}
            animate={{ y: entry.y }}
            transition={labelGlide}
          >
            <div
              className={cn(
                'flex w-max -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-white',
                labelsOnLeft ? '-translate-x-[calc(100%+10px)]' : 'translate-x-[10px]',
              )}
              style={{ backgroundColor: colors[entry.platform] }}
            >
              <span className="text-[11px] font-medium leading-none">{labels[entry.platform]}</span>
              <span className="font-mono text-[11px] font-semibold leading-none tabular-nums">{entry.label}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </figure>
  )
}

function platformValueText(point: VolumePoint, platform: Platform, granularity: 'day' | 'week') {
  const value = point[platform]
  if (value === null) return formatUsd(null)
  return granularity === 'week' ? formatWeeklyDailyAverage(value) : formatUsd(value)
}

function SeriesMarks({ series }: { series: ChartFrame['series'] }) {
  return series.map((entry) => (
    <g key={entry.platform} fill={colors[entry.platform]}>
      {entry.segments.map((segment, index) => {
        const first = segment.positions[0]
        if (!first) return null
        return segment.positions.length === 1 ? (
          <circle key={index} cx={first.x} cy={first.y} r="3" opacity={segment.opacity} />
        ) : (
          <path
            key={index}
            d={segment.positions.map((position, index) => `${index ? 'L' : 'M'}${position.x.toFixed(2)},${position.y.toFixed(2)}`).join(' ')}
            opacity={segment.opacity}
            stroke={colors[entry.platform]}
            strokeWidth="1.5"
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={segment.dashed ? '5 5' : undefined}
          />
        )
      })}
    </g>
  ))
}
