import { afterEach, describe, expect, it, vi } from 'vitest'

import { daySchema } from '../../entities/volume/model'
import {
  analysisContextSchema,
  analysisSystemPrompt,
  buildAnalysisPrompt,
  buildCategoryAnalysisContext,
  buildDefaultAnalysisQuestion,
  buildPlatformAnalysisContext,
  type AnalysisRecord,
} from './model'
import { askChartAnalysis } from './service'
import { analysisStorageKey, latestAnalysisRecord, readAnalysisHistory, saveAnalysisRecord } from './storage'

const day = daySchema.parse('2026-09-28')
const endDay = daySchema.parse('2026-10-04')
const context = buildPlatformAnalysisContext({
  point: { day, endDay, kalshi: 123.45, polymarket: null },
  previous: undefined,
  categories: ['politics'],
  platforms: ['kalshi', 'polymarket'],
  granularity: 'week',
})
const record: AnalysisRecord = {
  id: 'test-answer',
  createdAt: '2026-10-05T00:00:00.000Z',
  model: 'perplexity/sonar',
  context,
  question: 'Что произошло?',
  answer: 'Подтверждённых источников нет.',
  sources: [],
}

function memoryStorage() {
  const entries = new Map<string, string>()
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value)
    },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('chart analysis context', () => {
  it('preserves exact amounts, week boundaries, filters and missing data', () => {
    expect(analysisContextSchema.parse(context)).toEqual(context)
    expect(context.series).toEqual([
      { label: 'Kalshi', usd: 123.45 },
      { label: 'Polymarket', usd: null },
    ])
    expect(context.previous).toBeNull()
    const prompt = buildAnalysisPrompt(context, 'Что произошло?')
    expect(prompt).toContain('2026-09-28')
    expect(prompt).toContain('2026-10-04')
    expect(prompt).toContain('123.45')
    expect(prompt).toContain('null означает')
    expect(analysisSystemPrompt).toContain('Не пересказывай обороты')
    expect(analysisSystemPrompt).toContain('3–5 предложениях')
    expect(analysisSystemPrompt).toContain('доказанную причину')
    expect(analysisSystemPrompt.length).toBeLessThan(650)
    const question = buildDefaultAnalysisQuestion(context)
    expect(question).toContain('28 сентября 2026 г.')
    expect(question).toContain('4 октября 2026 г.')
    expect(question).toContain('Kalshi и Polymarket')
    expect(question).toContain('Политика')
    expect(question).toContain('за неделю')
    expect(question).not.toContain('в эти даты')
  })

  it('excludes hidden platforms and supplies the previous point', () => {
    const result = buildPlatformAnalysisContext({
      point: { day, endDay: day, kalshi: 0, polymarket: 42 },
      previous: {
        day: daySchema.parse('2026-09-27'),
        endDay: daySchema.parse('2026-09-27'),
        kalshi: null,
        polymarket: 2,
      },
      categories: ['politics'],
      platforms: ['kalshi'],
      granularity: 'day',
    })
    expect(result.series).toEqual([{ label: 'Kalshi', usd: 0 }])
    expect(result.previous?.series).toEqual([{ label: 'Kalshi', usd: null }])
  })

  it('uses only selected category values and never fills missing data with zero', () => {
    const result = buildCategoryAnalysisContext({
      point: { day, endDay: day, total: null, values: { sports: 0, politics: 10 } },
      previous: undefined,
      categories: ['sports', 'crypto'],
      platforms: ['kalshi', 'polymarket'],
      granularity: 'day',
    })
    expect(result.series.map((entry) => entry.usd)).toEqual([null, 0, null])
    expect(result.view).toBe('categories')
    expect(result.series[0]?.label).toBe('Kalshi + Polymarket, всего')
  })

  it('labels category context with only the visible platform', () => {
    const result = buildCategoryAnalysisContext({
      point: { day, endDay: day, total: 10, values: { politics: 10 } },
      previous: { day, endDay: day, total: 2, values: { politics: 2 } },
      categories: ['politics'],
      platforms: ['polymarket'],
      granularity: 'day',
    })
    expect(result.series[0]).toEqual({ label: 'Polymarket, всего', usd: 10 })
    expect(result.previous?.series[0]).toEqual({ label: 'Polymarket, всего', usd: 2 })
  })
})

