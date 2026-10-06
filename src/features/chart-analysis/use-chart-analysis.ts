import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import type { AnalysisContext, AnalysisDraft, PreviousTurn } from './model'
import { askChartAnalysis } from './service'
import { latestAnalysisRecord, readAnalysisHistory, saveAnalysisRecord } from './storage'

export function useChartAnalysis(context: AnalysisContext) {
  const controller = useRef<AbortController | null>(null)
  const [draft, setDraft] = useState<AnalysisDraft | undefined>()
  const [restored] = useState(() => {
    try {
      return { record: latestAnalysisRecord(readAnalysisHistory(localStorage), context), warning: null }
    } catch {
      return {
        record: undefined,
        warning:
          'Не удалось прочитать историю из localStorage. Новый ответ останется виден, даже если сохранение недоступно.',
      }
    }
  })
  useEffect(
    () => () => {
      controller.current?.abort()
    },
    [],
  )

  const mutation = useMutation({
    mutationKey: ['chart-analysis'],
    gcTime: 0,
    retry: false,
    mutationFn: async ({
      question,
      previousResponse,
    }: {
      question: string
      previousResponse?: PreviousTurn
    }) => {
      setDraft(undefined)
      const request = new AbortController()
      controller.current = request
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(90_000)])
      try {
        const record = await askChartAnalysis({
          question,
          context,
          previousResponse,
          signal,
          onProgress: setDraft,
        })
        signal.throwIfAborted()
        try {
          saveAnalysisRecord(localStorage, record)
          return { record, warning: null }
        } catch {
          return {
            record,
            warning:
              'Ответ получен, но не сохранён в localStorage. Хранилище недоступно, заполнено или история повреждена.',
          }
        }
      } catch (error) {
        if (signal.aborted && !request.signal.aborted)
          throw new Error('Sonar не ответил за 90 секунд. Попробуйте снова.')
        throw error
      } finally {
        controller.current = null
      }
    },
  })

  return { mutation, draft, result: mutation.data ?? restored, cancel: () => controller.current?.abort() }
}
