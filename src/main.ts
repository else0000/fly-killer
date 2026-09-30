/**
 * Browser entry point: owns the canvas, the render loop and the DOM wiring.
 * All game rules live in ./game/world.ts; all pixels in ./game/render.ts.
 */
import './style.css'

import { createInput } from './game/input'
import { createLoop } from './game/loop'
import { render } from './game/render'
import { createWorld, updateWorld, type Intent } from './game/world'

/** Logical resolution. The canvas is scaled to fit its container via CSS. */
const VIEW = { width: 960, height: 540 } as const

function requireCanvas(selector: string): HTMLCanvasElement {
  const element = document.querySelector(selector)
  if (!(element instanceof HTMLCanvasElement)) {
    throw new Error(`Expected a <canvas> matching ${selector}`)
  }
  return element
}

function main(): void {
  const canvas = requireCanvas('#game')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D context is unavailable')

  // Back the canvas with physical pixels so lines stay crisp on HiDPI screens.
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(VIEW.width * dpr)
  canvas.height = Math.round(VIEW.height * dpr)
  context.scale(dpr, dpr)

  const input = createInput(canvas, VIEW)
  const world = createWorld(VIEW)

  const readIntent = (): Intent => ({
    move: { x: input.axisX(), y: input.axisY() },
    pointer: input.pointerInside() ? { x: input.pointerX(), y: input.pointerY() } : null,
    swat: input.takeSwat(),
  })

  const loop = createLoop({
    step: 1 / 60,
    update: (dt) => {
      updateWorld(world, dt, readIntent())
    },
    render: (alpha) => {
      render(context, world, alpha)
    },
  })

  loop.start()

  // Don't simulate a game nobody is watching.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) loop.stop()
    else loop.start()
  })

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      loop.stop()
      input.dispose()
    })
  }
}

main()
