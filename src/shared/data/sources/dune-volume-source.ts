import type { Platform } from '../../../entities/volume/model'
import { fetchDuneVolumeSnapshot } from '../../api/dune/client'
import { DuneApiService } from '../../api/dune/service'
import type { AppConfig } from '../../config/schema'
import type { VolumeDataSource } from '../volume-data-source'

export class DuneVolumeDataSource implements VolumeDataSource {
  readonly mode = 'dune'

  private readonly service: DuneApiService

  constructor(private readonly config: Extract<AppConfig, { dataMode: 'dune' }>) {
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
