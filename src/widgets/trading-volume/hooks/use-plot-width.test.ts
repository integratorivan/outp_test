import { createElement, useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { usePlotWidth } from './use-plot-width'

function Probe({ hint = 0 }: { hint?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const width = usePlotWidth(ref, hint)
  return createElement('div', { ref, 'data-width': width })
}

describe('usePlotWidth', () => {
  it('falls back to 320 when nothing is measured yet', () => {
    const html = renderToStaticMarkup(createElement(Probe))
    expect(html).toContain('data-width="320"')
  })

  it('prefers a positive hint before the element can be measured', () => {
    const html = renderToStaticMarkup(createElement(Probe, { hint: 864 }))
    expect(html).toContain('data-width="864"')
  })

  it('ignores a zero hint', () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
    const html = renderToStaticMarkup(createElement(Probe, { hint: 0 }))
    expect(html).toContain('data-width="320"')
  })
})
