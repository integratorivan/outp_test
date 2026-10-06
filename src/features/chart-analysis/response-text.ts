import type { Element, ElementContent, Root } from 'hast'
import { SKIP, visit } from 'unist-util-visit'

import type { AnalysisDraft } from './model'

export function sourceDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    throw new Error('Недопустимый адрес источника.')
  }
}

export function analysisText({ sources, animate }: { sources: AnalysisDraft['sources']; animate: boolean }) {
  return (tree: Root) => {
    visit(tree, 'element', (node) => {
      if (['a', 'code', 'pre'].includes(node.tagName) || node.properties.dataAnalysisWord) return SKIP
      node.children = node.children.flatMap((child): ElementContent[] => {
        if (child.type !== 'text') return [child]
        return (child.value.match(/\[\d+\]|\s+|[^\s[]+|\[/g) ?? []).map((token): ElementContent => {
          if (/^\s+$/.test(token)) return { type: 'text', value: token }
          const citation = /^\[(\d+)\]$/.exec(token)
          const source = citation ? sources[Number(citation[1]) - 1] : undefined
          if (source) {
            return {
              type: 'element',
              tagName: 'a',
              properties: { href: source.url, dataAnalysisCitation: true },
              children: [{ type: 'text', value: token }],
            } satisfies Element
          }
          return {
            type: 'element',
            tagName: 'span',
            properties: { dataAnalysisWord: true, className: animate ? ['analysis-word'] : [] },
            children: [{ type: 'text', value: token }],
          } satisfies Element
        })
      })
    })
  }
}
