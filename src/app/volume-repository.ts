import { VolumeRepository } from '../entities/volume/data/repository'
import { readEnvironmentConfig } from '../shared/config/app'
import { DuneVolumeDataSource } from '../shared/data/sources/dune-volume-source'

export function createVolumeRepository() {
  return new VolumeRepository(new DuneVolumeDataSource(readEnvironmentConfig()))
}
