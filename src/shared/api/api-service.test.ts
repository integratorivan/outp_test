import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiService } from './api-service'
import { apiBaseUrlSchema } from './base-url'
import { HttpError } from './http-error'

const baseUrl = apiBaseUrlSchema.parse('https://example.test/api/v1/')
const api = new ApiService({ baseUrl, headers: { 'X-API-Key': 'test-key' } })

afterEach(() => vi.unstubAllGlobals())

describe('API transport', () => {
  it('joins the configured base path and encodes parameters without dropping zero or false', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"value":1}'))
    vi.stubGlobal('fetch', fetchMock)
    const signal = new AbortController().signal
    expect(await api.get('/results', {
      signal,
      query: { offset: 0, allow_partial_results: false, category: 'climate & weather', absent: undefined },
    })).toEqual({ value: 1 })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://example.test/api/v1/results?offset=0&allow_partial_results=false&category=climate+%26+weather')
    const options = fetchMock.mock.calls[0]?.[1]
    expect(options?.signal).toBe(signal)
    expect(options?.method).toBe('GET')
    expect(options?.credentials).toBe('omit')
    expect(options?.redirect).toBe('error')
    const headers = new Headers(options?.headers)
    expect(headers.get('Accept')).toBe('application/json')
    expect(headers.get('X-API-Key')).toBe('test-key')
  })

  it('does not append an empty query string', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    await api.get('/results', { signal: new AbortController().signal })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://example.test/api/v1/results')
  })

  it.each(['https://untrusted.test/results', '//untrusted.test/results', '/query/../results', '/results?api_key=other', '/results#fragment', '/\\untrusted.test'])('rejects endpoint escape %s before sending headers', async (path) => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    await expect(api.get(path, { signal: new AbortController().signal })).rejects.toThrow('configured base URL')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns a typed status error without leaking credentials or response contents', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('private error details', {
      status: 429, statusText: 'Too Many Requests',
    })))
    const error = await api.get('/results', { signal: new AbortController().signal }).catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(HttpError)
    if (!(error instanceof HttpError)) throw new Error('Expected HttpError')
    expect(error.status).toBe(429)
    expect(error.statusText).toBe('Too Many Requests')
    expect(error.message).toBe('HTTP 429 Too Many Requests')
    expect(error.message).not.toContain('test-key')
    expect(error.message).not.toContain('private')
  })

  it('does not start an already cancelled request', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    controller.abort()
    await expect(api.get('/results', { signal: controller.signal })).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('preserves network and abort failures without wrapping or retrying', async () => {
    const error = new DOMException('Aborted', 'AbortError')
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(error)
    vi.stubGlobal('fetch', fetchMock)
    await expect(api.get('/results', { signal: new AbortController().signal })).rejects.toBe(error)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid JSON rather than casting it to a DTO', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('invalid json')))
    await expect(api.get('/results', { signal: new AbortController().signal })).rejects.toBeInstanceOf(SyntaxError)
  })
})

describe('API base URL configuration', () => {
  it('normalizes a trailing slash while preserving a custom base path', () => {
    expect(baseUrl).toBe('https://example.test/api/v1')
    expect(apiBaseUrlSchema.parse('http://localhost:3000/proxy/')).toBe('http://localhost:3000/proxy')
  })

  it.each(['/api', 'ftp://example.test/api', 'https://user:password@example.test/api', 'https://example.test/api?key=value', 'https://example.test/api#fragment'])('rejects invalid base URL %s', (value) => {
    expect(apiBaseUrlSchema.safeParse(value).success).toBe(false)
  })
})
