import { describe, expect, it } from 'vitest'

import { readAppConfig } from './schema'

const env = {
  VITE_DUNE_API_BASE_URL: 'https://api.dune.com/api/v1/',
  VITE_DUNE_API_KEY: 'test-key',
  VITE_DUNE_KALSHI_QUERY_ID: '123',
  VITE_DUNE_POLYMARKET_QUERY_ID: '456',
}

describe('data source configuration', () => {
  it('validates Dune credentials and query IDs', () => {
    expect(readAppConfig(env)).toEqual({
      duneBaseUrl: 'https://api.dune.com/api/v1',
      duneApiKey: 'test-key',
      queryIds: { kalshi: 123, polymarket: 456 },
    })
    expect(() => readAppConfig({})).toThrow()
  })

  it.each(['0', '-1', '123abc', '', '1.5'])('rejects invalid query ID %s', (id) => {
    expect(() => readAppConfig({ ...env, VITE_DUNE_KALSHI_QUERY_ID: id })).toThrow()
  })
})
