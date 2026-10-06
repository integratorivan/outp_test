import type { VolumeDataSource } from '../../../shared/data/volume-data-source'
import { readVolumeSnapshot, writeVolumeSnapshot } from '../../../shared/storage/volume-cache'
import { volumeCacheConfig } from './cache-config'
import type { Platform } from '../model'

export class VolumeRepository {
  constructor(private readonly source: VolumeDataSource) {}

  get mode() {
    return this.source.mode
  }

  key(platform: Platform) {
    return ['volume', 'snapshot', this.source.mode, platform, this.source.queryId(platform)] as const
  }

  async load(platform: Platform, signal: AbortSignal) {
    const snapshot = await this.source.load(platform, signal)
    signal.throwIfAborted()
    if (this.source.mode === 'dune') await writeVolumeSnapshot(snapshot)
    return snapshot
  }

  async readCached(platform: Platform) {
    const queryId = this.source.queryId(platform)
    if (this.source.mode !== 'dune' || queryId === null) return undefined
    const snapshot = await readVolumeSnapshot(platform, queryId)
    return snapshot && Date.now() - snapshot.downloadedAt < volumeCacheConfig.maxAgeMs
      ? snapshot
      : undefined
  }
}
