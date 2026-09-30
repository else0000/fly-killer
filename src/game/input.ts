import type { Size } from './types'

/**
 * Keyboard + pointer input. Translates raw DOM events into the small vocabulary
 * the game needs: two axes, a pointer position in logical pixels, and swat edges.
 */
export interface Input {
  /** -1, 0 or 1. */
  axisX(): number
  axisY(): number
  pointerX(): number
  pointerY(): number
  /** True while the pointer is over the canvas; false before the first move. */
  pointerInside(): boolean
  /** True at most once per press, then clears. */
  takeSwat(): boolean
  dispose(): void
}

const BINDINGS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  swat: ['Space', 'Enter', 'KeyJ'],
} as const satisfies Record<string, readonly string[]>

const BOUND_CODES: ReadonlySet<string> = new Set(Object.values(BINDINGS).flat())
const SWAT_CODES: ReadonlySet<string> = new Set(BINDINGS.swat)

export function createInput(canvas: HTMLCanvasElement, view: Size): Input {
  const pressed = new Set<string>()
  const pointer = { x: view.width / 2, y: view.height / 2, inside: false }
  let swatPending = false

  const axis = (negative: readonly string[], positive: readonly string[]): number => {
    const down = (codes: readonly string[]): boolean => codes.some((code) => pressed.has(code))
    return (down(positive) ? 1 : 0) - (down(negative) ? 1 : 0)
  }

  const toLogical = (clientX: number, clientY: number): void => {
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    pointer.x = ((clientX - rect.left) / rect.width) * view.width
    pointer.y = ((clientY - rect.top) / rect.height) * view.height
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return
    pressed.add(event.code)
    if (SWAT_CODES.has(event.code)) swatPending = true
    if (BOUND_CODES.has(event.code)) event.preventDefault()
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    pressed.delete(event.code)
  }

  const onBlur = (): void => {
    pressed.clear()
  }

  const onPointerMove = (event: PointerEvent): void => {
    toLogical(event.clientX, event.clientY)
    pointer.inside = true
  }

  const onPointerDown = (event: PointerEvent): void => {
    toLogical(event.clientX, event.clientY)
    pointer.inside = true
    swatPending = true
    event.preventDefault()
  }

  const onPointerLeave = (): void => {
    pointer.inside = false
  }

  const onContextMenu = (event: Event): void => {
    event.preventDefault()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointerleave', onPointerLeave)
  canvas.addEventListener('contextmenu', onContextMenu)

  return {
    axisX: () => axis(BINDINGS.left, BINDINGS.right),
    axisY: () => axis(BINDINGS.up, BINDINGS.down),
    pointerX: () => pointer.x,
    pointerY: () => pointer.y,
    pointerInside: () => pointer.inside,
    takeSwat(): boolean {
      const pending = swatPending
      swatPending = false
      return pending
    },
    dispose(): void {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('contextmenu', onContextMenu)
      pressed.clear()
    },
  }
}
