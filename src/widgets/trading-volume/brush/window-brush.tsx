import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

import {
  aggregateVolumeWeeks, clampWindow, dayAtTime, isCompleteCalendarWeek, minWindowDays, panWindow, shiftDay, windowDays,
  type HistoryBounds, type VolumePoint, type VolumeWindow,
} from '../../../entities/volume/dashboard/dashboard'
import { formatDay, formatShortPeriod } from '../../../entities/volume/lib/format'
import type { Day, Platform } from '../../../entities/volume/model'
import { cn } from '../../../shared/ui/utils'
import { usePlotWidth } from '../hooks/use-plot-width'
import { brushInset, brushViewport } from './window-brush-model'

const colors = { kalshi: 'var(--platform-kalshi)', polymarket: 'var(--platform-polymarket)' }
const height = 48
const dayMs = 86_400_000

type DragMode = 'from' | 'to' | 'move'
type WindowBrushProps = {
  points: readonly VolumePoint[]
  visiblePlatforms: readonly Platform[]
  window: VolumeWindow
  bounds: HistoryBounds
  onPreview: (window: VolumeWindow) => void
  onCommit: (window: VolumeWindow) => void
  onDebounced: (window: VolumeWindow) => void
}

export function WindowBrush({ points, visiblePlatforms, window, bounds, onPreview, onCommit, onDebounced }: WindowBrushProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const clipId = useId()
  const width = usePlotWidth(trackRef)
  const [dragging, setDragging] = useState(false)
  const [frozenViewport, setFrozenViewport] = useState<VolumeWindow | null>(null)
  const drag = useRef<{
    pointerId: number
    mode: DragMode
    grabOffset: number
    start: VolumeWindow
    latest: VolumeWindow
    viewport: VolumeWindow
    inset: number
    rect: { left: number; width: number }
  } | null>(null)
  const windowRef = useRef(window)
  windowRef.current = window

  const viewport = frozenViewport ?? brushViewport(window, bounds, width)
  const firstTime = Date.parse(viewport.from)
  const spanMs = Math.max(Date.parse(viewport.to) - firstTime, 1)
  const plotWidth = Math.max(1, width - 2 * brushInset)
  const xPercent = (day: Day) => (brushInset + (Date.parse(day) - firstTime) / spanMs * plotWidth) / width * 100
  const fromPercent = xPercent(window.from)
  const toPercent = xPercent(window.to)

  const displayed = useMemo(() => {
    const context = points.filter((point) => Date.parse(point.endDay) >= firstTime - 7 * dayMs && Date.parse(point.day) <= firstTime + spanMs + 7 * dayMs)
    return windowDays(viewport) > 400 ? aggregateVolumeWeeks(context).filter(isCompleteCalendarWeek) : context
  }, [points, firstTime, spanMs, viewport.from, viewport.to])

  const paths = useMemo(() => {
    let maximum = 0
    for (const point of displayed) for (const platform of visiblePlatforms) maximum = Math.max(maximum, point[platform] ?? 0)
    const y = (value: number) => maximum ? height - 6 - value / maximum * (height - 12) : height - 6
    const x = (day: Day) => brushInset + (Date.parse(day) - firstTime) / spanMs * plotWidth
    return visiblePlatforms.map((platform) => {
      let path = ''
      let previous: VolumePoint | undefined
      for (const point of displayed) {
        const value = point[platform]
        if (value === null) {
          previous = undefined
          continue
        }
        const connected = previous !== undefined && Date.parse(point.day) - Date.parse(previous.endDay) <= dayMs
        path += `${connected ? 'L' : 'M'}${x(point.day).toFixed(2)},${y(value).toFixed(2)} `
        previous = point
      }
      return { platform, path: path.trim() }
    })
  }, [displayed, visiblePlatforms, plotWidth, firstTime, spanMs])

  function dayFromPointer(clientX: number, camera: VolumeWindow, rect: { left: number; width: number }, inset: number): Day {
    const ratio = (clientX - rect.left - inset) / Math.max(1, rect.width - inset * 2)
    return dayAtTime(Date.parse(camera.from) + ratio * (Date.parse(camera.to) - Date.parse(camera.from)))
  }

  function applyDrag(mode: DragMode, day: Day, grabOffset: number, start: VolumeWindow): VolumeWindow {
    if (mode === 'from') {
      const latest = shiftDay(start.to, 1 - minWindowDays)
      const from = shiftDay(day, -grabOffset)
      return clampWindow({ from: from > latest ? latest : from, to: start.to }, bounds)
    }
    if (mode === 'to') {
      const earliest = shiftDay(start.from, minWindowDays - 1)
      const to = shiftDay(day, -grabOffset)
      return clampWindow({ from: start.from, to: to < earliest ? earliest : to }, bounds)
    }
    return panWindow(start, bounds, Math.round((Date.parse(day) - Date.parse(start.from)) / dayMs) - grabOffset)
  }

  function startDrag(event: PointerEvent<HTMLDivElement>, mode: DragMode) {
    if (!event.isPrimary || event.button !== 0 || drag.current) return
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const day = dayFromPointer(event.clientX, viewport, rect, brushInset)
    const start = windowRef.current
    const grabOffset = Math.round((Date.parse(day) - Date.parse(mode === 'to' ? start.to : start.from)) / dayMs)
    drag.current = { pointerId: event.pointerId, mode, grabOffset, start, latest: start, viewport, inset: brushInset, rect }
    event.currentTarget.setPointerCapture(event.pointerId)
    setFrozenViewport(viewport)
    setDragging(true)
  }

  function onDragMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    const day = dayFromPointer(event.clientX, current.viewport, current.rect, current.inset)
    const next = applyDrag(current.mode, day, current.grabOffset, current.start)
    if (next.from === current.latest.from && next.to === current.latest.to) return
    current.latest = next
    onPreview(next)
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    drag.current = null
    setDragging(false)
    setFrozenViewport(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    onCommit(current.latest)
  }

  function onKeyDown(edge: 'from' | 'to', event: KeyboardEvent<HTMLDivElement>) {
    const current = windowRef.current
    const step = event.shiftKey ? 7 : 1
    let day: Day
    switch (event.key) {
      case 'ArrowLeft': day = shiftDay(current[edge], -step); break
      case 'ArrowRight': day = shiftDay(current[edge], step); break
      case 'Home': day = edge === 'from' ? bounds.firstDay : shiftDay(current.from, minWindowDays - 1); break
      case 'End': day = edge === 'to' ? bounds.lastDay : shiftDay(current.to, 1 - minWindowDays); break
      default: return
    }
    const next = applyDrag(edge, day, 0, current)
    event.preventDefault()
    if (next.from !== current.from || next.to !== current.to) onDebounced(next)
  }

  const animated = !dragging
  const minimumSpan = Math.min(minWindowDays, windowDays({ from: bounds.firstDay, to: bounds.lastDay })) - 1
  return (
    <div className="flex min-w-0 flex-col">
      <p aria-live="polite" className="sr-only">{formatShortPeriod(window.from, window.to)}</p>
      <div ref={trackRef} className="relative h-12 min-w-0 overflow-hidden rounded-panel bg-muted/40 select-none" role="group" aria-label="Выбор периода на мини-графике">
        <svg aria-hidden="true" width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="block" preserveAspectRatio="none">
          <defs><clipPath id={clipId}><rect width={width} height={height} rx="16" ry="16" /></clipPath></defs>
          <g clipPath={`url(#${clipId})`}>
            {paths.map(({ platform, path }) => path ? (
              <path key={platform} d={path} fill="none" stroke={colors[platform]} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            ) : null)}
          </g>
        </svg>
        <div aria-hidden="true" className={cn('absolute inset-y-0 left-0 bg-card/60', animated && 'transition-[right] duration-300 ease-out motion-reduce:transition-none')} style={{ right: `${100 - fromPercent}%` }} />
        <div aria-hidden="true" className={cn('absolute inset-y-0 right-0 bg-card/60', animated && 'transition-[left] duration-300 ease-out motion-reduce:transition-none')} style={{ left: `${toPercent}%` }} />
        <div
          aria-hidden="true"
          className={cn('absolute inset-y-0 cursor-grab rounded-panel border border-border-strong touch-none active:cursor-grabbing', animated && 'transition-[left,right] duration-300 ease-out motion-reduce:transition-none')}
          style={{ left: `${fromPercent}%`, right: `${100 - toPercent}%` }}
          onPointerDown={(event) => startDrag(event, 'move')} onPointerMove={onDragMove} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
        />
        {(['from', 'to'] as const).map((edge) => (
          <div
            key={edge} role="slider" tabIndex={0}
            aria-label={edge === 'from' ? 'Начало периода' : 'Конец периода'} aria-orientation="horizontal"
            aria-valuemin={edge === 'from' ? Date.parse(bounds.firstDay) : Date.parse(window.from) + minimumSpan * dayMs}
            aria-valuemax={edge === 'to' ? Date.parse(bounds.lastDay) : Date.parse(window.to) - minimumSpan * dayMs}
            aria-valuenow={Date.parse(window[edge])} aria-valuetext={formatDay(window[edge])}
            className={cn('absolute top-1/2 flex h-full w-7 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-control outline-none touch-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset', animated && 'transition-[left] duration-300 ease-out motion-reduce:transition-none')}
            style={{ left: `${edge === 'from' ? fromPercent : toPercent}%` }}
            onPointerDown={(event) => startDrag(event, edge)} onPointerMove={onDragMove} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
            onKeyDown={(event) => onKeyDown(edge, event)}
          >
            <span aria-hidden="true" className="flex h-7 w-3.5 items-center justify-center rounded-full border border-border-strong bg-card max-sm:w-5">
              <svg width="4" height="12" viewBox="0 0 4 12" className="text-muted-foreground">
                <circle cx="2" cy="2" r="1" fill="currentColor" /><circle cx="2" cy="6" r="1" fill="currentColor" /><circle cx="2" cy="10" r="1" fill="currentColor" />
              </svg>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
