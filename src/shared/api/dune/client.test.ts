import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiBaseUrlSchema } from '../base-url'
import { fetchDuneVolumeSnapshot } from './client'
import { DuneApiService } from './service'
import type { DuneResultDto, DuneVolumeRowDto } from './types'

const row = { day: '2026-09-28 00:00:00', category: 'sports', volume_usd: '10.5' }
const source = {
  platform: 'kalshi', queryId: 123,
  service: new DuneApiService({
    baseUrl: apiBaseUrlSchema.parse('https://dune.test/custom/api'), apiKey: 'test-key',
  }),
} as const

function page(rows: DuneVolumeRowDto[], overrides: Partial<DuneResultDto> = {}) {
  return {
    query_id: 123, execution_id: 'fixed-execution', state: 'QUERY_STATE_COMPLETED',
    execution_ended_at: '2026-09-29T00:00:00Z',
    result: { rows, metadata: { row_count: rows.length, total_row_count: rows.length } },
    ...overrides,
  }
}

const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 })
afterEach(() => vi.unstubAllGlobals())

describe('Dune snapshot download', () => {
  it('pins subsequent pages to the first execution and never follows arbitrary next_uri', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(page([row], {
        next_offset: 1, next_uri: 'https://untrusted.example/results',
        result: { rows: [row], metadata: { row_count: 1, total_row_count: 2 } },
      })))
      .mockResolvedValueOnce(response(page([{ ...row, day: '2026-09-29' }], {
        result: { rows: [{ ...row, day: '2026-09-29' }], metadata: { row_count: 1, total_row_count: 2 } },
      })))
    vi.stubGlobal('fetch', fetchMock)
    const signal = new AbortController().signal
    const snapshot = await fetchDuneVolumeSnapshot({ ...source, signal })
    expect(snapshot.rows).toHaveLength(2)
    expect(snapshot.rows[0]).toEqual({ day: '2026-09-28', platform: 'kalshi', sourceCategory: 'sports', volumeUsd: 10.5 })
    expect(snapshot.executionId).toBe('fixed-execution')
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/query/123/results?')
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/execution/fixed-execution/results?')
    expect(fetchMock.mock.calls[1]?.[0]).toContain('offset=1')
    expect(fetchMock.mock.calls[0]?.[0]).toContain('https://dune.test/custom/api/query/')
    const request = fetchMock.mock.calls[1]?.[1]
    expect(request.signal).toBe(signal)
    expect(request.headers.get('X-DUNE-API-KEY')).toBe('test-key')
    expect(request.redirect).toBe('error')
  })

  it.each([
    { state: 'QUERY_STATE_EXECUTING' },
    { query_id: 999 },
    { result: { rows: [row], metadata: { row_count: 1, total_row_count: 2 } } },
    { result: { rows: [row], metadata: { row_count: 2, total_row_count: 1 } } },
    { next_offset: 0 },
    { next_offset: 2 },
  ])('rejects non-completed, inconsistent, or truncated responses: %j', async (overrides) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(page([row], overrides))))
    await expect(fetchDuneVolumeSnapshot({ ...source, signal: new AbortController().signal })).rejects.toThrow()
  })

  it('rejects a different execution on the next page', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response(page([row], {
        next_offset: 1, result: { rows: [row], metadata: { row_count: 1, total_row_count: 2 } },
      })))
      .mockResolvedValueOnce(response(page([row], {
        execution_id: 'new-execution', result: { rows: [row], metadata: { row_count: 1, total_row_count: 2 } },
      }))))
    await expect(fetchDuneVolumeSnapshot({ ...source, signal: new AbortController().signal })).rejects.toThrow('changed execution')
  })

  it('accepts a complete empty result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(page([]))))
    expect((await fetchDuneVolumeSnapshot({ ...source, signal: new AbortController().signal })).rows).toEqual([])
  })

  it('surfaces HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('rate limit', { status: 429 })))
    await expect(fetchDuneVolumeSnapshot({ ...source, signal: new AbortController().signal })).rejects.toThrow('HTTP 429')
  })

  it('does not fetch or return a snapshot after cancellation', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn().mockImplementation(async () => {
      controller.abort()
      return response(page([row]))
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchDuneVolumeSnapshot({ ...source, signal: controller.signal })).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await expect(fetchDuneVolumeSnapshot({ ...source, signal: controller.signal })).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
