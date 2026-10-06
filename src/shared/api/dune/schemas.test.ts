import { describe, expect, it } from 'vitest'

import { duneCompletedResultSchema, duneVolumeRowSchema } from './schemas'

const row = { day: '2024-02-29 00:00:00', category: ' energy ', volume_usd: '123.45' }

describe('Dune boundary', () => {
  it('normalizes midnight dates and decimal volumes while allowing new categories', () => {
    expect(duneVolumeRowSchema.parse(row)).toEqual({
      day: '2024-02-29', category: 'energy', volume_usd: 123.45,
    })
  })

  it.each(['2024-02-29', '2024-02-29 00:00:00', '2024-02-29T00:00:00.000Z'])('accepts day format %s', (day) => {
    expect(duneVolumeRowSchema.parse({ ...row, day }).day).toBe('2024-02-29')
  })

  it.each(['2023-02-29', '2024-02-30', '2024-13-01', '2024-02-29 garbage', '2024-02-29 12:00:00', '2024-02-29T00:00:00+03:00'])('rejects invalid or ambiguous date %s', (day) => {
    expect(duneVolumeRowSchema.safeParse({ ...row, day }).success).toBe(false)
  })

  it.each([-1, Infinity, NaN, '-1', '1e3', '', '123abc', null])('rejects invalid volume %s', (volume_usd) => {
    expect(duneVolumeRowSchema.safeParse({ ...row, volume_usd }).success).toBe(false)
  })

  it('accepts a numeric zero and rejects blank categories', () => {
    expect(duneVolumeRowSchema.parse({ ...row, volume_usd: 0 }).volume_usd).toBe(0)
    expect(duneVolumeRowSchema.safeParse({ ...row, category: '  ' }).success).toBe(false)
  })

  it('retains additive metadata and accepts nanosecond execution timestamps', () => {
    const parsed = duneCompletedResultSchema.parse({
      execution_id: 'execution', query_id: 1, state: 'QUERY_STATE_COMPLETED',
      execution_ended_at: '2024-12-20T11:04:18.724658237Z',
      result: { rows: [row], metadata: { row_count: 1, total_row_count: 1, column_names: ['day'] } },
      future_field: 'allowed',
    })
    expect(parsed.future_field).toBe('allowed')
    expect(parsed.result.metadata.column_names).toEqual(['day'])
  })
})
