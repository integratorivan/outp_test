import type { DashboardCategory } from '../categories.ts'
import type { VolumeGranularity, VolumeRange } from '../dashboard/dashboard.ts'

export const dashboardCategoryLabels = {
  sports: 'Спорт', politics: 'Политика', crypto: 'Криптовалюты', finance: 'Финансы',
  weather: 'Погода', technology: 'Технологии', culture: 'Культура', world: 'Мировые события',
  health: 'Здоровье', business: 'Бизнес', other: 'Другое',
} satisfies Record<DashboardCategory, string>

export const dashboardCategoryColor = {
  sports: { dot: 'bg-category-sports', text: 'text-category-sports' },
  politics: { dot: 'bg-category-politics', text: 'text-category-politics' },
  crypto: { dot: 'bg-category-crypto', text: 'text-category-crypto' },
  finance: { dot: 'bg-category-finance', text: 'text-category-finance' },
  weather: { dot: 'bg-category-weather', text: 'text-category-weather' },
  technology: { dot: 'bg-category-technology', text: 'text-category-technology' },
  culture: { dot: 'bg-category-culture', text: 'text-category-culture' },
  world: { dot: 'bg-category-world', text: 'text-category-world' },
  health: { dot: 'bg-category-health', text: 'text-category-health' },
  business: { dot: 'bg-category-business', text: 'text-category-business' },
  other: { dot: 'bg-category-other', text: 'text-category-other' },
} satisfies Record<DashboardCategory, { dot: string; text: string }>

export const volumeRanges: readonly { value: VolumeRange; label: string }[] = [
  { value: '7d', label: '7д' }, { value: '30d', label: '30д' },
  { value: '90d', label: '90д' }, { value: 'all', label: 'Всё доступное' },
]

export const volumeGranularities: readonly { value: VolumeGranularity; label: string }[] = [
  { value: 'day', label: 'День' },
  { value: 'week', label: 'Неделя' },
]
