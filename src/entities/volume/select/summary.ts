import type { VolumePoint } from '../dashboard/dashboard'
import { shiftDay } from '../dashboard/dashboard'
import type { Day, Platform } from '../model'

export type PlatformVolumeSummary = {
  total: number | null
  share: number | null
  change: number | null
  availablePoints: number
  expectedPoints: number
  missingDays: readonly Day[]
  commonDays: number
  shareBasisDays: number
  changeBasisDays: number
}

function indexPointsByDay(points: readonly VolumePoint[]): Map<Day, VolumePoint> {
  const map = new Map<Day, VolumePoint>()
  for (const point of points) {
    map.set(point.day, point)
  }
  return map
}

function collectMissingDays(points: readonly VolumePoint[], platform: Platform): Day[] {
  const missing: Day[] = []
  for (const point of points) {
    if (point[platform] === null) missing.push(point.day)
  }
  return missing
}

function sumPlatform(points: readonly VolumePoint[], platform: Platform): { total: number | null; available: number } {
  let total = 0
  let available = 0
  for (const point of points) {
    const value = point[platform]
    if (value === null) continue
    total += value
    available += 1
  }
  return { total: available ? total : null, available }
}

function intersectionMetrics(points: readonly VolumePoint[]): {
  commonDays: number
  kalshiOnCommon: number
  polymarketOnCommon: number
} {
  let commonDays = 0
  let kalshiOnCommon = 0
  let polymarketOnCommon = 0
  for (const point of points) {
    const kalshi = point.kalshi
    const polymarket = point.polymarket
    if (kalshi === null || polymarket === null) continue
    commonDays += 1
    kalshiOnCommon += kalshi
    polymarketOnCommon += polymarket
  }
  return { commonDays, kalshiOnCommon, polymarketOnCommon }
}

function platformChange(
  points: readonly VolumePoint[],
  previousByDay: Map<Day, VolumePoint>,
  platform: Platform,
  windowDays: number,
): { change: number | null; changeBasisDays: number } {
  let currentSum = 0
  let previousSum = 0
  let changeBasisDays = 0
  for (const point of points) {
    const cur = point[platform]
    if (cur === null) continue
    const prevDay = shiftDay(point.day, -windowDays)
    const prev = previousByDay.get(prevDay)?.[platform] ?? null
    if (prev === null) continue
    currentSum += cur
    previousSum += prev
    changeBasisDays += 1
  }
  const change = changeBasisDays > 0 && previousSum > 0 ? (currentSum - previousSum) / previousSum : null
  return { change, changeBasisDays }
}

export function selectVolumeSummary(points: readonly VolumePoint[], previousPoints: readonly VolumePoint[] = []): Record<Platform, PlatformVolumeSummary> {
  const windowDays = points.length
  const previousByDay = indexPointsByDay(previousPoints)
  const intersection = intersectionMetrics(points)
  const combinedOnCommon = intersection.kalshiOnCommon + intersection.polymarketOnCommon

  function build(platform: Platform): PlatformVolumeSummary {
    const { total, available } = sumPlatform(points, platform)
    const missingDays = collectMissingDays(points, platform)
    const { change, changeBasisDays } = platformChange(points, previousByDay, platform, windowDays)
    let share: number | null = null
    if (intersection.commonDays > 0 && combinedOnCommon > 0) {
      const onCommon = platform === 'kalshi' ? intersection.kalshiOnCommon : intersection.polymarketOnCommon
      share = onCommon / combinedOnCommon
    }
    return {
      total,
      share,
      change,
      availablePoints: available,
      expectedPoints: windowDays,
      missingDays,
      commonDays: intersection.commonDays,
      shareBasisDays: intersection.commonDays,
      changeBasisDays,
    }
  }

  return { kalshi: build('kalshi'), polymarket: build('polymarket') }
}
