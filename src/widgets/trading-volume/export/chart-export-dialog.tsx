import {
  FileDown,
  FileImage,
  FileSpreadsheet,
  FileType2,
} from 'lucide-react'
import { useEffect, useState, type ComponentProps, type RefObject } from 'react'

import { Button } from '../../../shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../../shared/ui/dialog'
import { Spinner } from '../../../shared/ui/spinner'
import {
  chartSvgToPng,
  createChartSvg,
  downloadChartFile,
  type ChartExportLegendEntry,
  type ChartExportMetadata,
  type ChartSvgExport,
} from './chart-export'

const downloads = [
  { value: 'csv', label: 'Скачать CSV', icon: FileSpreadsheet },
  { value: 'png', label: 'Скачать PNG', icon: FileImage },
  { value: 'svg', label: 'Скачать SVG', icon: FileType2 },
] as const

type ChartExportDialogProps = {
  csvText: string
  filename: string
  legend: readonly ChartExportLegendEntry[]
  metadata: ChartExportMetadata
  svgRef: RefObject<SVGSVGElement | null>
  disabled: boolean
}

export function ChartExportDialog({
  csvText,
  filename,
  legend,
  metadata,
  svgRef,
  disabled,
}: ChartExportDialogProps) {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<{
    url: string
    svg: ChartSvgExport
  } | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [pendingFormat, setPendingFormat] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setPreview(null)
      setError(null)
      setPendingFormat(null)
      return
    }
    const source = svgRef.current
    if (!source) return
    let cancelled = false
    let url: string | null = null
    setPreview(null)
    setError(null)
    setIsGenerating(true)
    createChartSvg({ source, legend, metadata })
      .then((svg) => {
        if (cancelled) return
        url = URL.createObjectURL(svg.blob)
        setPreview({ url, svg })
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось подготовить предпросмотр.')
      })
      .finally(() => {
        if (!cancelled) setIsGenerating(false)
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [open, legend, metadata, svgRef])

  const shareUrl = open
    ? `https://twitter.com/intent/tweet?text=${encodeURIComponent('Outpoll — сравнение торгового оборота Polymarket и Kalshi')}&url=${encodeURIComponent(window.location.href)}`
    : undefined

  async function exportChart(format: (typeof downloads)[number]['value']) {
    if (format !== 'csv' && (!preview || isGenerating)) return
    setError(null)
    setPendingFormat(format)
    try {
      if (format === 'csv') {
        downloadChartFile(
          new Blob([csvText], {
            type: 'text/csv;charset=utf-8',
          }),
          `${filename}.csv`,
        )
        return
      }
      if (!preview) return
      downloadChartFile(
        format === 'png' ? await chartSvgToPng(preview.svg) : preview.svg.blob,
        `${filename}.${format}`,
      )
    } catch {
      setError('Не удалось экспортировать. Попробуйте ещё раз.')
    } finally {
      setPendingFormat(null)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
    >
      <DialogTrigger
        disabled={disabled || pendingFormat !== null}
        render={
          <Button
            variant="ghost"
            size="icon"
            data-icon-motion="export"
            aria-label="Export"
            className="size-9 shrink-0 rounded-full text-muted-foreground sm:size-8"
          />
        }
      >
        {pendingFormat ? (
          <Spinner aria-hidden="true" />
        ) : (
          <FileDown data-motion-icon aria-hidden="true" />
        )}
      </DialogTrigger>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[min(80rem,calc(100vw-2rem))]"
        aria-label="Экспорт графика"
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Export</DialogTitle>
        </DialogHeader>
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-2">
            <Button
              variant="outline"
              className="w-full"
              render={<a href={shareUrl} target="_blank" rel="noopener noreferrer" />}
            >
              <XLogo data-icon="inline-start" />
              Поделиться в X
            </Button>
            {downloads.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant="outline"
                className="w-full"
                disabled={pendingFormat !== null || (value !== 'csv' && (isGenerating || !preview))}
                onClick={() => {
                  void exportChart(value)
                }}
              >
                {pendingFormat === value ? (
                  <Spinner
                    data-icon="inline-start"
                    aria-hidden="true"
                  />
                ) : (
                  <Icon
                    data-icon="inline-start"
                    aria-hidden="true"
                  />
                )}
                {label}
              </Button>
            ))}
            {error && (
              <p
                role="alert"
                className="text-xs text-destructive"
              >
                {error}
              </p>
            )}
          </div>
          <div className="flex min-w-0 items-center justify-center">
            {isGenerating ? (
              <Spinner aria-label="Готовим предпросмотр" />
            ) : preview ? (
              <img
                src={preview.url}
                alt="Предпросмотр экспорта графика"
                className="h-auto w-full rounded-lg ring-1 ring-foreground/10"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Предпросмотр недоступен
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function XLogo(props: ComponentProps<'svg'>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}
