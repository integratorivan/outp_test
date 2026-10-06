import type { Root } from 'hast'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { TooltipProvider } from '../../shared/ui/tooltip'
import { formatAnalysisElapsed } from './analysis-loading'
import { AnalysisResponse } from './analysis-response'
import { analysisText, sourceDomain } from './response-text'

const sources = [{ url: 'https://www.example.com/news', title: 'Источник' }]

describe('inline event citations', () => {
  it('links each citation to its own source without inventing missing sources', () => {
    const tree: Root = {
      type: 'root',
      children: [
        { type: 'element', tagName: 'p', properties: {}, children: [{ type: 'text', value: 'Событие [1][2].' }] },
      ],
    }
    analysisText({ sources, animate: true })(tree)
    const paragraph = tree.children[0]
    if (paragraph?.type !== 'element') throw new Error('Expected paragraph')
    const citations = paragraph.children.filter((child) => child.type === 'element' && child.tagName === 'a')
    expect(citations).toHaveLength(1)
    const citation = citations[0]
    if (citation?.type !== 'element') throw new Error('Expected citation link')
    expect(citation.properties.href).toBe(sources[0]?.url)
    expect(JSON.stringify(tree)).toContain('[2]')
  })

  it('preserves whitespace, existing links and code', () => {
    const tree: Root = {
      type: 'root',
      children: [
        { type: 'element', tagName: 'p', properties: {}, children: [{ type: 'text', value: 'Событие\n произошло.' }] },
        { type: 'element', tagName: 'code', properties: {}, children: [{ type: 'text', value: '[1]' }] },
        {
          type: 'element',
          tagName: 'a',
          properties: { href: 'https://example.com' },
          children: [{ type: 'text', value: '[1]' }],
        },
      ],
    }
    analysisText({ sources, animate: false })(tree)
    const paragraph = tree.children[0]
    if (paragraph?.type !== 'element') throw new Error('Expected paragraph')
    expect(paragraph.children[1]).toEqual({ type: 'text', value: '\n ' })
    expect(JSON.stringify(tree.children[1])).not.toContain('dataAnalysisWord')
    expect(JSON.stringify(tree.children[2])).not.toContain('dataAnalysisCitation')
    expect(JSON.stringify(tree)).not.toContain('analysis-word')
  })

  it('renders compact source chips in the answer, with actions only after completion', () => {
    const render = (complete: boolean) =>
      renderToStaticMarkup(
        createElement(
          TooltipProvider,
          {},
          createElement(AnalysisResponse, {
            response: { answer: 'Подтверждённое событие [1].', sources },
            complete,
            streaming: !complete,
            animate: !complete,
            canRetry: true,
            onRetry: () => {},
          }),
        ),
      )
    const pending = render(false)
    expect(pending).toContain('example.com')
    expect(pending).toContain('aria-busy="true"')
    expect(pending).not.toContain('Скопировать ответ')
    const done = render(true)
    expect(done).toContain('Скопировать ответ')
    expect(done).toContain('Повторить запрос (платно)')
    expect(done).not.toContain('Уточнить')
    expect(done).not.toContain('Какие ещё события произошли')
    expect(done).not.toContain('<img')
  })

  it('uses the domain, not userinfo or a query string, as the chip label', () => {
    expect(sourceDomain('https://www.example.com/article?url=https://other.com')).toBe('example.com')
    expect(sourceDomain('https://name@example.com/article')).toBe('example.com')
  })
})

describe('loading timer', () => {
  it.each([
    [0, '0.0с'],
    [1234, '1.2с'],
    [65_100, '1м 5.1с'],
  ])('formats %s milliseconds as %s', (time, label) => {
    expect(formatAnalysisElapsed(time)).toBe(label)
  })
})
