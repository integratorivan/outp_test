import type { Platform } from '../../../entities/volume/model'
import { fetchDuneVolumeSnapshot } from '../../api/dune/client'
import { DuneApiService } from '../../api/dune/service'
import type { AppConfig } from '../../config/schema'
import type { VolumeDataSource } from '../volume-data-source'

export class DuneVolumeDataSource implements VolumeDataSource {
  readonly mode = 'dune' as const

  private readonly service: DuneApiService

  constructor(private readonly config: AppConfig) {
    this.service = new DuneApiService({ baseUrl: config.duneBaseUrl, apiKey: config.duneApiKey })
  }

  queryId(platform: Platform) {
    return this.config.queryIds[platform]
  }

  load(platform: Platform, signal: AbortSignal) {
    return fetchDuneVolumeSnapshot({
      platform, queryId: this.queryId(platform), service: this.service, signal,
    })
  }
}
