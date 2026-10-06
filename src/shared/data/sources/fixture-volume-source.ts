import { volumeSnapshotSchema, type Platform } from '../../../entities/volume/model'
import type { VolumeDataSource } from '../volume-data-source'

export class FixtureVolumeDataSource implements VolumeDataSource {
  readonly mode = 'fixture'

  queryId() {
    return null
  }

  async load(platform: Platform, signal: AbortSignal) {
    signal.throwIfAborted()
    const module = platform === 'kalshi'
      ? await import('../fixtures/kalshi-volume.json')
      : await import('../fixtures/polymarket-volume.json')
    signal.throwIfAborted()
    const snapshot = volumeSnapshotSchema.parse(module.default)
    if (snapshot.platform !== platform) throw new Error('Fixture platform does not match its source')
    return snapshot
  }
}
