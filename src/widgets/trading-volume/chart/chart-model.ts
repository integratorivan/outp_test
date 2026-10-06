import { scaleLinear, scaleSymlog } from 'd3-scale'

import type { ChartScale, VolumePoint } from '../../../entities/volume/dashboard/dashboard'
import type { DateTickFormat } from '../../../entities/volume/lib/format'
import { daySchema, type Day, type Platform } from '../../../entities/volume/model'

export type ChartCamera = {
  firstTime: number
  lastTime: number
  domainMax: number
  left: number
  right: number
  top: number
  bottom: number
  y: (value: number) => number
}

export function chartCameraY(camera: ChartCamera, value: number) {
  return camera.y(value)
}

export function nearestPointIndex(times: readonly number[], target: number): number {
  if (!times.length) return -1
  let left = 0
  let right = times.length - 1
  while (left < right) {
    const middle = Math.floor((left + right) / 2)
    const time = times[middle]
    if (time !== undefined && time < target) left = middle + 1
    else right = middle
  }
  const time = times[left]
  const previous = times[left - 1]
  return time !== undefined && previous !== undefined && target - previous <= time - target ? left - 1 : left
}

export function buildUsdDomain(maximum: number) {
  const rawStep = (maximum || 4) / 4
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const normalized = rawStep / magnitude
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude
  return { step, domainMax: Math.ceil((maximum || 4) / step) * step }
}

const symlogConstant = 1_000_000
const dayMs = 86_400_000

export function buildUsdTicks(maximum: number, symlog: boolean): number[] {
  const { step, domainMax } = buildUsdDomain(maximum)
  return symlog && domainMax > symlogConstant
    ? [0, ...Array.from({ length: Math.floor(Math.log10(domainMax)) - 6 + 1 }, (_, index) => 10 ** (index + 6))]
    : Array.from({ length: Math.round(domainMax / step) + 1 }, (_, index) => index * step)
}

export type DateTick = { day: Day; x: number; format: DateTickFormat }

const minDateLabelGap = 40

/** Drops a label that sits under 40px from the previous one. The last label stays. */
function spaceDateTicks(ticks: DateTick[]): DateTick[] {
  if (ticks.length <= 1) return ticks
  const last = ticks[ticks.length - 1]
  if (!last) return ticks
  const kept: DateTick[] = []
  for (const tick of ticks.slice(0, -1)) {
    const previous = kept[kept.length - 1]
    if (previous && tick.x - previous.x < minDateLabelGap) continue
    if (last.x - tick.x < minDateLabelGap) continue
    kept.push(tick)
  }
  kept.push(last)
  return kept
}

export function buildDateTicks({ days, firstTime, lastTime, width, left, right, x }: {
  days: readonly Day[]
  firstTime: number
  lastTime: number
  width: number
  left: number
  right: number
  x: (day: Day) => number
}): DateTick[] {
  const xTicks: DateTick[] = []
  if (lastTime - firstTime > 180 * dayMs) {
    const firstDate = new Date(firstTime)
    const lastDate = new Date(lastTime)
    const firstMonth = firstDate.getUTCFullYear() * 12 + firstDate.getUTCMonth()
    const lastMonth = lastDate.getUTCFullYear() * 12 + lastDate.getUTCMonth()
    const capacity = Math.max(2, Math.floor((right - left) / 64))
    const desiredStep = Math.ceil((lastMonth - firstMonth) / capacity)
    const monthStep = [1, 2, 3, 4, 6, 12].find((step) => step >= desiredStep) ?? Math.ceil(desiredStep / 12) * 12
    for (let month = Math.ceil(firstMonth / monthStep) * monthStep; month <= lastMonth; month += monthStep) {
      const time = Date.UTC(Math.floor(month / 12), month % 12, 1)
      if (time < firstTime || time > lastTime) continue
      const day = daySchema.parse(new Date(time).toISOString().slice(0, 10))
      xTicks.push({ day, x: x(day), format: month % 12 === 0 ? 'year' : 'month' })
    }
    const firstDay = days[0]
    const firstTick = xTicks[0]
    if (firstDay && firstTick) {
      const boundary = { day: firstDay, x: x(firstDay), format: firstDate.getUTCMonth() === 0 ? 'year' : 'month' } satisfies DateTick
      if (firstTick.x - boundary.x >= 64) xTicks.unshift(boundary)
      else if (firstTick.format !== 'year') xTicks[0] = boundary
    }
  } else {
    const fullWeek = lastTime - firstTime <= 6 * dayMs
    const tickCount = fullWeek ? days.length : Math.min(days.length, width < 480 ? 3 : 6)
    const tickIndexes = new Set(Array.from({ length: tickCount }, (_, index) => tickCount === 1 ? 0 : Math.round(index * (days.length - 1) / (tickCount - 1))))
    const format = width < 480 && fullWeek ? 'day' : 'date'
    for (const [index, day] of days.entries()) {
      if (tickIndexes.has(index)) xTicks.push({ day, x: x(day), format })
    }
  }
  return spaceDateTicks(xTicks)
}

