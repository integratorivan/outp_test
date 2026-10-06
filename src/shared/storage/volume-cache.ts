import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import {
  volumeSnapshotSchema,
  type Platform,
  type VolumeSnapshot,
} from '../../entities/volume/model'

interface VolumeDatabase extends DBSchema {
  snapshots: {
    key: [Platform, number]
    value: VolumeSnapshot
  }
}

let database: Promise<IDBPDatabase<VolumeDatabase>> | undefined

function getDatabase() {
  database ??= openDB<VolumeDatabase>('outpoll-volume', 1, {
    upgrade(db) {
      db.createObjectStore('snapshots', { keyPath: ['platform', 'queryId'] })
    },
  })
  return database
}

export async function readVolumeSnapshot(platform: Platform, queryId: number) {
  const db = await getDatabase()
  const stored: unknown = await db.get('snapshots', [platform, queryId])
  if (stored === undefined) return undefined
  const parsed = volumeSnapshotSchema.safeParse(stored)
  return parsed.success && parsed.data.platform === platform && parsed.data.queryId === queryId
    ? parsed.data
    : undefined
}

export async function writeVolumeSnapshot(snapshot: VolumeSnapshot) {
  const validated = volumeSnapshotSchema.parse(snapshot)
  const db = await getDatabase()
  const transaction = db.transaction('snapshots', 'readwrite')
  const existing = await transaction.store.get([validated.platform, validated.queryId])
  const parsed = volumeSnapshotSchema.safeParse(existing)
  if (!parsed.success || Date.parse(parsed.data.calculatedAt) <= Date.parse(validated.calculatedAt)) {
    await transaction.store.put(validated)
  }
  await transaction.done
}
