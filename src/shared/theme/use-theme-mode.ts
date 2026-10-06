import { useSyncExternalStore } from 'react'

import { applyTheme, readSavedThemeMode, resolveThemeMode, saveThemeMode, themeChangeEvent, themeStorageKey } from './theme.model'

function subscribe(listener: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)')

  function systemChanged() {
    if (readSavedThemeMode() === 'system') {
      applyTheme('system')
      listener()
    }
  }

  function storageChanged(event: StorageEvent) {
    if (event.key !== themeStorageKey && event.key !== null) return
    applyTheme(readSavedThemeMode())
    listener()
  }

  media.addEventListener('change', systemChanged)
  window.addEventListener('storage', storageChanged)
  window.addEventListener(themeChangeEvent, listener)
  return () => {
    media.removeEventListener('change', systemChanged)
    window.removeEventListener('storage', storageChanged)
    window.removeEventListener(themeChangeEvent, listener)
  }
}

function readResolvedTheme() {
  return resolveThemeMode(readSavedThemeMode())
}

export function useThemeMode() {
  const mode = useSyncExternalStore(subscribe, readResolvedTheme)
  return { mode, setMode: saveThemeMode }
}
