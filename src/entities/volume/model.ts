import { z } from 'zod'

import type { DashboardCategory } from './categories.ts'

export const platformSchema = z.enum(['kalshi', 'polymarket'])
export const daySchema = z.iso.date().brand<'Day'>()

export type Platform = z.infer<typeof platformSchema>
export type Day = z.infer<typeof daySchema>

export const sourceVolumeRowSchema = z.object({
  day: daySchema,
  platform: platformSchema,
  sourceCategory: z.string().trim().min(1),
  volumeUsd: z.number().finite().nonnegative(),
})

export type SourceVolumeRow = z.infer<typeof sourceVolumeRowSchema>

export const volumeSnapshotSchema = z.object({
  platform: platformSchema,
  queryId: z.number().int().positive(),
  executionId: z.string().min(1),
  calculatedAt: z.iso.datetime({ offset: true }),
  downloadedAt: z.number().int().nonnegative(),
  rows: z.array(sourceVolumeRowSchema),
}).refine((snapshot) => snapshot.rows.every((row) => row.platform === snapshot.platform), {
  message: 'Snapshot rows must belong to its platform',
  path: ['rows'],
})

export type VolumeSnapshot = z.infer<typeof volumeSnapshotSchema>

export type DashboardVolumeRow = {
  day: Day
  platform: Platform
  category: DashboardCategory
  volumeUsd: number
}

export type ChartPoint = {
  day: Day
  kalshi: number | null
  polymarket: number | null
}