function streamResponse(chunks: readonly unknown[], done = true, fragmentSize = 11) {
  const text =
    ': OPENROUTER PROCESSING\n\n' +
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') +
    (done ? 'data: [DONE]\n\n' : '')
  const bytes = new TextEncoder().encode(text)
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let index = 0; index < bytes.length; index += fragmentSize)
        controller.enqueue(bytes.slice(index, index + fragmentSize))
      controller.close()
    },
  })
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
}

function textChunk(content: string, finishReason: string | null = null) {
  return { choices: [{ index: 0, delta: { content }, finish_reason: finishReason }] }
}

describe('OpenRouter Sonar boundary', () => {
  it('sends context to the local endpoint with cancellation and extracts sources without credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse(
        [
          textChunk('**Ответ** '),
          {
            choices: [
              {
                delta: {
                  content: '[1]',
                  annotations: [
                    { type: 'url_citation', url_citation: { url: 'https://example.com/news', title: 'Источник' } },
                  ],
                },
                finish_reason: 'stop',
              },
            ],
            citations: ['https://example.com/news'],
          },
          { ...textChunk('', 'stop'), usage: { completion_tokens: 10 } },
        ],
        true,
        1,
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const signal = new AbortController().signal
    const onProgress = vi.fn()
    const result = await askChartAnalysis({
      context,
      question: record.question,
      signal,
      onProgress,
    })
    const [url, options] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('/api/chart-analysis')
    expect(options.signal).toBe(signal)
    expect(options.headers.Authorization).toBeUndefined()
    expect(JSON.parse(options.body)).toEqual({ context, question: record.question })
    expect(options.body).toContain('123.45')
    expect(result.sources).toEqual([{ url: 'https://example.com/news', title: 'Источник' }])
    expect(result.answer).toBe('**Ответ** [1]')
    expect(onProgress.mock.calls[0]?.[0].answer).toBe('**Ответ** ')
    expect(onProgress.mock.calls.at(-1)?.[0].answer).toBe(result.answer)
    expect(JSON.stringify(result)).not.toContain('test-secret')
  })

  it('keeps citation numbering in the provider order, not annotation arrival order', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          streamResponse([
            {
              choices: [
                {
                  delta: {
                    content: 'Событие [1][2]',
                    annotations: [
                      { type: 'url_citation', url_citation: { url: 'https://second.com', title: 'Второй' } },
                    ],
                  },
                },
              ],
            },
            { ...textChunk('', 'stop'), citations: ['https://first.com', 'https://second.com'] },
          ]),
        ),
    )
    const result = await askChartAnalysis({
      context,
      question: record.question,
      signal: new AbortController().signal,
    })
    expect(result.sources).toEqual([
      { url: 'https://first.com', title: 'https://first.com' },
      { url: 'https://second.com', title: 'Второй' },
    ])
  })

  it('includes the previous answer and its sources for a follow-up, without exposing credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamResponse([textChunk('Уточнение', 'stop')]))
    vi.stubGlobal('fetch', fetchMock)
    await askChartAnalysis({
      context,
      question: 'Как развивалось событие?',
      previousResponse: {
        question: 'Что произошло?',
        answer: 'Предыдущее событие [1]',
        sources: [{ url: 'https://example.com', title: 'Источник' }],
      },
      signal: new AbortController().signal,
    })
    const request = JSON.parse(fetchMock.mock.calls[0]?.[1].body)
    expect(request.previousResponse.answer).toContain('Предыдущее событие')
    expect(request.previousResponse.sources[0].url).toBe('https://example.com')
    expect(JSON.stringify(request)).not.toContain('secret-key')
  })

  it('rejects cancellation between streamed fragments', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(streamResponse([textChunk('Часть'), textChunk(' ответа', 'stop')])),
    )
    const controller = new AbortController()
    await expect(
      askChartAnalysis({
        context,
        question: record.question,
        signal: controller.signal,
        onProgress: () => controller.abort(),
      }),
    ).rejects.toThrow()
  })

  it.each([
    [401, 'не принял серверный ключ'],
    [402, 'недостаточно средств'],
    [429, 'Лимит'],
    [500, 'provider failed'],
  ])('reports HTTP %s errors', async (status, message) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'provider failed' } }), { status })),
    )
    await expect(
      askChartAnalysis({ context, question: record.question, signal: new AbortController().signal }),
    ).rejects.toThrow(message)
  })

  it.each([
    { choices: [] },
    textChunk('  ', 'stop'),
    { ...textChunk('Ответ', 'stop'), citations: ['javascript:alert(1)'] },
    textChunk('Неполный ответ', 'length'),
    { error: { message: 'provider failed' } },
    { choices: [{ delta: { content: 42 } }] },
  ])('rejects malformed, unsafe or incomplete responses', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([body])))
    await expect(
      askChartAnalysis({ context, question: record.question, signal: new AbortController().signal }),
    ).rejects.toThrow()
  })

  it('does not accept a response after cancellation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([textChunk('Ответ', 'stop')])))
    const controller = new AbortController()
    controller.abort()
    await expect(
      askChartAnalysis({ context, question: record.question, signal: controller.signal }),
    ).rejects.toThrow()
  })

  it('rejects a connection ending before DONE even after a stop frame', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([textChunk('Неполный ответ', 'stop')], false)))
    await expect(
      askChartAnalysis({ context, question: record.question, signal: new AbortController().signal }),
    ).rejects.toThrow('не завершён')
  })

  it('rejects malformed JSON in an SSE event', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('data: {broken}\n\n', { headers: { 'Content-Type': 'text/event-stream' } })),
    )
    await expect(
      askChartAnalysis({ context, question: record.question, signal: new AbortController().signal }),
    ).rejects.toThrow('некорректный фрагмент')
  })

  it('surfaces mid-stream errors without accepting the partial answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          streamResponse([
            textChunk('Часть ответа'),
            { error: { message: 'provider disconnected' }, ...textChunk('', 'error') },
          ]),
        ),
    )
    const onProgress = vi.fn()
    await expect(
      askChartAnalysis({
        context,
        question: record.question,
        signal: new AbortController().signal,
        onProgress,
      }),
    ).rejects.toThrow('provider disconnected')
    expect(onProgress).toHaveBeenCalledTimes(1)
  })
})

