import { useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'

import { dayAtTime, panWindow, zoomWindow, type HistoryBounds, type VolumeWindow } from '../../../entities/volume/dashboard/dashboard'

export type ChartWindowControl = {
  window: VolumeWindow
  bounds: HistoryBounds
  onZoom: (window: VolumeWindow) => void
  onPanPreview: (window: VolumeWindow) => void
  onPanCommit: (window: VolumeWindow) => void
  onReset: () => void
}

type Plot = { left: number; right: number; width: number }
type Gesture = {
  pointerId: number
  startX: number
  startY: number
  moved: boolean
  pan: { window: VolumeWindow; bounds: HistoryBounds; daysPerPixel: number; latest: VolumeWindow } | null
}

export function useChartWindow(ref: RefObject<HTMLDivElement | null>, plot: Plot, control: ChartWindowControl | undefined, onPanStart: () => void) {
  const gesture = useRef<Gesture | null>(null)
  const [panning, setPanning] = useState(false)
  const latest = useRef({ plot, control, onPanStart })
  latest.current = { plot, control, onPanStart }

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    function wheel(event: WheelEvent) {
      const { plot, control } = latest.current
      if (!control || !event.deltaY) return
      const rect = element!.getBoundingClientRect()
      const x = (event.clientX - rect.left) * plot.width / rect.width
      const ratio = Math.max(0, Math.min(1, (x - plot.left) / (plot.right - plot.left)))
      const anchor = dayAtTime(Date.parse(control.window.from) + ratio * (Date.parse(control.window.to) - Date.parse(control.window.from)))
      const next = zoomWindow(control.window, control.bounds, anchor, event.deltaY < 0 ? 1 / 1.2 : 1.2)
      if (next.from === control.window.from && next.to === control.window.to) return
      event.preventDefault()
      control.onZoom(next)
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [ref])

  function down(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0 || gesture.current) return false
    const rect = event.currentTarget.getBoundingClientRect()
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      pan: event.pointerType === 'mouse' && control ? {
        window: control.window,
        bounds: control.bounds,
        daysPerPixel: (Date.parse(control.window.to) - Date.parse(control.window.from)) / 86_400_000 / ((plot.right - plot.left) * rect.width / plot.width),
        latest: control.window,
      } : null,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.focus({ preventScroll: true })
    return true
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary) return false
    const current = gesture.current
    if (!current) return event.pointerType === 'mouse'
    if (current.pointerId !== event.pointerId) return false
    if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > 6) {
      current.moved = true
      if (current.pan) {
        setPanning(true)
        latest.current.onPanStart()
      }
    }
    if (!current.moved || !current.pan) return true
    const next = panWindow(current.pan.window, current.pan.bounds, Math.round((current.startX - event.clientX) * current.pan.daysPerPixel))
    if (next.from !== current.pan.latest.from || next.to !== current.pan.latest.to) {
      current.pan.latest = next
      latest.current.control?.onPanPreview(next)
    }
    return false
  }

  function end(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return false
    gesture.current = null
    setPanning(false)
    if (current.moved && current.pan) latest.current.control?.onPanCommit(current.pan.latest)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    return !current.moved
  }

  return { down, move, end, panning, isPressed: () => gesture.current !== null, reset: () => latest.current.control?.onReset() }
}
