import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { analysisContextSchema } from './model'

vi.mock('bot-avatars', () => ({
  BotAvatar: (props: { type?: string; state?: string }) =>
    createElement('span', {
      'data-bot-avatar': '',
      'data-type': props.type ?? 'clover',
      'data-state': props.state ?? 'default',
    }),
}))

vi.mock('motion/react', async () => {
  const React = await import('react')
  const passthrough = (tag: string) =>
    ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => {
      const {
        layout: _layout,
        initial: _initial,
        animate: _animate,
        exit: _exit,
        transition: _transition,
        ...rest
      } = props
      return React.createElement(tag, rest, children)
    }
  return {
    motion: {
      div: passthrough('div'),
      button: passthrough('button'),
      aside: passthrough('aside'),
    },
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
    useReducedMotion: () => true,
  }
})

const context = analysisContextSchema.parse({
  startDay: '2024-11-04',
  endDay: '2024-11-10',
  view: 'platforms',
  granularity: 'week',
  categories: ['politics'],
  series: [{ label: 'Kalshi', usd: null }],
  previous: null,
})

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return import('./chart-analysis-panel').then(({ default: ChartAnalysisPanel }) =>
    renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(ChartAnalysisPanel, { context, onClose: () => undefined }),
      ),
    ),
  )
}

describe('chart analysis panel', () => {
  it('starts as a bottom-right bot launcher before the panel opens', async () => {
    const html = await renderPanel()
    expect(html).toContain('data-chart-analysis-popup')
    expect(html).toContain('data-bot-avatar')
    expect(html).toContain('data-type="clover"')
    expect(html).toContain('Открыть AI-анализ')
    expect(html).toContain('4 ноября 2024 г.')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('Отправить')
    expect(html).not.toContain('Спросите, что произошло')
    expect(html).not.toContain('Уточнить')
    expect(html).not.toContain('История коммуникаций')
    expect(html).not.toContain('data-slot="dialog-overlay"')
  })

  it('does not render a credential prompt', async () => {
    const html = await renderPanel()
    expect(html).not.toContain('OpenRouter API key')
    expect(html).not.toContain('Ключ OpenRouter')
  })
})
