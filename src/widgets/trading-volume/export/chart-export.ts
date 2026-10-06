import geistCyrillic from '@fontsource-variable/geist/files/geist-cyrillic-wght-normal.woff2?url'
import geistLatin from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url'
import monoCyrillic from '@fontsource-variable/geist-mono/files/geist-mono-cyrillic-wght-normal.woff2?url'
import monoLatin from '@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?url'

import type { CategoryChartPoint, ChartView, VolumePeriod, VolumePoint } from '../../../entities/volume/dashboard/dashboard'
import { dashboardCategories, type DashboardCategory } from '../../../entities/volume/categories'
import { formatDateTick } from '../../../entities/volume/lib/format'
import { dashboardCategoryLabels } from '../../../entities/volume/lib/labels'
import type { Platform } from '../../../entities/volume/model'

const svgNamespace = 'http://www.w3.org/2000/svg'
const presentationProperties = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
  'stroke-linecap', 'stroke-linejoin', 'paint-order', 'stop-color', 'stop-opacity',
  'font-family', 'font-size', 'font-weight', 'font-variant-numeric', 'letter-spacing',
]

export function buildVolumeCsv({ points, visiblePlatforms }: { points: readonly VolumePoint[]; visiblePlatforms: readonly Platform[] }) {
  const header = ['period_start', 'period_end', ...visiblePlatforms.map((platform) => `${platform}_usd`)]
  const rows = points.map((point) => [point.day, point.endDay, ...visiblePlatforms.map((platform) => point[platform] ?? '')])
  return '\uFEFF' + [header, ...rows].map((row) => row.join(',')).join('\r\n') + '\r\n'
}

export function buildCategoryCsv({ points, categories }: { points: readonly CategoryChartPoint[]; categories: readonly DashboardCategory[] }) {
  const header = ['period_start', 'period_end', 'total_usd', ...categories.map((category) => `${category}_usd`)]
  const rows = points.map((point) => [point.day, point.endDay, point.total ?? '', ...categories.map((category) => point.values[category] ?? '')])
  return '\uFEFF' + [header, ...rows].map((row) => row.join(',')).join('\r\n') + '\r\n'
}

export function chartExportFilename(points: readonly Pick<VolumePoint, 'day' | 'endDay'>[]) {
  const first = points[0]
  const last = points.at(-1)
  return first && last ? `outpoll-volume-${first.day}-${last.endDay}` : 'outpoll-volume'
}

export function buildChartExportMetadata({ view, period, categories, visiblePlatforms }: {
  view: ChartView
  period: VolumePeriod | null
  categories: readonly DashboardCategory[]
  visiblePlatforms?: readonly Platform[]
}) {
  let title = view === 'categories' ? 'Объём по категориям' : 'Объём по платформам'
  if (view === 'categories' && visiblePlatforms?.length === 1) {
    title += ` · ${visiblePlatforms[0] === 'kalshi' ? 'Kalshi' : 'Polymarket'}`
  }
  if (period) {
    const startYear = period.startDay.slice(0, 4)
    const endYear = period.endDay.slice(0, 4)
    const start = `${formatDateTick(period.startDay, 'date')}${startYear === endYear ? '' : ` ${startYear}`}`
    const end = `${formatDateTick(period.endDay, 'date')} ${endYear}`
    title += ` · ${period.startDay === period.endDay ? end : `${start} – ${end}`}`
  }
  const selection = categories.length === dashboardCategories.length
    ? 'все'
    : categories.map((category) => dashboardCategoryLabels[category]).join(', ')
  return { title, categorySelection: `Категории: ${selection}` }
}

export type ChartExportMetadata = ReturnType<typeof buildChartExportMetadata>

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function exportFonts() {
  const fonts = [
    { family: 'Geist Variable', url: geistLatin, range: 'U+0000-00FF,U+2000-206F,U+20A0-20CF' },
    { family: 'Geist Variable', url: geistCyrillic, range: 'U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116' },
    { family: 'Geist Mono Variable', url: monoLatin, range: 'U+0000-00FF,U+2000-206F,U+20A0-20CF' },
    { family: 'Geist Mono Variable', url: monoCyrillic, range: 'U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116' },
  ]
  return (await Promise.all(fonts.map(async (font) => {
    const response = await fetch(font.url)
    if (!response.ok) throw new Error('Не удалось загрузить шрифт для экспорта')
    const url = await blobDataUrl(await response.blob())
    return `@font-face{font-family:'${font.family}';src:url('${url}') format('woff2');font-weight:100 900;unicode-range:${font.range}}`
  }))).join('\n')
}

