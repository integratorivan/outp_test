import type { ApiBaseUrl } from './base-url'
import { HttpError } from './http-error'

type QueryParams = Record<string, string | number | boolean | undefined>

type GetOptions = {
  signal: AbortSignal
  query?: QueryParams
}

export class ApiService {
  private readonly headers: Headers

  constructor(private readonly config: {
    baseUrl: ApiBaseUrl
    headers?: ConstructorParameters<typeof Headers>[0]
  }) {
    this.headers = new Headers(config.headers)
    this.headers.set('Accept', 'application/json')
  }

  async get(path: string, { signal, query = {} }: GetOptions): Promise<unknown> {
    if (!path.startsWith('/') || path.startsWith('//') || /[?#\\]/.test(path)
      || path.split('/').some((segment) => segment === '.' || segment === '..')) {
      throw new Error('API endpoint must be a path within the configured base URL')
    }
    signal.throwIfAborted()
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value))
    }
    const suffix = params.size > 0 ? `?${params}` : ''
    const response = await fetch(`${this.config.baseUrl}${path}${suffix}`, {
      method: 'GET',
      headers: new Headers(this.headers),
      signal,
      credentials: 'omit',
      redirect: 'error',
    })
    if (!response.ok) throw new HttpError(response.status, response.statusText)
    const json: unknown = await response.json()
    return json
  }
}
