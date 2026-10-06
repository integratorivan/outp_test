import type { VolumePoint } from '../dashboard/dashboard'
import type { Platform } from '../model'

export type PlatformVolumeSummary = {
  total: number | null
  share: number | null
  change: number | null
  availablePoints: number
  expectedPoints: number
}

export function selectVolumeSummary(points: readonly VolumePoint[], previousPoints: readonly VolumePoint[] = []): Record<Platform, PlatformVolumeSummary> {
  function sum(platform: Platform): PlatformVolumeSummary {
    let total = 0
    let availablePoints = 0
    for (const point of points) {
      const value = point[platform]
      if (value === null) continue
      total += value
      availablePoints += 1
    }
    const currentTotal = availablePoints ? total : null
    let previousTotal = 0
    let previousAvailablePoints = 0
    for (const point of previousPoints) {
      const value = point[platform]
      if (value === null) continue
      previousTotal += value
      previousAvailablePoints += 1
    }
    const change = currentTotal !== null && availablePoints === points.length &&
      previousPoints.length === points.length && previousAvailablePoints === previousPoints.length && previousTotal > 0
      ? (currentTotal - previousTotal) / previousTotal
      : null
    return { total: currentTotal, share: null, change, availablePoints, expectedPoints: points.length }
  }

  const kalshi = sum('kalshi')
  const polymarket = sum('polymarket')
  if (kalshi.total !== null && polymarket.total !== null && kalshi.availablePoints === points.length && polymarket.availablePoints === points.length) {
    const combined = kalshi.total + polymarket.total
    if (combined > 0) {
      kalshi.share = kalshi.total / combined
      polymarket.share = polymarket.total / combined
    }
  }
  return { kalshi, polymarket }
}
