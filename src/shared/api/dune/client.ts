import { toSourceRow } from '../../../entities/volume/normalize'
import type { Platform, SourceVolumeRow, VolumeSnapshot } from '../../../entities/volume/model'
import type { DuneApiService } from './service'

const pageSize = 1000

export async function fetchDuneVolumeSnapshot({
  platform, queryId, service, signal,
}: {
  platform: Platform
  queryId: number
  service: DuneApiService
  signal: AbortSignal
}): Promise<VolumeSnapshot> {
  signal.throwIfAborted()
  const first = await service.getLatestResult({ queryId, limit: pageSize, signal })
  let page = first
  let offset = 0
  const rows: SourceVolumeRow[] = []
  const total = first.result.metadata.total_row_count

  while (true) {
    signal.throwIfAborted()
    if (page.query_id !== queryId || page.execution_id !== first.execution_id
      || page.execution_ended_at !== first.execution_ended_at
      || page.result.metadata.total_row_count !== total) {
      throw new Error('Dune pagination changed execution or metadata')
    }
    if (page.result.metadata.row_count !== page.result.rows.length) {
      throw new Error('Dune page row count does not match its rows')
    }
    for (const row of page.result.rows) rows.push(toSourceRow(row, platform))
    if (rows.length > total) throw new Error('Dune result contains more rows than declared')

    const nextOffset = page.next_offset
    if (nextOffset == null) {
      if (page.next_uri || rows.length !== total) {
        throw new Error('Dune result is incomplete')
      }
      break
    }
    if (nextOffset !== offset + page.result.rows.length || nextOffset <= offset) {
      throw new Error('Dune pagination offset does not advance contiguously')
    }

    offset = nextOffset
    page = await service.getExecutionResult({
      executionId: first.execution_id, offset, limit: pageSize, signal,
    })
  }

  signal.throwIfAborted()
  return {
    platform,
    queryId,
    executionId: first.execution_id,
    calculatedAt: first.execution_ended_at,
    downloadedAt: Date.now(),
    rows,
  }
}
