import { BotAvatar } from 'bot-avatars'
import { Minus, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

import { formatPeriod } from '../../entities/volume/lib/format'
import { Alert, AlertDescription } from '../../shared/ui/alert'
import { Button } from '../../shared/ui/button'
import { ScrollArea } from '../../shared/ui/scroll-area'
import { AnalysisLoading } from './analysis-loading'
import { AnalysisResponse } from './analysis-response'
import { buildDefaultAnalysisQuestion, type AnalysisContext } from './model'
import { useChartAnalysis } from './use-chart-analysis'

const botType = 'clover' as const
const botSeed = 0.42
const ease = [0.22, 1, 0.36, 1] as const

type ChartAnalysisPanelProps = {
  context: AnalysisContext
  onClose: () => void
}

export default function ChartAnalysisPanel({ context, onClose }: ChartAnalysisPanelProps) {
  const reduceMotion = useReducedMotion()
  const [expanded, setExpanded] = useState(false)
  const [hovered, setHovered] = useState(false)
  const autoStarted = useRef(false)
  const { mutation, draft, result, cancel } = useChartAnalysis(context)
  const busy = mutation.isPending
  const record = mutation.isPending || mutation.isError ? undefined : result.record
  const response = busy
    ? draft
    : record
      ? { answer: record.answer, sources: record.sources }
      : mutation.isError && draft?.answer
        ? draft
        : undefined
  const thinking = busy && !response?.answer
  const writing = busy && Boolean(response?.answer)
  const mutationErrorMessage =
    mutation.error instanceof Error && mutation.error.name !== 'AbortError'
      ? mutation.error.message
      : mutation.isError
        ? 'Запрос отменён или соединение недоступно.'
        : null

  function ask() {
    mutation.mutate({ question: buildDefaultAnalysisQuestion(context) })
  }

  useEffect(() => {
    if (!expanded || autoStarted.current) return
    autoStarted.current = true
    if (result.record) return
    mutation.mutate({ question: buildDefaultAnalysisQuestion(context) })
  }, [expanded, context, mutation, result.record])

  function collapse() {
    setExpanded(false)
  }

  function dismiss() {
    cancel()
    onClose()
  }

  return (
    <div data-chart-analysis-popup="" className="pointer-events-none fixed right-4 bottom-4 z-50">
      <AnimatePresence mode="wait" initial={false}>
        {!expanded ? (
          <motion.button
            key="launcher"
            type="button"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.88, y: 10 }}
            animate={{ opacity: 1, scale: hovered && !reduceMotion ? 1.08 : 1, y: hovered && !reduceMotion ? -2 : 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 6 }}
            transition={{ duration: reduceMotion ? 0 : 0.28, ease }}
            className="pointer-events-auto flex size-20 items-center justify-center overflow-visible border-0 bg-transparent p-0 shadow-none outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Открыть AI-анализ за ${formatPeriod(context.startDay, context.endDay)}`}
            aria-expanded={false}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={() => setExpanded(true)}
          >
            <BotAvatar
              type={botType}
              size={64}
              state={hovered ? 'working' : 'default'}
              seed={botSeed}
              interactive
            />
          </motion.button>
        ) : (
          <motion.aside
            key="panel"
            role="dialog"
            aria-label="AI-анализ точки графика"
            aria-expanded={true}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.94, y: 18, transition: { duration: 0.36, ease } }
            }
            transition={{ duration: reduceMotion ? 0 : 0.32, ease }}
            className="pointer-events-auto flex h-[min(28rem,calc(100dvh-2rem))] w-[min(22rem,calc(100vw-2rem))] min-w-0 origin-bottom-right flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-overlay"
          >
            <header className="flex shrink-0 items-center justify-between gap-2 px-4 pt-3 pb-1">
              <p className="truncate font-mono text-xs text-muted-foreground tabular-nums">
                {formatPeriod(context.startDay, context.endDay)}
              </p>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button variant="ghost" size="icon-sm" onClick={collapse} aria-label="Свернуть в иконку бота">
                  <Minus />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={dismiss} aria-label="Закрыть AI-анализ">
                  <X />
                </Button>
              </div>
            </header>

            <ScrollArea className="min-h-0 flex-1" role="region" aria-label="Содержимое AI-анализа">
              <div className="flex min-w-0 flex-col gap-4 px-4 py-4">
                {thinking && (
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 shrink-0" aria-hidden="true">
                      <BotAvatar type={botType} size={32} state="working" seed={botSeed} interactive={false} />
                    </span>
                    <div className="min-w-0 flex-1 pt-1">
                      <AnalysisLoading writing={false} />
                    </div>
                  </div>
                )}

                {response?.answer && (
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 shrink-0" aria-hidden="true">
                      <BotAvatar
                        type={botType}
                        size={32}
                        state={writing ? 'working' : 'default'}
                        seed={botSeed}
                        interactive={false}
                      />
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <AnalysisResponse
                        key={busy ? `stream-${mutation.submittedAt}` : (record?.id ?? 'draft')}
                        response={response}
                        complete={Boolean(record) && !busy}
                        streaming={busy}
                        animate={busy || mutation.isSuccess}
                        canRetry={!busy}
                        onRetry={ask}
                      />
                      {mutation.isError && draft?.answer && (
                        <p className="mt-2 text-xs text-muted-foreground">Неполный ответ · не сохранён</p>
                      )}
                    </div>
                  </div>
                )}

                {mutationErrorMessage && (
                  <Alert variant="destructive">
                    <AlertDescription>{mutationErrorMessage}</AlertDescription>
                  </Alert>
                )}

                {!busy && result.warning && (
                  <Alert>
                    <AlertDescription>{result.warning}</AlertDescription>
                  </Alert>
                )}

                {mutation.isError && !draft?.answer && !mutationErrorMessage && (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-muted-foreground">Не удалось найти событие для этого периода.</p>
                    <Button variant="outline" size="sm" className="self-start" onClick={ask}>
                      Повторить
                    </Button>
                  </div>
                )}
                {mutation.isError && !draft?.answer && mutationErrorMessage && (
                  <Button variant="outline" size="sm" className="self-start" onClick={ask}>
                    Повторить
                  </Button>
                )}
              </div>
            </ScrollArea>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  )
}
