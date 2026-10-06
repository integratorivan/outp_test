import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseDashboardFilters } from '../../entities/volume/dashboard/dashboard'
import { daySchema } from '../../entities/volume/model'
import { useVolumeFilters } from './use-volume-filters'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const sampleWindow = { from: daySchema.parse('2026-09-01'), to: daySchema.parse('2026-09-30') }

function renderFilters(url: string) {
  let location = new URL(url)
  const events = new EventTarget()
  const state = { navigation: 'preserved' }
  const pushState = vi.fn((nextState: unknown, _unused: string, nextUrl: string) => {
    expect(nextState).toBe(state)
    location = new URL(nextUrl, location)
  })
  const replaceState = vi.fn((nextState: unknown, _unused: string, nextUrl: string) => {
    expect(nextState).toBe(state)
    location = new URL(nextUrl, location)
  })
  vi.stubGlobal('window', {
    get location() { return location },
    history: { state, pushState, replaceState },
    dispatchEvent: events.dispatchEvent.bind(events),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  })
  let controls: ReturnType<typeof useVolumeFilters> | undefined
  function Probe() {
    controls = useVolumeFilters()
    return null
  }
  renderToStaticMarkup(createElement(Probe))
  if (!controls) throw new Error('Filter hook did not render')
  return { controls, read: () => parseDashboardFilters(location.search), url: () => location, events, pushState, replaceState }
}

describe('volume filter URL setters', () => {
  it('writes the window as from/to and drops the legacy range on push', () => {
    const { controls, read, url, pushState, replaceState } = renderFilters('https://outpoll.test/dashboard?range=all&g=week')
    controls.setWindow(sampleWindow, 'push')
    expect(read()).toMatchObject({ from: sampleWindow.from, to: sampleWindow.to, range: null, granularity: 'week' })
    expect(url().searchParams.has('range')).toBe(false)
    expect(url().searchParams.get('g')).toBe('week')
    expect(pushState).toHaveBeenCalledTimes(1)
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('replaces history instead of pushing when asked', () => {
    const { controls, read, pushState, replaceState } = renderFilters('https://outpoll.test/dashboard')
    controls.setWindow(sampleWindow, 'replace')
    expect(read()).toMatchObject({ from: sampleWindow.from, to: sampleWindow.to })
    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).toHaveBeenCalledTimes(1)
  })

  it('debounces wheel commits into a single replace', () => {
    vi.useFakeTimers()
    const { controls, read, pushState, replaceState } = renderFilters('https://outpoll.test/dashboard')
    controls.setWindow(sampleWindow, 'debounced-replace')
    controls.setWindow({ from: daySchema.parse('2026-09-05'), to: daySchema.parse('2026-10-04') }, 'debounced-replace')
    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).not.toHaveBeenCalled()
    vi.advanceTimersByTime(400)
    expect(replaceState).toHaveBeenCalledTimes(1)
    expect(read()).toMatchObject({ from: daySchema.parse('2026-09-05'), to: daySchema.parse('2026-10-04') })
    expect(pushState).not.toHaveBeenCalled()
  })

  it('keeps preview commits out of the URL', () => {
    const { controls, read, pushState, replaceState } = renderFilters('https://outpoll.test/dashboard')
    controls.setWindow(sampleWindow, 'preview')
    expect(read()).toEqual(parseDashboardFilters(''))
    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('cancels a pending debounced commit when a final commit lands', () => {
    vi.useFakeTimers()
    const { controls, read, pushState, replaceState } = renderFilters('https://outpoll.test/dashboard')
    controls.setWindow(sampleWindow, 'debounced-replace')
    controls.setWindow(sampleWindow, 'push')
    vi.advanceTimersByTime(400)
    expect(pushState).toHaveBeenCalledTimes(1)
    expect(replaceState).not.toHaveBeenCalled()
    expect(read()).toMatchObject({ from: sampleWindow.from, to: sampleWindow.to })
  })

  it('preserves chart granularity across window and category changes', () => {
    const { controls, read, url } = renderFilters('https://outpoll.test/dashboard')
    controls.setGranularity('week')
    expect(url().searchParams.get('g')).toBe('week')
    controls.setWindow(sampleWindow, 'push')
    controls.setCategories(['sports'])
    expect(read()).toMatchObject({ from: sampleWindow.from, granularity: 'week', categories: ['sports'] })
    controls.setGranularity('day')
    expect(url().searchParams.has('g')).toBe(false)
  })

  it('preserves symlog across window and category changes', () => {
    const { controls, read, url } = renderFilters('https://outpoll.test/dashboard')
    controls.setScale('symlog')
    expect(url().searchParams.get('scale')).toBe('symlog')
    controls.setWindow(sampleWindow, 'push')
    controls.setCategories(['sports'])
    expect(read()).toMatchObject({ from: sampleWindow.from, scale: 'symlog', categories: ['sports'] })
    controls.setScale('linear')
    expect(url().searchParams.has('scale')).toBe(false)
  })

  it('preserves path, hash and unrelated query parameters and emits one event per change', () => {
    const { controls, read, url, events, pushState } = renderFilters('https://outpoll.test/dashboard?campaign=test&campaign=second#chart')
    const changed = vi.fn()
    events.addEventListener('outpoll:volume-filters', changed)
    controls.setScale('symlog')
    controls.setCategories(['sports'])
    expect(read()).toMatchObject({ scale: 'symlog', categories: ['sports'] })
    expect(url().pathname).toBe('/dashboard')
    expect(url().hash).toBe('#chart')
    expect(url().searchParams.getAll('campaign')).toEqual(['test', 'second'])
    expect(url().searchParams.get('scale')).toBe('symlog')
    expect(pushState).toHaveBeenCalledTimes(2)
    expect(changed).toHaveBeenCalledTimes(2)
  })

  it('canonicalizes conflicting URL state on the next change', () => {
    const { controls, url } = renderFilters('https://outpoll.test/?range=all&g=day&view=invalid&scale=symlog')
    controls.setCategories(['sports'])
    expect(url().searchParams.has('g')).toBe(false)
    expect(url().searchParams.get('range')).toBe('all')
    expect(url().searchParams.get('scale')).toBe('symlog')
  })
})
