import { queryOptions, type QueryClient } from '@tanstack/react-query'

import { volumeCacheConfig } from './cache-config'
import type { Platform } from '../model'
import type { VolumeRepository } from './repository'

export function volumeSnapshotQuery(repository: VolumeRepository, platform: Platform) {
  return queryOptions({
    queryKey: repository.key(platform),
    staleTime: volumeCacheConfig.staleTimeMs,
    queryFn: ({ signal }) => repository.load(platform, signal),
  })
}

export async function restoreVolumeSnapshot(
  client: QueryClient,
  repository: VolumeRepository,
  platform: Platform,
) {
  const key = repository.key(platform)
  const snapshot = await repository.readCached(platform)
  if (snapshot && client.getQueryData(key) === undefined) {
    client.setQueryData(key, snapshot, { updatedAt: snapshot.downloadedAt })
  }
}
