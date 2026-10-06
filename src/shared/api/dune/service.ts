import { ApiService } from '../api-service'
import type { ApiBaseUrl } from '../base-url'
import { duneCompletedResultSchema, duneResultSchema } from './schemas'

type PageParams = { limit: number; signal: AbortSignal }

export class DuneApiService {
  private readonly http: ApiService

  constructor({ baseUrl, apiKey }: { baseUrl: ApiBaseUrl; apiKey: string }) {
    this.http = new ApiService({ baseUrl, headers: { 'X-DUNE-API-KEY': apiKey } })
  }

  getLatestResult({ queryId, limit, signal }: PageParams & { queryId: number }) {
    return this.getResult(`/query/${queryId}/results`, {
      limit, offset: 0, signal,
    })
  }

  getExecutionResult({ executionId, offset, limit, signal }: PageParams & { executionId: string; offset: number }) {
    return this.getResult(`/execution/${encodeURIComponent(executionId)}/results`, {
      limit, offset, signal,
    })
  }

  private async getResult(path: string, { signal, limit, offset }: PageParams & { offset: number }) {
    const json = await this.http.get(path, {
      signal, query: { limit, offset, allow_partial_results: false },
    })
    const envelope = duneResultSchema.parse(json)
    if (envelope.state !== 'QUERY_STATE_COMPLETED') {
      throw new Error(`Dune execution is not complete: ${envelope.state}`)
    }
    return duneCompletedResultSchema.parse(json)
  }
}