export function buildChartGeometry({ points, visiblePlatforms, width, height, scale = 'linear', domain }: {
  points: readonly VolumePoint[]
  visiblePlatforms: readonly Platform[]
  width: number
  height: number
  scale?: ChartScale
  domain?: number
}) {
  const left = width < 480 ? 44 : 64
  const right = width - (width < 480 ? 8 : 16)
  const top = 16
  const bottom = height - 40
  const times = points.map((point) => Date.parse(point.day))
  const firstTime = times[0] ?? 0
  const lastTime = times.at(-1) ?? firstTime
  let maximum = 0
  for (const point of points) {
    for (const platform of visiblePlatforms) maximum = Math.max(maximum, point[platform] ?? 0)
  }
  const domainMax = domain ?? buildUsdDomain(maximum).domainMax
  const x = (day: Day) => firstTime === lastTime ? (left + right) / 2 : left + (Date.parse(day) - firstTime) / (lastTime - firstTime) * (right - left)
  const symlog = scale === 'symlog'
  const linearY = scaleLinear().domain([0, domainMax]).range([bottom, top])
  const y = symlog
    ? scaleSymlog().constant(symlogConstant).domain([0, domainMax]).range([bottom, top])
    : linearY
  const pointXs = points.map((point) => x(point.day))
  const xTicks = buildDateTicks({ days: points.map((point) => point.day), firstTime, lastTime, width, left, right, x })
  const yTicks = buildUsdTicks(maximum, symlog)
  const series = visiblePlatforms.map((platform) => {
    let path = ''
    let previous: VolumePoint | undefined
    let previousPosition: { x: number; y: number } | undefined
    let segment: { x: number; y: number }[] = []
    let dashed = false
    const segments: { positions: { x: number; y: number }[]; dashed?: boolean }[] = []
    const isolated: { x: number; y: number }[] = []
    function finishSegment() {
      if (segment.length) segments.push(dashed ? { positions: segment, dashed: true } : { positions: segment })
      if (segment.length === 1 && segment[0]) isolated.push(segment[0])
      segment = []
      dashed = false
    }
    for (const point of points) {
      const value = point[platform]
      if (value === null) {
        finishSegment()
        previous = undefined
        previousPosition = undefined
        continue
      }
      const connected = previous !== undefined && Date.parse(point.day) - Date.parse(previous.endDay) <= dayMs
      const position = { x: x(point.day), y: y(value) }
      // Gaps and trailing stubs dash only the listed platforms so one series cannot mark the other.
      if (point.partialPlatforms?.includes(platform)) {
        finishSegment()
        if (connected && previousPosition) {
          segment = [previousPosition, position]
          dashed = true
          finishSegment()
        } else {
          segment = [position]
          dashed = true
          finishSegment()
        }
        path += `${connected ? 'L' : 'M'}${position.x.toFixed(2)},${position.y.toFixed(2)} `
        previous = point
        previousPosition = position
        continue
      }
      if (!connected) finishSegment()
      path += `${connected ? 'L' : 'M'}${position.x.toFixed(2)},${position.y.toFixed(2)} `
      segment.push(position)
      previous = point
      previousPosition = position
    }
    finishSegment()
    return { platform, path: path.trim(), isolated, segments }
  })
  return {
    left,
    right,
    top,
    bottom,
    times,
    pointXs,
    firstTime,
    lastTime,
    domainMax,
    x,
    y,
    xTicks,
    yTicks,
    series,
    camera: { firstTime, lastTime, domainMax, left, right, top, bottom, y } satisfies ChartCamera,
  }
}
