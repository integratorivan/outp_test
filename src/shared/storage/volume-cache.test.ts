import 'fake-indexeddb/auto'

import { openDB } from 'idb'
import { describe, expect, it } from 'vitest'

import { volumeSnapshotSchema } from '../../entities/volume/model'
import { readVolumeSnapshot, writeVolumeSnapshot } from './volume-cache'

function snapshot(queryId: number) {
  return volumeSnapshotSchema.parse({
    platform: 'kalshi', queryId, executionId: 'execution',
    calculatedAt: '2026-09-29T00:00:00Z', downloadedAt: 100,
    rows: [{ day: '2026-09-28', platform: 'kalshi', sourceCategory: 'transportation', volumeUsd: 12 }],
  })
}

describe('IndexedDB volume snapshots', () => {
  it('stores source facts without derived categories and isolates platform/query keys', async () => {
    const stored = snapshot(1)
    await writeVolumeSnapshot(stored)
    expect(await readVolumeSnapshot('kalshi', 1)).toEqual(stored)
    expect(await readVolumeSnapshot('kalshi', 2)).toBeUndefined()
    expect(await readVolumeSnapshot('polymarket', 1)).toBeUndefined()
    expect((await readVolumeSnapshot('kalshi', 1))?.rows[0]).not.toHaveProperty('category')
  })

  it('does not overwrite a newer calculation with an older one', async () => {
    const newer = snapshot(3)
    await writeVolumeSnapshot(newer)
    await writeVolumeSnapshot({ ...newer, executionId: 'older', calculatedAt: '2026-09-28T00:00:00Z' })
    expect(await readVolumeSnapshot('kalshi', 3)).toEqual(newer)
  })

  it('rejects cross-platform rows before writing', async () => {
    const invalid = snapshot(4)
    invalid.rows = invalid.rows.map((row) => ({ ...row, platform: 'polymarket' }))
    await expect(writeVolumeSnapshot(invalid)).rejects.toThrow()
    expect(await readVolumeSnapshot('kalshi', 4)).toBeUndefined()
  })

  it('treats corrupted persisted records as cache misses', async () => {
    await writeVolumeSnapshot(snapshot(5))
    const db = await openDB('outpoll-volume', 1)
    await db.put('snapshots', { platform: 'kalshi', queryId: 5, rows: 'bad data' })
    db.close()
    expect(await readVolumeSnapshot('kalshi', 5)).toBeUndefined()
  })
})
