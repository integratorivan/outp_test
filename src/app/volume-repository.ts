import { VolumeRepository } from '../entities/volume/data/repository'
import { appConfig } from '../shared/config/app'
import { DuneVolumeDataSource } from '../shared/data/sources/dune-volume-source'
import { FixtureVolumeDataSource } from '../shared/data/sources/fixture-volume-source'

export const volumeRepository = new VolumeRepository(
  appConfig.dataMode === 'fixture'
    ? new FixtureVolumeDataSource()
    : new DuneVolumeDataSource(appConfig),
)
