import type { Platform } from '../../../entities/volume/model'
import { chartCameraY, type buildChartGeometry, type ChartCamera } from './chart-model'

type Position = { x: number; y: number }
export type ChartSegment = { positions: readonly Position[]; opacity: number; dashed?: boolean }
export type ChartFrame = {
  camera: ChartCamera
  series: { platform: Platform; segments: ChartSegment[] }[]
  xTicks: (ReturnType<typeof buildChartGeometry>['xTicks'][number] & { key: string; opacity: number; anchor: 'start' | 'middle' | 'end' })[]
  yTicks: { value: number; y: number; opacity: number }[]
}

export function createChartFrame(geometry: ReturnType<typeof buildChartGeometry>): ChartFrame {
  return {
    camera: geometry.camera,
    series: geometry.series.map((series) => ({
      platform: series.platform,
      segments: series.segments.map((segment) => ({
        positions: segment.positions,
        opacity: 1,
        ...(segment.dashed ? { dashed: true } : {}),
      })),
    })),
    xTicks: geometry.xTicks.map((tick) => ({
      ...tick,
      key: `${tick.day}-${tick.format}`,
      opacity: 1,
      anchor: tick.x - geometry.left < 24 ? 'start' : geometry.right - tick.x < 24 ? 'end' : 'middle',
    })),
    yTicks: geometry.yTicks.map((value) => ({ value, y: geometry.y(value), opacity: 1 })),
  }
}

const mix = (from: number, to: number, progress: number) => from + (to - from) * progress

function sampleY(positions: readonly Position[], x: number): number | null {
  const first = positions[0]
  const last = positions.at(-1)
  if (!first || !last || x < first.x || x > last.x) return null
  let low = 0
  let high = positions.length - 1
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    const position = positions[middle]
    if (position && position.x < x) low = middle + 1
    else high = middle
  }
  const right = positions[low]
  const left = positions[low - 1]
  if (right?.x === x) return right.y
  return left && right ? mix(left.y, right.y, (x - left.x) / (right.x - left.x)) : null
}

export function sampleSeriesY(segments: readonly ChartSegment[], x: number): number | null {
  for (const segment of segments) {
    if (segment.opacity === 0) continue
    const y = sampleY(segment.positions, x)
    if (y !== null) return y
  }
  return null
}

function interpolateSegments(from: readonly ChartSegment[], to: readonly ChartSegment[]) {
  const boundaries = [...new Set([...from, ...to].flatMap((segment) => {
    const first = segment.positions[0]
    const last = segment.positions.at(-1)
    return first && last ? [first.x, last.x] : []
  }))].sort((a, b) => a - b)
  const pairs: { fromOpacity: number; toOpacity: number; dashed?: boolean; positions: { x: number; fromY: number; toY: number }[] }[] = []

  function addPair(source: ChartSegment | undefined, target: ChartSegment | undefined, xs: readonly number[]) {
    if (!source && !target) return
    const positions = xs.flatMap((x) => {
      const sourceY = sampleY(source?.positions ?? [], x)
      const targetY = sampleY(target?.positions ?? [], x)
      const fromY = sourceY ?? targetY
      const toY = targetY ?? sourceY
      return fromY === null || toY === null ? [] : [{ x, fromY, toY }]
    })
    pairs.push({
      fromOpacity: source?.opacity ?? 0,
      toOpacity: target?.opacity ?? 0,
      positions,
      ...((target?.dashed || source?.dashed) ? { dashed: true } : {}),
    })
  }

  for (let index = 1; index < boundaries.length; index += 1) {
    const start = boundaries[index - 1]
    const end = boundaries[index]
    if (start === undefined || end === undefined) continue
    const middle = (start + end) / 2
    const source = from.find((segment) => sampleY(segment.positions, middle) !== null)
    const target = to.find((segment) => sampleY(segment.positions, middle) !== null)
    const xs = [...new Set([start, end, ...[source, target].flatMap((segment) => segment?.positions.filter((position) => position.x > start && position.x < end).map((position) => position.x) ?? [])])].sort((a, b) => a - b)
    addPair(source, target, xs)
  }

  const isolatedXs = [...new Set([...from, ...to].flatMap((segment) => segment.positions.length === 1 ? segment.positions.map((position) => position.x) : []))]
  for (const x of isolatedXs) {
    const source = from.find((segment) => segment.positions.length === 1 && segment.positions[0]?.x === x)
    const target = to.find((segment) => segment.positions.length === 1 && segment.positions[0]?.x === x)
    addPair(source, target, [x])
  }

  return (progress: number): ChartSegment[] => pairs.map((pair) => ({
    opacity: mix(pair.fromOpacity, pair.toOpacity, progress),
    positions: pair.positions.map((position) => ({ x: position.x, y: mix(position.fromY, position.toY, progress) })),
    ...(pair.dashed ? { dashed: true } : {}),
  }))
}

export function interpolateChartFrame(from: ChartFrame, to: ChartFrame) {
  const platforms = [...new Set([...from.series, ...to.series].map((series) => series.platform))]
  const series = platforms.map((platform) => ({
    platform,
    interpolate: interpolateSegments(from.series.find((entry) => entry.platform === platform)?.segments ?? [], to.series.find((entry) => entry.platform === platform)?.segments ?? []),
  }))
  const xKeys = [...new Set([...from.xTicks, ...to.xTicks].map((tick) => tick.key))]
  const xTicks = xKeys.flatMap((key) => {
    const source = from.xTicks.find((tick) => tick.key === key)
    const target = to.xTicks.find((tick) => tick.key === key)
    const tick = target ?? source
    return tick ? [{ tick, fromX: source?.x ?? tick.x, toX: target?.x ?? tick.x, fromOpacity: source?.opacity ?? 0, toOpacity: target?.opacity ?? 0 }] : []
  })
  const yValues = [...new Set([...from.yTicks, ...to.yTicks].map((tick) => tick.value))]
  const yTicks = yValues.map((value) => {
    const source = from.yTicks.find((tick) => tick.value === value)
    const target = to.yTicks.find((tick) => tick.value === value)
    return {
      value,
      fromY: source?.y ?? chartCameraY(from.camera, value),
      toY: target?.y ?? chartCameraY(to.camera, value),
      fromOpacity: source?.opacity ?? 0,
      toOpacity: target?.opacity ?? 0,
    }
  })

  return (progress: number): ChartFrame => {
    if (progress <= 0) return from
    if (progress >= 1) return to
    return {
      camera: {
        firstTime: mix(from.camera.firstTime, to.camera.firstTime, progress),
        lastTime: mix(from.camera.lastTime, to.camera.lastTime, progress),
        domainMax: 1 / mix(1 / from.camera.domainMax, 1 / to.camera.domainMax, progress),
        left: mix(from.camera.left, to.camera.left, progress),
        right: mix(from.camera.right, to.camera.right, progress),
        top: mix(from.camera.top, to.camera.top, progress),
        bottom: mix(from.camera.bottom, to.camera.bottom, progress),
        y: (value) => mix(chartCameraY(from.camera, value), chartCameraY(to.camera, value), progress),
      },
      series: series.map((entry) => ({ platform: entry.platform, segments: entry.interpolate(progress) })),
      xTicks: xTicks.map((entry) => ({ ...entry.tick, x: mix(entry.fromX, entry.toX, progress), opacity: mix(entry.fromOpacity, entry.toOpacity, progress) })),
      yTicks: yTicks.map((entry) => ({ value: entry.value, y: mix(entry.fromY, entry.toY, progress), opacity: mix(entry.fromOpacity, entry.toOpacity, progress) })),
    }
  }
}
