import { readAppConfig } from './schema'

export const appConfig = readAppConfig({
  VITE_DATA_MODE: import.meta.env.VITE_DATA_MODE,
  VITE_DUNE_API_BASE_URL: import.meta.env.VITE_DUNE_API_BASE_URL,
  VITE_DUNE_API_KEY: import.meta.env.VITE_DUNE_API_KEY,
  VITE_DUNE_KALSHI_QUERY_ID: import.meta.env.VITE_DUNE_KALSHI_QUERY_ID,
  VITE_DUNE_POLYMARKET_QUERY_ID: import.meta.env.VITE_DUNE_POLYMARKET_QUERY_ID,
})
