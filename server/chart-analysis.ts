import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Plugin } from 'vite'

import { analysisRequestSchema, analysisSystemPrompt, buildAnalysisPrompt } from '../src/features/chart-analysis/model.ts'
import { resolveOpenRouterApiKey } from './openrouter-env.ts'

function sendError(response: ServerResponse, status: number, message: string) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify({ error: { message } }))
}

export async function handleChartAnalysis(
  request: IncomingMessage,
  response: ServerResponse,
  apiKey: string,
  misnamedOpenRouterKey = false,
) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    sendError(response, 405, 'Используйте POST для AI-анализа.')
    return
  }
  const origin = request.headers.origin
  if (origin && URL.parse(origin)?.host !== request.headers.host) {
    sendError(response, 403, 'Запрос должен быть отправлен с этой страницы.')
    return
  }
  if (!request.headers['content-type']?.startsWith('application/json')) {
    sendError(response, 415, 'Ожидается JSON с вопросом и контекстом графика.')
    return
  }
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > 65_536) {
      sendError(response, 413, 'Вопрос и контекст слишком велики.')
      return
    }
    chunks.push(bytes)
  }
  let body: unknown
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    sendError(response, 400, 'Некорректный JSON запроса.')
    return
  }
  const parsed = analysisRequestSchema.safeParse(body)
  if (!parsed.success) {
    sendError(response, 400, 'Некорректный вопрос или контекст графика.')
    return
  }
  if (!apiKey) {
    sendError(
      response,
      503,
      misnamedOpenRouterKey
        ? 'В .env указан VITE_OPENROUTER_API_KEY, а сервер читает только OPENROUTER_API_KEY (без префикса VITE_). Переименуйте переменную и перезапустите dev-сервер.'
        : 'AI-анализ пока не настроен на сервере. Добавьте OPENROUTER_API_KEY в .env и перезапустите dev-сервер.',
    )
    return
  }
  const { context, question, previousResponse } = parsed.data
  const controller = new AbortController()
  const disconnect = () => {
    if (!response.writableFinished) controller.abort()
  }
  response.on('close', disconnect)
  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost',
        'X-Title': 'Outpoll',
      },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(85_000)]),
      body: JSON.stringify({
        model: 'perplexity/sonar',
        stream: true,
        max_tokens: 700,
        messages: [
          { role: 'system', content: analysisSystemPrompt },
          ...(previousResponse
            ? [
                { role: 'user', content: buildAnalysisPrompt(context, previousResponse.question) },
                {
                  role: 'assistant',
                  content: `${previousResponse.answer}\nИсточники: ${JSON.stringify(previousResponse.sources)}`,
                },
              ]
            : []),
          { role: 'user', content: buildAnalysisPrompt(context, question, Boolean(previousResponse)) },
        ],
      }),
    })
    if (!upstream.ok) {
      sendError(
        response,
        upstream.status,
        upstream.status === 401
          ? 'OpenRouter не принял ключ. Проверьте OPENROUTER_API_KEY в .env, уберите устаревший export OPENROUTER_API_KEY в shell или IDE и полностью перезапустите dev-сервер.'
          : 'OpenRouter не смог выполнить запрос.',
      )
      return
    }
    if (!upstream.body || !upstream.headers.get('content-type')?.includes('text/event-stream')) {
      sendError(response, 502, 'OpenRouter не вернул поток ответа.')
      return
    }
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    })
    const reader = upstream.body.getReader()
    const chunks = (async function* () {
      try {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) return
          yield chunk.value
        }
      } finally {
        await reader.cancel().catch(() => {})
        reader.releaseLock()
      }
    })()
    await pipeline(Readable.from(chunks), response)
  } catch {
    if (response.destroyed) return
    if (response.headersSent) response.destroy()
    else sendError(response, 502, 'Соединение с OpenRouter прервано. Попробуйте снова.')
  } finally {
    response.off('close', disconnect)
    controller.abort()
  }
}

export function chartAnalysisPlugin(): Plugin {
  let apiKey = ''
  let misnamedOpenRouterKey = false
  const middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (request.url?.split('?')[0] !== '/api/chart-analysis') return next()
    void handleChartAnalysis(request, response, apiKey, misnamedOpenRouterKey).catch(() => {
      if (!response.destroyed && !response.headersSent) sendError(response, 400, 'Не удалось прочитать запрос.')
    })
  }
  return {
    name: 'chart-analysis-api',
    configResolved(config) {
      ;({ apiKey, misnamedOpenRouterKey } = resolveOpenRouterApiKey(
        config.mode,
        typeof config.envDir === 'string' ? config.envDir : config.root,
      ))
    },
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
