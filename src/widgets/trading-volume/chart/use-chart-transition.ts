import { animate } from 'motion/react'
import { useLayoutEffect, useRef, useState } from 'react'

import { interpolateChartFrame, type ChartFrame } from './chart-transition'

export function useChartTransition(target: ChartFrame, reduceMotion: boolean | null, instant = false) {
  const [frame, setFrame] = useState(target)
  const presentation = useRef(target)

  useLayoutEffect(() => {
    const from = presentation.current
    if (from === target) return

    function display(next: ChartFrame) {
      presentation.current = next
      setFrame(next)
    }

    if (reduceMotion || instant || from.camera.right !== target.camera.right || from.camera.bottom !== target.camera.bottom) {
      display(target)
      return
    }

    const interpolate = interpolateChartFrame(from, target)
    const controls = animate(0, 1, {
      duration: 0.42,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (progress) => display(interpolate(progress)),
      onComplete: () => display(target),
    })
    return () => controls.stop()
  }, [target, reduceMotion, instant])

  return frame
}
