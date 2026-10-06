import { z } from 'zod'

import type { Platform } from './model.ts'

export const knownKalshiCategories = [
  'sports', 'crypto', 'exotics', 'politics', 'commodities', 'mentions',
  'elections', 'economics', 'financials', 'climate and weather',
  'entertainment', 'companies', 'science and technology', 'health',
  'world', 'transportation', 'social', 'unknown', 'ai', 'education', 'business',
] as const

export const knownPolymarketCategories = [
  'sports', 'crypto', 'weather', 'politics', 'finance', 'culture',
  'other', 'technology', 'world', 'health',
] as const

export const dashboardCategories = [
  'sports', 'politics', 'crypto', 'finance', 'weather', 'technology',
  'culture', 'world', 'health', 'business', 'combo', 'other',
] as const

export const dashboardCategorySchema = z.enum(dashboardCategories)
export type DashboardCategory = z.infer<typeof dashboardCategorySchema>
export type KnownKalshiCategory = (typeof knownKalshiCategories)[number]
export type KnownPolymarketCategory = (typeof knownPolymarketCategories)[number]

export const kalshiCategoryMap = {
  sports: 'sports',
  crypto: 'crypto',
  politics: 'politics',
  elections: 'politics',
  economics: 'finance',
  financials: 'finance',
  commodities: 'finance',
  'climate and weather': 'weather',
  'science and technology': 'technology',
  ai: 'technology',
  entertainment: 'culture',
  social: 'culture',
  world: 'world',
  health: 'health',
  companies: 'business',
  business: 'business',
  exotics: 'combo',
  mentions: 'other',
  transportation: 'other',
  education: 'other',
  unknown: 'other',
} satisfies Record<KnownKalshiCategory, DashboardCategory>

export const polymarketCategoryMap = {
  sports: 'sports',
  crypto: 'crypto',
  politics: 'politics',
  finance: 'finance',
  weather: 'weather',
  technology: 'technology',
  culture: 'culture',
  world: 'world',
  health: 'health',
  other: 'other',
} satisfies Record<KnownPolymarketCategory, DashboardCategory>

const categoryMaps = {
  kalshi: new Map<string, DashboardCategory>(Object.entries(kalshiCategoryMap)),
  polymarket: new Map<string, DashboardCategory>(Object.entries(polymarketCategoryMap)),
} satisfies Record<Platform, Map<string, DashboardCategory>>

export function mapSourceCategory(platform: Platform, sourceCategory: string): DashboardCategory {
  return categoryMaps[platform].get(sourceCategory.trim().toLowerCase()) ?? 'other'
}
