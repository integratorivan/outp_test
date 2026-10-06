import { useLayoutEffect, useState, type RefObject } from 'react'

const fallbackWidth = 320

/** Measure plot width before paint so SVG viewBox never letterboxes at the fallback size. */
export function usePlotWidth(ref: RefObject<HTMLElement | null>, hint = 0) {
  const [width, setWidth] = useState(() => (hint > 0 ? hint : fallbackWidth))

  useLayoutEffect(() => {
    if (hint > 0) setWidth((current) => (current === hint ? current : hint))
  }, [hint])

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return

    const apply = (next: number) => {
      if (next > 0) setWidth((current) => (current === next ? current : next))
    }

    apply(node.clientWidth)

    const observer = new ResizeObserver(([entry]) => {
      if (entry) apply(entry.contentRect.width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref])

  return width
}
