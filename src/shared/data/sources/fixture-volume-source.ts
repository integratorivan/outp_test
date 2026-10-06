import { volumeSnapshotSchema, type Platform } from '../../../entities/volume/model'
import type { VolumeDataSource } from '../volume-data-source'

export class FixtureVolumeDataSource implements VolumeDataSource {
  readonly mode = 'fixture' as const

  queryId() {
    return null
  }

  async load(platform: Platform, signal: AbortSignal) {
    signal.throwIfAborted()
    let module: { default: unknown }
    try {
      module = platform === 'kalshi'
        ? await import('../fixtures/kalshi-volume.json')
        : await import('../fixtures/polymarket-volume.json')
    } catch {
      throw new Error(
        `Fixture ${platform}-volume.json не найден. Скачайте локально: npm run fixtures:update`,
      )
    }
    signal.throwIfAborted()
    const snapshot = volumeSnapshotSchema.parse(module.default)
    if (snapshot.platform !== platform) throw new Error('Fixture platform does not match its source')
    return snapshot
  }
}