export type ChartExportLegendEntry = { label: string; colorVar: string }

export async function createChartSvg({ source, legend, metadata }: {
  source: SVGSVGElement
  legend: readonly ChartExportLegendEntry[]
  metadata: ChartExportMetadata
}) {
  const clone = source.cloneNode(true)
  if (!(clone instanceof SVGSVGElement)) throw new Error('Не удалось подготовить график')
  const originals = source.querySelectorAll('*')
  const copies = clone.querySelectorAll('*')
  originals.forEach((element, index) => {
    const copy = copies[index]
    if (!(copy instanceof SVGElement)) return
    const style = getComputedStyle(element)
    for (const property of presentationProperties) {
      copy.setAttribute(property, style.getPropertyValue(property).replace(/url\(["']?[^#)]*#/g, 'url(#').replace(/([^)])["']\)/g, '$1)'))
    }
    copy.removeAttribute('class')
  })
  clone.querySelectorAll('[data-export-ignore]').forEach((element) => element.remove())
  clone.querySelectorAll('[data-export-series]').forEach((element) => element.removeAttribute('clip-path'))

  const { width, height } = source.viewBox.baseVal
  const svg = document.createElementNS(svgNamespace, 'svg')
  svg.setAttribute('xmlns', svgNamespace)
  svg.setAttribute('width', String(width))
  const theme = getComputedStyle(document.documentElement)
  const background = document.createElementNS(svgNamespace, 'rect')
  background.setAttribute('width', '100%')
  background.setAttribute('height', '100%')
  background.setAttribute('fill', theme.getPropertyValue('--card').trim())
  svg.append(background)
  const style = document.createElementNS(svgNamespace, 'style')
  style.textContent = await exportFonts()
  svg.append(style)

  function addText(text: string, x: number, y: number, color: string, fontSize = 12) {
    const element = document.createElementNS(svgNamespace, 'text')
    element.textContent = text
    element.setAttribute('x', String(x))
    element.setAttribute('y', String(y))
    element.setAttribute('fill', color)
    element.setAttribute('font-family', 'Geist Variable, sans-serif')
    element.setAttribute('font-size', String(fontSize))
    element.setAttribute('font-weight', '500')
    svg.append(element)
  }
  await document.fonts.ready
  const context = document.createElement('canvas').getContext('2d')
  if (!context) throw new Error('Не удалось подготовить легенду графика')
  const addWrappedText = (text: string, startY: number, color: string, fontSize = 12) => {
    context.font = `500 ${fontSize}px "Geist Variable"`
    let line = ''
    let y = startY
    for (const word of text.split(' ')) {
      const nextLine = line ? `${line} ${word}` : word
      if (line && context.measureText(nextLine).width > width - 32) {
        addText(line, 16, y, color, fontSize)
        line = word
        y += 20
      } else {
        line = nextLine
      }
    }
    addText(line, 16, y, color, fontSize)
    return y + 24
  }
  const selectionY = addWrappedText(metadata.title, 24, theme.getPropertyValue('--content').trim(), 14)
  let legendY = addWrappedText(metadata.categorySelection, selectionY, theme.getPropertyValue('--content-muted').trim())
  context.font = '500 12px "Geist Variable"'
  let legendX = 16
  for (const entry of legend) {
    const textWidth = context.measureText(entry.label).width
    if (legendX > 16 && legendX + textWidth > width - 16) {
      legendX = 16
      legendY += 20
    }
    const color = theme.getPropertyValue(entry.colorVar).trim() || entry.colorVar
    addText(entry.label, legendX, legendY, color)
    legendX += textWidth + 24
  }
  const headerHeight = legendY + 20
  svg.setAttribute('height', String(height + headerHeight))
  svg.setAttribute('viewBox', `0 0 ${width} ${height + headerHeight}`)
  clone.setAttribute('y', String(headerHeight))
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  clone.removeAttribute('aria-hidden')
  clone.removeAttribute('class')
  svg.append(clone)
  return { blob: new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' }), width, height: height + headerHeight }
}

export type ChartSvgExport = Awaited<ReturnType<typeof createChartSvg>>

export async function chartSvgToPng({ blob, width, height }: ChartSvgExport): Promise<Blob> {
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * 2)
    canvas.height = Math.round(height * 2)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Не удалось создать PNG')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Не удалось создать PNG')), 'image/png')
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function downloadChartFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
