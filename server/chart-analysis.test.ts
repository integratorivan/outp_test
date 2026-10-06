import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { analysisSystemPrompt } from '../src/features/chart-analysis/model'
import { handleChartAnalysis } from './chart-analysis'

const httpFetch = globalThis.fetch
const servers: Server[] = []
const payload = {
  context: {
    startDay: '2024-11-04',
    endDay: '2024-11-10',
    view: 'platforms',
    granularity: 'week',
    categories: ['politics'],
    series: [{ label: 'Kalshi', usd: 123.45 }],
    previous: null,
  },
  question: 'Что произошло?',
}

async function endpoint(key = 'server-only-test-key') {
  const server = createServer((request, response) => {
    void handleChartAnalysis(request, response, key).catch(() => response.destroy())
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Server did not bind a TCP port')
  return `http://127.0.0.1:${address.port}/api/chart-analysis`
}

function post(url: string, body: unknown = payload, headers: Record<string, string> = {}) {
  return httpFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.closeAllConnections()
    server.close(() => resolve())
  })))
  vi.unstubAllGlobals()
})

describe('server-side chart analysis', () => {
  it('keeps credentials on the server, constructs the Sonar prompt and forwards SSE unchanged', async () => {
    const sse = 'data: {"choices":[{"delta":{"content":"Событие [1]"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'
    const upstreamFetch = vi.fn().mockResolvedValue(new Response(sse, {
      headers: { 'Content-Type': 'text/event-stream' },
    }))
    vi.stubGlobal('fetch', upstreamFetch)
    const response = await post(await endpoint(), {
      ...payload,
      previousResponse: {
        question: 'Первый вопрос',
        answer: 'Первый ответ',
        sources: [{ url: 'https://example.com', title: 'Источник' }],
      },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(response.headers.get('x-accel-buffering')).toBe('no')
    expect(await response.text()).toBe(sse)
    const [url, options] = upstreamFetch.mock.calls[0] ?? []
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(options.headers.Authorization).toBe('Bearer server-only-test-key')
    const body = JSON.parse(options.body)
    expect(body).toMatchObject({ model: 'perplexity/sonar', stream: true, max_tokens: 700 })
    expect(body.messages[0]).toEqual({ role: 'system', content: analysisSystemPrompt })
    expect(body.messages[1]).toMatchObject({ role: 'user' })
    expect(body.messages[1].content).toContain('Первый вопрос')
    expect(body.messages[2]).toMatchObject({ role: 'assistant' })
    expect(body.messages[2].content).toContain('Первый ответ')
    expect(body.messages[2].content).toContain('https://example.com')
    expect(body.messages[3].content).toContain('123.45')
    expect(body.messages[3].content).toContain('2024-11-04')
    expect(body.messages[3].content).toContain('Уточняющий вопрос')
    expect(options.body).not.toContain('server-only-test-key')
  })

  it('reports a missing environment key without contacting OpenRouter', async () => {
    const upstreamFetch = vi.fn()
    vi.stubGlobal('fetch', upstreamFetch)
    const response = await post(await endpoint(''))
    expect(response.status).toBe(503)
    expect(await response.text()).toContain('не настроен на сервере')
    expect(upstreamFetch).not.toHaveBeenCalled()
  })

  it('explains when only VITE_OPENROUTER_API_KEY is configured', async () => {
    const upstreamFetch = vi.fn()
    vi.stubGlobal('fetch', upstreamFetch)
    const server = createServer((request, response) => {
      void handleChartAnalysis(request, response, '', true).catch(() => response.destroy())
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Server did not bind a TCP port')
    const url = `http://127.0.0.1:${address.port}/api/chart-analysis`
    const response = await post(url)
    expect(response.status).toBe(503)
    expect(await response.text()).toContain('VITE_OPENROUTER_API_KEY')
    expect(upstreamFetch).not.toHaveBeenCalled()
  })

  it.each([
    { ...payload, question: '' },
    { ...payload, question: 'x'.repeat(2001) },
    { ...payload, model: 'expensive-model' },
    { ...payload, apiKey: 'browser-key' },
    { ...payload, context: { ...payload.context, startDay: 'bad-date' } },
    {
      ...payload,
      previousResponse: {
        question: 'Первый вопрос',
        answer: 'Ответ',
        sources: [{ url: 'javascript:alert(1)', title: 'Bad' }],
      },
    },
  ])('rejects invalid input or client credential/model overrides before a paid request', async (body) => {
    const upstreamFetch = vi.fn()
    vi.stubGlobal('fetch', upstreamFetch)
    const response = await post(await endpoint(), body)
    expect(response.status).toBe(400)
    expect(upstreamFetch).not.toHaveBeenCalled()
  })

  it('rejects oversized requests', async () => {
    const upstreamFetch = vi.fn()
    vi.stubGlobal('fetch', upstreamFetch)
    const response = await post(await endpoint(), { ...payload, question: 'x'.repeat(70_000) })
    expect(response.status).toBe(413)
    expect(upstreamFetch).not.toHaveBeenCalled()
  })

  it('rejects cross-origin requests, non-JSON input and non-POST methods', async () => {
    const url = await endpoint()
    expect((await post(url, payload, { Origin: 'https://another-site.example' })).status).toBe(403)
    expect((await post(url, payload, { 'Content-Type': 'text/plain' })).status).toBe(415)
    expect((await httpFetch(url)).status).toBe(405)
    expect((await httpFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' })).status).toBe(400)
  })

  it.each([
    [401, 'OpenRouter не принял ключ'],
    [402, 'OpenRouter не смог выполнить запрос'],
    [429, 'OpenRouter не смог выполнить запрос'],
    [500, 'OpenRouter не смог выполнить запрос'],
  ])('preserves HTTP %s status without forwarding secret-bearing provider diagnostics', async (status, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('server-only-test-key', { status })))
    const response = await post(await endpoint())
    expect(response.status).toBe(status)
    const text = await response.text()
    expect(text).not.toContain('server-only-test-key')
    expect(text).toContain(message)
  })

  it('aborts the upstream request when the browser disconnects during streaming', async () => {
    let upstreamSignal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => {
      const signal = options.signal
      if (!(signal instanceof AbortSignal)) throw new Error('Missing upstream cancellation signal')
      upstreamSignal = signal
      return Promise.resolve(new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"choices":[]}\n\n'))
          signal.addEventListener('abort', () => controller.error(new Error('Aborted')), { once: true })
        },
      }), { headers: { 'Content-Type': 'text/event-stream' } }))
    }))
    const controller = new AbortController()
    const response = await httpFetch(await endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const reader = response.body?.getReader()
    expect((await reader?.read())?.value).toBeDefined()
    controller.abort()
    await vi.waitFor(() => expect(upstreamSignal?.aborted).toBe(true))
  })
})
