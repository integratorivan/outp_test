import { z } from 'zod'

import { apiBaseUrlSchema } from '../api/base-url'

export const dataModeSchema = z.enum(['dune', 'fixture'])
export type DataMode = z.infer<typeof dataModeSchema>

const queryIdSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive())

const environmentSchema = z.discriminatedUnion('VITE_DATA_MODE', [
  z.object({ VITE_DATA_MODE: z.literal('fixture') }),
  z.object({
    VITE_DATA_MODE: z.literal('dune'),
    VITE_DUNE_API_BASE_URL: apiBaseUrlSchema,
    VITE_DUNE_API_KEY: z.string().trim().min(1),
    VITE_DUNE_KALSHI_QUERY_ID: queryIdSchema,
    VITE_DUNE_POLYMARKET_QUERY_ID: queryIdSchema,
  }),
])

export function readAppConfig(env: Record<string, string | undefined>) {
  const parsed = environmentSchema.parse({ ...env, VITE_DATA_MODE: env.VITE_DATA_MODE ?? 'dune' })
  if (parsed.VITE_DATA_MODE === 'fixture') return { dataMode: 'fixture' } as const
  return {
    dataMode: 'dune',
    duneBaseUrl: parsed.VITE_DUNE_API_BASE_URL,
    duneApiKey: parsed.VITE_DUNE_API_KEY,
    queryIds: {
      kalshi: parsed.VITE_DUNE_KALSHI_QUERY_ID,
      polymarket: parsed.VITE_DUNE_POLYMARKET_QUERY_ID,
    },
  } as const
}

export type AppConfig = ReturnType<typeof readAppConfig>
