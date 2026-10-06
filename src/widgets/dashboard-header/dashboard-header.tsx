import { Moon, Sun } from 'lucide-react'

import { useThemeMode } from '../../shared/theme/use-theme-mode'
import { Button } from '../../shared/ui/button'

export function DashboardHeader() {
  const { mode, setMode } = useThemeMode()
  const themeLabel =
    mode === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'
  const ThemeIcon = mode === 'dark' ? Sun : Moon

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex min-h-16 max-w-page items-center justify-between gap-section px-4 py-group sm:px-page-gutter">
        <a
          href="/"
          aria-label="Outpoll — торговый оборот"
          className="font-logo text-3xl font-normal"
        >
          outpoll
        </a>
        <Button
          variant="outline"
          size="icon"
          aria-label={themeLabel}
          title={themeLabel}
          data-icon-motion="theme"
          onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
        >
          <ThemeIcon data-motion-icon aria-hidden="true" strokeWidth={1.75} />
        </Button>
      </div>
    </header>
  )
}
