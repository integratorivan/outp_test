import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applyTheme, readSavedThemeMode, resolveThemeMode, saveThemeMode, themeChangeEvent, themeStorageKey } from './theme.model'

const values = new Map<string, string>()
const dataset: { theme?: string } = {}
const dispatchEvent = vi.fn()
let systemDark = false

beforeEach(() => {
  values.clear()
  delete dataset.theme
  systemDark = false
  dispatchEvent.mockClear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  })
  vi.stubGlobal('document', { documentElement: { dataset } })
  vi.stubGlobal('window', { matchMedia: () => ({ matches: systemDark }), dispatchEvent })
})

afterEach(() => vi.unstubAllGlobals())

describe('theme preferences', () => {
  it('uses the system theme until the user makes a choice', () => {
    expect(readSavedThemeMode()).toBe('system')
    expect(resolveThemeMode('system')).toBe('light')
    systemDark = true
    expect(resolveThemeMode('system')).toBe('dark')
  })

  it('keeps an explicit theme independent of the operating system', () => {
    systemDark = true
    expect(resolveThemeMode('light')).toBe('light')
    systemDark = false
    expect(resolveThemeMode('dark')).toBe('dark')
  })

  it('validates persisted preferences and ignores unsupported values', () => {
    values.set(themeStorageKey, 'dark')
    expect(readSavedThemeMode()).toBe('dark')
    values.set(themeStorageKey, 'invalid')
    expect(readSavedThemeMode()).toBe('system')
  })

  it('applies the resolved mode to the CSS theme selector', () => {
    applyTheme('dark')
    expect(dataset.theme).toBe('dark')
    applyTheme('light')
    expect(dataset.theme).toBe('light')
    systemDark = true
    applyTheme('system')
    expect(dataset.theme).toBe('dark')
  })

  it('saves, applies and announces a theme change', () => {
    saveThemeMode('dark')
    expect(values.get(themeStorageKey)).toBe('dark')
    expect(dataset.theme).toBe('dark')
    expect(dispatchEvent.mock.calls[0]?.[0].type).toBe(themeChangeEvent)
  })
})
