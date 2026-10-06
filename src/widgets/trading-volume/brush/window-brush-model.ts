import { panWindow, shiftDay, windowDays, type HistoryBounds, type VolumeWindow } from '../../../entities/volume/dashboard/dashboard'

export const brushInset = 16
export const brushHandleDistance = 72

export function brushViewport(window: VolumeWindow, bounds: HistoryBounds, width: number): VolumeWindow {
  const historyDays = windowDays({ from: bounds.firstDay, to: bounds.lastDay })
  const visibleDays = Math.min(historyDays, Math.max(7, Math.floor((windowDays(window) - 1) * Math.max(1, width - brushInset * 2) / brushHandleDistance) + 1))
  const from = shiftDay(window.from, -Math.floor((visibleDays - windowDays(window)) / 2))
  return panWindow({ from, to: shiftDay(from, visibleDays - 1) }, bounds, 0)
}
