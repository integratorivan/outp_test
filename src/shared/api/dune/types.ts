import type { z } from 'zod'

import type {
  duneCompletedResultSchema,
  duneResultSchema,
  duneVolumeRowSchema,
} from './schemas'

export type DuneVolumeRowDto = z.input<typeof duneVolumeRowSchema>
export type ParsedDuneVolumeRow = z.output<typeof duneVolumeRowSchema>
export type DuneResultDto = z.input<typeof duneResultSchema>
export type DuneCompletedResult = z.output<typeof duneCompletedResultSchema>