describe('local analysis archive', () => {
  it('appends complete records and restores the latest matching context', () => {
    const storage = memoryStorage()
    expect(readAnalysisHistory(storage)).toEqual([])
    saveAnalysisRecord(storage, record)
    saveAnalysisRecord(storage, { ...record, id: 'second', question: 'Другой вопрос' })
    const records = readAnalysisHistory(storage)
    expect(records).toHaveLength(2)
    expect(latestAnalysisRecord(records, context)?.id).toBe('second')
    expect(latestAnalysisRecord(records, { ...context, categories: ['sports'] })).toBeUndefined()
    expect(latestAnalysisRecord(records, { ...context, series: [{ label: 'Kalshi', usd: 999 }] })).toBeUndefined()
  })

  it('does not overwrite corrupt archives', () => {
    const storage = memoryStorage()
    storage.setItem(analysisStorageKey, '{broken')
    expect(() => saveAnalysisRecord(storage, record)).toThrow('повреждены')
    expect(storage.getItem(analysisStorageKey)).toBe('{broken')
  })

  it('validates persisted records and strips fields outside the archive contract', () => {
    const storage = memoryStorage()
    const withSecret = { ...record, apiKey: 'secret' }
    saveAnalysisRecord(storage, withSecret)
    expect(storage.getItem(analysisStorageKey)).not.toContain('secret')
    storage.setItem(
      analysisStorageKey,
      JSON.stringify({ version: 1, conversations: [{ ...record, context: { ...context, startDay: 'bad-date' } }] }),
    )
    expect(() => readAnalysisHistory(storage)).toThrow('повреждены')
  })

  it('surfaces quota errors rather than claiming persistence', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(() => saveAnalysisRecord(storage, record)).toThrow('QuotaExceededError')
  })
})
