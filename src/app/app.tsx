import { useState } from 'react'

import type { VolumeRepository } from '../entities/volume/data/repository'
import type { Platform } from '../entities/volume/model'
import { dashboardCategories } from '../entities/volume/categories'
import { useVolumeFilters } from '../features/volume-filters/use-volume-filters'
import { DashboardHeader } from '../widgets/dashboard-header/dashboard-header'
import { TradingVolume } from '../widgets/trading-volume/trading-volume'
import { useVolumeDashboard } from '../widgets/trading-volume/use-volume-dashboard'

export function App({ volumeRepository }: { volumeRepository: VolumeRepository }) {
  const { filters, draftWindow, setWindow, setCategories, setView, setGranularity } =
    useVolumeFilters()
  const [visiblePlatforms, setVisiblePlatforms] = useState<readonly Platform[]>(['kalshi', 'polymarket'])
  const dashboard = useVolumeDashboard(volumeRepository, filters, visiblePlatforms, draftWindow)

  return (
    <div className="min-h-svh">
      <DashboardHeader />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto flex max-w-page flex-col px-4 py-group sm:px-page-gutter"
      >
        <h1 className="sr-only">
          Outpoll — сравнение оборота Polymarket и Kalshi
        </h1>
        <TradingVolume
          dashboard={dashboard}
          visiblePlatforms={visiblePlatforms}
          onVisiblePlatformsChange={setVisiblePlatforms}
          view={filters.view}
          scale={filters.scale}
          granularity={filters.granularity}
          onViewChange={setView}
          onGranularityChange={setGranularity}
          selectedCategories={filters.categories}
          onWindowChange={setWindow}
          onSelectAllCategories={() => setCategories(dashboardCategories)}
          onToggleCategory={(category) =>
            setCategories(
              filters.categories.includes(category)
                ? filters.categories.filter((value) => value !== category)
                : [...filters.categories, category],
            )
          }
        />
      </main>
    </div>
  )
}
