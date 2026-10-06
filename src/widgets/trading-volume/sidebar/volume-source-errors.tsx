import { RefreshCw, TriangleAlert } from 'lucide-react'

import type { Platform } from '../../../entities/volume/model'
import { Alert, AlertDescription, AlertTitle } from '../../../shared/ui/alert'
import { Button } from '../../../shared/ui/button'
import { Spinner } from '../../../shared/ui/spinner'
import type { VolumeSourceError } from '../use-volume-dashboard'

const labels = { kalshi: 'Kalshi', polymarket: 'Polymarket' }

function otherPlatform(platform: Platform): Platform {
  return platform === 'kalshi' ? 'polymarket' : 'kalshi'
}

function loadErrorDescription(error: VolumeSourceError) {
  const other = labels[otherPlatform(error.platform)]
  if (error.otherHasData) {
    return `Данные этой платформы недоступны. Данные ${other} остаются видимыми.`
  }
  if (error.otherFailed) {
    return `Данные этой платформы недоступны. ${other} тоже не загрузился.`
  }
  return 'Данные этой платформы недоступны.'
}

export function VolumeSourceErrors({ errors }: { errors: readonly VolumeSourceError[] }) {
  return errors.map((error) => (
    <Alert key={error.platform} variant="destructive">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>
        {error.kind === 'refresh' ? 'Не удалось обновить' : 'Не удалось загрузить'} данные {labels[error.platform]}
      </AlertTitle>
      <AlertDescription className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>
          {error.kind === 'refresh'
            ? 'Показываем предыдущий снимок этой платформы. Его данные могут быть устаревшими.'
            : loadErrorDescription(error)}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={error.isRetrying}
          aria-label={`Повторить загрузку ${labels[error.platform]}`}
          aria-busy={error.isRetrying}
          onClick={error.retry}
        >
          {error.isRetrying
            ? <Spinner data-icon="inline-start" aria-hidden="true" />
            : <RefreshCw data-icon="inline-start" aria-hidden="true" />}
          {error.isRetrying ? 'Загрузка…' : 'Повторить'}
        </Button>
      </AlertDescription>
    </Alert>
  ))
}
