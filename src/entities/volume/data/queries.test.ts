import 'fake-indexeddb/auto'

import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiBaseUrlSchema } from '../../../shared/api/base-url'
import { DuneVolumeDataSource } from '../../../shared/data/sources/dune-volume-source'
import { FixtureVolumeDataSource } from '../../../shared/data/sources/fixture-volume-source'
import { readVolumeSnapshot, writeVolumeSnapshot } from '../../../shared/storage/volume-cache'
import { volumeCacheConfig } from './cache-config'
import { volumeSnapshotSchema } from '../model'
import { restoreVolumeSnapshot, volumeSnapshotQuery } from './queries'
import { VolumeRepository } from './repository'

function duneRepository(queryId: number) {
  return new VolumeRepository(new DuneVolumeDataSource({
    dataMode: 'dune', duneBaseUrl: apiBaseUrlSchema.parse('https://api.dune.com/api/v1'),
    duneApiKey: 'test-key', queryIds: { kalshi: 1000 + queryId, polymarket: queryId },
  }))
}

function snapshot(queryId: number, downloadedAt = Date.now()) {
  return volumeSnapshotSchema.parse({
    platform: 'polymarket', queryId, executionId: 'cached',
    calculatedAt: '2026-09-29T00:00:00Z', downloadedAt, rows: [],
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('snapshot sources and TanStack Query', () => {
  it('restores fresh data with its original freshness and avoids a fetch', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const repository = duneRepository(456)
    const saved = snapshot(456)
    try {
      await writeVolumeSnapshot(saved)
      await restoreVolumeSnapshot(client, repository, 'polymarket')
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      expect(await client.fetchQuery(volumeSnapshotQuery(repository, 'polymarket'))).toEqual(saved)
      expect(client.getQueryState(repository.key('polymarket'))?.dataUpdatedAt).toBe(saved.downloadedAt)
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      client.clear()
    }
  })

  it('deduplicates downloads and persists a complete snapshot', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const repository = duneRepository(457)
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      query_id: 457, execution_id: 'new', state: 'QUERY_STATE_COMPLETED',
      execution_ended_at: '2026-09-29T00:00:00Z',
      result: { rows: [], metadata: { row_count: 0, total_row_count: 0 } },
    })))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const options = volumeSnapshotQuery(repository, 'polymarket')
      const [first, second] = await Promise.all([client.fetchQuery(options), client.fetchQuery(options)])
      expect(first).toEqual(second)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(await readVolumeSnapshot('polymarket', 457)).toEqual(first)
    } finally {
      client.clear()
    }
  })

  it('keeps cached data visible during an expired refresh and its error, without fixture fallback', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const repository = duneRepository(458)
    const saved = snapshot(458, Date.now() - 2 * volumeCacheConfig.staleTimeMs)
    const fixtureLoad = vi.spyOn(FixtureVolumeDataSource.prototype, 'load')
    const fetchMock = vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)
    let unsubscribe = () => {}
    try {
      await writeVolumeSnapshot(saved)
      await restoreVolumeSnapshot(client, repository, 'polymarket')
      const observer = new QueryObserver(client, volumeSnapshotQuery(repository, 'polymarket'))
      unsubscribe = observer.subscribe(() => {})
      expect(observer.getCurrentResult().data).toEqual(saved)
      expect(observer.getCurrentResult().isFetching).toBe(true)
      await vi.waitFor(() => expect(observer.getCurrentResult().isError).toBe(true))
      expect(observer.getCurrentResult().data).toEqual(saved)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fixtureLoad).not.toHaveBeenCalled()
      expect(await readVolumeSnapshot('polymarket', 458)).toEqual(saved)
    } finally {
      unsubscribe()
      client.clear()
    }
  })

  it('keeps the last persisted snapshot when a refresh is incomplete', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const repository = duneRepository(459)
    const saved = snapshot(459)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      query_id: 459, execution_id: 'incomplete', state: 'QUERY_STATE_COMPLETED',
      execution_ended_at: '2026-09-30T00:00:00Z',
      result: { rows: [], metadata: { row_count: 0, total_row_count: 1 } },
    }))))
    try {
      await writeVolumeSnapshot(saved)
      await expect(client.fetchQuery(volumeSnapshotQuery(repository, 'polymarket'))).rejects.toThrow('incomplete')
      expect(await readVolumeSnapshot('polymarket', 459)).toEqual(saved)
    } finally {
      client.clear()
    }
  })

  it('does not restore snapshots older than seven days', async () => {
    const client = new QueryClient()
    const repository = duneRepository(460)
    try {
      await writeVolumeSnapshot(snapshot(460, Date.now() - volumeCacheConfig.maxAgeMs - 1))
      await restoreVolumeSnapshot(client, repository, 'polymarket')
      expect(client.getQueryData(repository.key('polymarket'))).toBeUndefined()
    } finally {
      client.clear()
    }
  })

  it('loads real fixtures lazily without network requests or IndexedDB', async () => {
    const client = new QueryClient()
    const repository = new VolumeRepository(new FixtureVolumeDataSource())
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const open = vi.spyOn(indexedDB, 'open')
    try {
      await restoreVolumeSnapshot(client, repository, 'kalshi')
      const result = await client.fetchQuery(volumeSnapshotQuery(repository, 'kalshi'))
      expect(result.platform).toBe('kalshi')
      expect(result.executionId).not.toBe('fixture')
      expect(result.rows.length).toBeGreaterThan(0)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(open).not.toHaveBeenCalled()
      expect(repository.key('kalshi')).not.toEqual(duneRepository(result.queryId).key('kalshi'))
    } finally {
      client.clear()
    }
  })

  it('honors cancellation before importing a fixture', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(new FixtureVolumeDataSource().load('kalshi', controller.signal)).rejects.toThrow()
  })
})
