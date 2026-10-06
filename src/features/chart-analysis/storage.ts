import { z } from 'zod'

import { analysisRecordSchema, type AnalysisContext, type AnalysisRecord } from './model'

export const analysisStorageKey = 'outpoll-chart-analysis-v1'
const archiveSchema = z.object({ version: z.literal(1), conversations: z.array(analysisRecordSchema) })

export function readAnalysisHistory(storage: Pick<Storage, 'getItem'>): AnalysisRecord[] {
  const raw = storage.getItem(analysisStorageKey)
  if (raw === null) return []
  try {
    return archiveSchema.parse(JSON.parse(raw)).conversations
  } catch {
    throw new Error('Сохранённые AI-ответы повреждены или имеют неподдерживаемый формат.')
  }
}

export function saveAnalysisRecord(storage: Pick<Storage, 'getItem' | 'setItem'>, record: AnalysisRecord) {
  const conversations = readAnalysisHistory(storage)
  const archive = archiveSchema.parse({ version: 1, conversations: [...conversations, record] })
  storage.setItem(analysisStorageKey, JSON.stringify(archive))
}

export function latestAnalysisRecord(records: readonly AnalysisRecord[], context: AnalysisContext) {
  const key = JSON.stringify(context)
  return [...records].reverse().find((record) => JSON.stringify(record.context) === key)
}
