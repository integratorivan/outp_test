import { z } from 'zod'

import { daySchema } from '../../../entities/volume/model'

const duneDaySchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}(?:[ T]00:00:00(?:\.0+)?(?:Z| UTC|\+00:00)?)?$/)
  .transform((value) => value.slice(0, 10))
  .pipe(daySchema)

const volumeUsdSchema = z.union([
  z.number(),
  z.string().regex(/^\d+(\.\d+)?$/).transform(Number),
]).pipe(z.number().finite().nonnegative())

export const duneVolumeRowSchema = z.object({
  day: duneDaySchema,
  category: z.string().trim().min(1),
  volume_usd: volumeUsdSchema,
})

const resultSchema = z.looseObject({
  rows: z.array(duneVolumeRowSchema),
  metadata: z.looseObject({
    row_count: z.number().int().nonnegative(),
    total_row_count: z.number().int().nonnegative(),
  }),
})

export const duneResultSchema = z.looseObject({
  execution_id: z.string().min(1),
  query_id: z.number().int().positive(),
  state: z.string(),
  execution_ended_at: z.iso.datetime({ offset: true }).optional(),
  result: resultSchema.optional(),
  next_offset: z.number().int().nonnegative().nullish(),
  next_uri: z.url().nullish(),
})

export const duneCompletedResultSchema = duneResultSchema.extend({
  state: z.literal('QUERY_STATE_COMPLETED'),
  execution_ended_at: z.iso.datetime({ offset: true }),
  result: resultSchema,
})
