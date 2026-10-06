import { z } from 'zod'

export const apiBaseUrlSchema = z.url({ protocol: /^https?$/ })
  .refine((value) => /^https?:\/\/[^/?#@]+(?:\/[^?#]*)?$/.test(value), {
    message: 'API base URL must not contain credentials, a query, or a fragment',
  })
  .transform((value) => value.replace(/\/+$/, ''))
  .brand<'ApiBaseUrl'>()

export type ApiBaseUrl = z.infer<typeof apiBaseUrlSchema>
