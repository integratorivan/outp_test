import { describe, expect, it } from 'vitest'

import { readAppConfig } from './schema'

const env = {
  VITE_DUNE_API_BASE_URL: 'https://api.dune.com/api/v1/',
  VITE_DUNE_API_KEY: 'test-key',
  VITE_DUNE_KALSHI_QUERY_ID: '123',
  VITE_DUNE_POLYMARKET_QUERY_ID: '456',
}

describe('data source configuration', () => {
  it('defaults to Dune and validates its credentials and query IDs', () => {
    expect(readAppConfig(env)).toEqual({
      dataMode: 'dune', duneBaseUrl: 'https://api.dune.com/api/v1',
      duneApiKey: 'test-key', queryIds: { kalshi: 123, polymarket: 456 },
    })
    expect(() => readAppConfig({})).toThrow()
  })

  it('requires an explicit fixture flag but no API credentials in fixture mode', () => {
    expect(readAppConfig({ VITE_DATA_MODE: 'fixture' })).toEqual({ dataMode: 'fixture' })
  })

  it.each(['fixtures', '', 'offline'])('rejects mistyped mode %s rather than silently using fixtures', (mode) => {
    expect(() => readAppConfig({ ...env, VITE_DATA_MODE: mode })).toThrow()
  })

  it.each(['0', '-1', '123abc', '', '1.5'])('rejects invalid query ID %s', (id) => {
    expect(() => readAppConfig({ ...env, VITE_DUNE_KALSHI_QUERY_ID: id })).toThrow()
  })
})
