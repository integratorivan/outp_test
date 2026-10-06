import { useEffect, useId, useState } from 'react'

import { Card, CardContent } from '../../../shared/ui/card'
import { Spinner } from '../../../shared/ui/spinner'

const wave =
  'M0 150 C40 150 48 122 82 122 S128 182 168 182 S212 68 252 68 S304 146 346 146 S402 106 446 106 C488 106 490 150 530 150 C570 150 578 122 612 122 S658 182 698 182 S742 68 782 68 S834 146 876 146 S932 106 976 106 C1018 106 1020 150 1060 150'

const loadingPhases = [
  { message: 'Грузим данные с Polymarket', afterMs: 0 },
  { message: 'Грузим Kalshi', afterMs: 1600 },
  { message: 'Собираем категории', afterMs: 3200 },
  { message: 'Считаем доли платформ', afterMs: 4800 },
  { message: 'Рисуем линии графика', afterMs: 6400 },
  { message: 'Делаем расчеты', afterMs: 8000 },
  { message: 'Наводим красоту', afterMs: 9600 },
] as const

type LoadingMessage = (typeof loadingPhases)[number]['message']

export function ChartLoading() {
  const gradientId = useId()
  const [message, setMessage] = useState<LoadingMessage>(loadingPhases[0].message)

  useEffect(() => {
    // Presentation phases of initial loading, independent of backend progress.
    const timers = loadingPhases.slice(1).map((phase) =>
      window.setTimeout(() => setMessage(phase.message), phase.afterMs),
    )

    return () => {
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [])

  return (
    <div
      className="relative grid h-[280px] min-w-0 place-items-center overflow-hidden rounded-control min-[480px]:h-[336px] min-[900px]:h-[420px]"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label="Загрузка графика торгового оборота"
    >
      <div
        className="chart-loading-visual absolute inset-x-0 top-4 bottom-10 text-subtle opacity-50"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 530 280"
          preserveAspectRatio="none"
          className="block size-full overflow-hidden"
        >
          <defs>
            <linearGradient
              id={gradientId}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor="currentColor"
                stopOpacity="0.08"
              />
              <stop
                offset="100%"
                stopColor="currentColor"
                stopOpacity="0"
              />
            </linearGradient>
          </defs>
          <g className="chart-loading-track">
            <path
              d={`${wave} V280 H0 Z`}
              fill={`url(#${gradientId})`}
            />
            <path
              d={wave}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        </svg>
      </div>
      <Card className="relative w-fit max-w-[calc(100%_-_2rem)] gap-0 py-0">
        <CardContent className="flex min-w-0 items-center gap-3 py-3">
          <Spinner
            className="shrink-0"
            aria-hidden="true"
          />
          <p className="text-muted-foreground">{message}</p>
        </CardContent>
      </Card>
    </div>
  )
}
