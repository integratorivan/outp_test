import { z } from 'zod'

import { apiBaseUrlSchema } from '../api/base-url'

const queryIdSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive())

const environmentSchema = z.object({
  VITE_DUNE_API_BASE_URL: apiBaseUrlSchema,
  VITE_DUNE_API_KEY: z.string().trim().min(1),
  VITE_DUNE_KALSHI_QUERY_ID: queryIdSchema,
  VITE_DUNE_POLYMARKET_QUERY_ID: queryIdSchema,
})

export function readAppConfig(env: Record<string, string | undefined>) {
  const parsed = environmentSchema.parse(env)
  return {
    duneBaseUrl: parsed.VITE_DUNE_API_BASE_URL,
    duneApiKey: parsed.VITE_DUNE_API_KEY,
    queryIds: {
      kalshi: parsed.VITE_DUNE_KALSHI_QUERY_ID,
      polymarket: parsed.VITE_DUNE_POLYMARKET_QUERY_ID,
    },
  } as const
}

export type AppConfig = ReturnType<typeof readAppConfig>
