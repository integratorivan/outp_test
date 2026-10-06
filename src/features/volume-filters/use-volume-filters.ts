import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import {
  parseDashboardFilters, serializeDashboardFilters,
  type ChartScale, type ChartView, type DashboardFilters, type VolumeGranularity, type VolumeWindow,
} from '../../entities/volume/dashboard/dashboard'
import type { DashboardCategory } from '../../entities/volume/categories'

const changeEvent = 'outpoll:volume-filters'
const wheelCommitDelay = 300

export type WindowChangeMode = 'preview' | 'push' | 'replace' | 'debounced-replace'

function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener)
  window.addEventListener(changeEvent, listener)
  return () => {
    window.removeEventListener('popstate', listener)
    window.removeEventListener(changeEvent, listener)
  }
}

function readSearch() {
  return window.location.search
}

function updateFilters(update: (current: DashboardFilters) => DashboardFilters, replace = false) {
  const next = update(parseDashboardFilters(window.location.search))
  const search = serializeDashboardFilters(next, window.location.search)
  if (search === window.location.search) return
  window.history[replace ? 'replaceState' : 'pushState'](window.history.state, '', `${window.location.pathname}${search}${window.location.hash}`)
  window.dispatchEvent(new Event(changeEvent))
}

export function useVolumeFilters() {
  const search = useSyncExternalStore(subscribe, readSearch, () => '')
  const filters = useMemo(() => parseDashboardFilters(search), [search])
  const [draftWindow, setDraftWindow] = useState<VolumeWindow | null>(null)
  const draftRef = useRef<VolumeWindow | null>(null)
  const debounceTimer = useRef<number | null>(null)

  useEffect(() => {
    draftRef.current = null
    setDraftWindow(null)
  }, [search])

  useEffect(() => () => {
    if (debounceTimer.current !== null) window.clearTimeout(debounceTimer.current)
  }, [])

  function commitWindow(next: VolumeWindow, replace: boolean) {
    if (debounceTimer.current !== null) {
      window.clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }
    draftRef.current = null
    setDraftWindow(null)
    updateFilters((current) => ({ ...current, from: next.from, to: next.to, range: null }), replace)
  }

  function setWindow(next: VolumeWindow, mode: WindowChangeMode) {
    if (mode === 'preview') {
      draftRef.current = next
      setDraftWindow(next)
      return
    }
    if (mode === 'debounced-replace') {
      draftRef.current = next
      setDraftWindow(next)
      if (debounceTimer.current !== null) window.clearTimeout(debounceTimer.current)
      debounceTimer.current = window.setTimeout(() => {
        debounceTimer.current = null
        const latest = draftRef.current
        if (latest) commitWindow(latest, true)
      }, wheelCommitDelay)
      return
    }
    commitWindow(next, mode === 'replace')
  }

  return {
    filters,
    draftWindow,
    setWindow,
    setCategories: (categories: readonly DashboardCategory[]) => updateFilters((current) => ({ ...current, categories })),
    setView: (view: ChartView) => updateFilters((current) => ({ ...current, view })),
    setScale: (scale: ChartScale) => updateFilters((current) => ({ ...current, scale })),
    setGranularity: (granularity: VolumeGranularity) => updateFilters((current) => ({ ...current, granularity })),
  }
}
