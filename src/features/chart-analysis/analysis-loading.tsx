import { useEffect, useState } from 'react'

const delays = [90, 180, 270, 0, 90, 180, 90, 180, 270]

export function formatAnalysisElapsed(milliseconds: number) {
  const seconds = milliseconds / 1000
  return seconds < 60 ? `${seconds.toFixed(1)}с` : `${Math.floor(seconds / 60)}м ${(seconds % 60).toFixed(1)}с`
}

export function AnalysisLoading({ writing }: { writing: boolean }) {
  const [startedAt] = useState(() => performance.now())
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setElapsed(performance.now() - startedAt), 100)
    return () => clearInterval(timer)
  }, [startedAt])

  return (
    <div role="status" className="flex items-center gap-3">
      <span aria-hidden="true" className="grid shrink-0 grid-cols-3 gap-0.5">
        {delays.map((delay, index) => (
          <span
            key={index}
            className="analysis-pixel size-1 rounded-[1px] bg-foreground"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      <span className="analysis-loading-label text-[13px] font-medium text-muted-foreground">
        {writing ? 'Пишем ответ' : 'Ищем событие'}
      </span>
      <span aria-hidden="true" className="font-mono text-xs text-muted-foreground tabular-nums">
        {formatAnalysisElapsed(elapsed)}
      </span>
    </div>
  )
}
