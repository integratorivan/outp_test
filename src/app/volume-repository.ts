import { VolumeRepository } from '../entities/volume/data/repository'
import { appConfig } from '../shared/config/app'
import { DuneVolumeDataSource } from '../shared/data/sources/dune-volume-source'

export const volumeRepository = new VolumeRepository(new DuneVolumeDataSource(appConfig))
