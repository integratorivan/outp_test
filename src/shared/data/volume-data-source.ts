import type { Platform, VolumeSnapshot } from '../../entities/volume/model'

export interface VolumeDataSource {
  readonly mode: 'dune'
  queryId(platform: Platform): number | null
  load(platform: Platform, signal: AbortSignal): Promise<VolumeSnapshot>
}
