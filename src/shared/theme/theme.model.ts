import { z } from 'zod'

export const themeModeSchema = z.enum(['light', 'dark', 'system'])
export type ThemeMode = z.infer<typeof themeModeSchema>

export const themeStorageKey = 'outpoll.theme'
export const themeChangeEvent = 'outpoll:theme'

export function readSavedThemeMode(): ThemeMode {
  try {
    const result = themeModeSchema.safeParse(localStorage.getItem(themeStorageKey))
    return result.success ? result.data : 'system'
  } catch {
    return 'system'
  }
}

export function resolveThemeMode(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    : mode
}

export function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = resolveThemeMode(mode)
}

export function saveThemeMode(mode: ThemeMode) {
  localStorage.setItem(themeStorageKey, mode)
  applyTheme(mode)
  window.dispatchEvent(new Event(themeChangeEvent))
}
