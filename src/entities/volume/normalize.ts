import type { ParsedDuneVolumeRow } from '../../shared/api/dune/types'
import { mapSourceCategory } from './categories'
import type { DashboardVolumeRow, Platform, SourceVolumeRow } from './model'

export function toSourceRow(row: ParsedDuneVolumeRow, platform: Platform): SourceVolumeRow {
  return {
    day: row.day,
    platform,
    sourceCategory: row.category,
    volumeUsd: row.volume_usd,
  }
}

export function toDashboardRow(row: SourceVolumeRow): DashboardVolumeRow {
  return {
    day: row.day,
    platform: row.platform,
    category: mapSourceCategory(row.platform, row.sourceCategory),
    volumeUsd: row.volumeUsd,
  }
}
