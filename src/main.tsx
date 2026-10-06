import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/app'
import { volumeRepository } from './app/volume-repository'
import { restoreVolumeSnapshot } from './entities/volume/data/queries'
import { queryClient } from './shared/query-client'
import { applyTheme, readSavedThemeMode } from './shared/theme/theme.model'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

applyTheme(readSavedThemeMode())
const reactRoot = createRoot(root)

async function startApp() {
  try {
    await Promise.all([
      restoreVolumeSnapshot(queryClient, volumeRepository, 'kalshi'),
      restoreVolumeSnapshot(queryClient, volumeRepository, 'polymarket'),
    ])
    reactRoot.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <MotionConfig reducedMotion="user">
            <App />
          </MotionConfig>
        </QueryClientProvider>
      </StrictMode>,
    )
  } catch {
    reactRoot.render(
      <main className="mx-auto max-w-page px-page-gutter py-section">
        <p role="alert">Не удалось восстановить runtime-кэш из IndexedDB. Проверьте доступ к хранилищу браузера и перезагрузите страницу.</p>
      </main>,
    )
  }
}

void startApp()
