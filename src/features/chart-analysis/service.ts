import { EventSourceParserStream } from 'eventsource-parser/stream'
import { z } from 'zod'

import {
  sourceUrlSchema,
  type AnalysisContext,
  type AnalysisDraft,
  type AnalysisRecord,
  type PreviousTurn,
} from './model'

const annotationSchema = z.object({
  type: z.string(),
  url_citation: z.object({ url: sourceUrlSchema, title: z.string().optional() }).optional(),
})
const chunkSchema = z.object({
  choices: z.array(
    z.object({
      index: z.number().int().optional(),
      finish_reason: z.string().nullable().optional(),
      delta: z.object({ content: z.string().nullable().optional(), annotations: z.array(annotationSchema).optional() }),
    }),
  ),
  citations: z.array(sourceUrlSchema).optional(),
})
const errorSchema = z.object({ error: z.object({ message: z.string() }) })

function parseChunk(data: string) {
  let body: unknown
  try {
    body = JSON.parse(data)
  } catch {
    throw new Error('OpenRouter вернул некорректный фрагмент ответа.')
  }
  const error = errorSchema.safeParse(body)
  if (error.success) throw new Error(error.data.error.message)
  const parsed = chunkSchema.safeParse(body)
  if (!parsed.success) throw new Error('OpenRouter вернул ответ в неожиданном формате.')
  return parsed.data
}

export async function askChartAnalysis({
  context,
  question,
  previousResponse,
  signal,
  onProgress,
}: {
  context: AnalysisContext
  question: string
  previousResponse?: PreviousTurn
  signal: AbortSignal
  onProgress?: (draft: AnalysisDraft) => void
}): Promise<AnalysisRecord> {
  const response = await fetch('/api/chart-analysis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({ context, question, previousResponse }),
  })
  if (!response.ok || response.headers.get('content-type')?.includes('application/json')) {
    const body: unknown = await response.json()
    const error = errorSchema.safeParse(body)
    if (response.status === 401) throw new Error('OpenRouter не принял серверный ключ.')
    if (response.status === 402) throw new Error('На счёте OpenRouter недостаточно средств.')
    if (response.status === 429) throw new Error('Лимит OpenRouter достигнут. Попробуйте позже.')
    throw new Error(error.success ? error.data.error.message : `OpenRouter: HTTP ${response.status}`)
  }
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
    throw new Error('OpenRouter не вернул поток ответа.')
  }
  const reader = response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream())
    .getReader()
  let answer = ''
  let finished = false
  let done = false
  const sources = new Map<string, AnalysisRecord['sources'][number]>()
  let citationUrls: string[] = []
  const listSources = () =>
    citationUrls.length
      ? citationUrls.map((url) => ({ url, title: sources.get(url)?.title ?? url }))
      : [...sources.values()]
  try {
    while (true) {
      signal.throwIfAborted()
      const event = await reader.read()
      if (event.done) break
      if (event.value.data === '[DONE]') {
        done = true
        break
      }
      const chunk = parseChunk(event.value.data)
      const choice = chunk.choices.find((entry) => entry.index === undefined || entry.index === 0)
      if (choice?.finish_reason === 'length')
        throw new Error('Ответ Sonar превысил лимит длины. Уточните вопрос и попробуйте снова.')
      if (choice?.finish_reason === 'error') throw new Error('Sonar не смог завершить ответ. Попробуйте снова.')
      if (choice?.finish_reason === 'stop') finished = true
      answer += choice?.delta.content ?? ''
      if (chunk.citations) citationUrls = chunk.citations
      for (const annotation of choice?.delta.annotations ?? []) {
        if (annotation.type === 'url_citation' && annotation.url_citation) {
          const { url, title } = annotation.url_citation
          sources.set(url, { url, title: title ?? url })
        }
      }
      signal.throwIfAborted()
      onProgress?.({ answer, sources: listSources() })
    }
    signal.throwIfAborted()
    if (!done || !finished || !answer.trim()) throw new Error('Ответ Sonar не завершён. Попробуйте снова.')
    return {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      model: 'perplexity/sonar',
      context,
      question,
      answer: answer.trim(),
      sources: listSources(),
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
