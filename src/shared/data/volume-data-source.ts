import type { Platform, VolumeSnapshot } from '../../entities/volume/model'
import type { DataMode } from '../config/schema'

export interface VolumeDataSource {
  readonly mode: DataMode
  queryId(platform: Platform): number | null
  load(platform: Platform, signal: AbortSignal): Promise<VolumeSnapshot>
}
