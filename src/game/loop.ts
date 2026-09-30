/**
 * Fixed-timestep game loop.
 *
 * Simulation runs in discrete `step` chunks so gameplay is frame-rate independent,
 * while rendering happens once per animation frame with an interpolation factor.
 * The scheduler is injectable, which is what makes this testable without a DOM.
 */
import { clamp } from './types'

export interface Scheduler {
  /** Schedule `frame` for the next tick; returns a handle usable with cancel(). */
  request(frame: (timeMs: number) => void): number
  cancel(handle: number): void
}

export const animationFrameScheduler: Scheduler = {
  request: (frame) => globalThis.requestAnimationFrame(frame),
  cancel: (handle) => {
    globalThis.cancelAnimationFrame(handle)
  },
}

export interface LoopOptions {
  /** Duration of one simulation step, in seconds. */
  readonly step: number
  /** Called zero or more times per frame, always with the same `step`. */
  readonly update: (dt: number) => void
  /** Called once per frame; `alpha` is the 0..1 progress toward the next step. */
  readonly render: (alpha: number) => void
  /** Largest frame delta accepted, in seconds. Guards against tab-stall backlogs. */
  readonly maxFrameTime?: number
  readonly scheduler?: Scheduler
}

export interface Loop {
  start(): void
  stop(): void
  isRunning(): boolean
}

export function createLoop(options: LoopOptions): Loop {
  const { step, update, render } = options
  const maxFrameTime = options.maxFrameTime ?? 0.25
  const scheduler = options.scheduler ?? animationFrameScheduler

  let handle: number | null = null
  let previousSeconds: number | null = null
  let accumulator = 0
  let running = false

  const frame = (timeMs: number): void => {
    handle = scheduler.request(frame)

    const seconds = timeMs / 1000
    const last = previousSeconds ?? seconds
    previousSeconds = seconds

    accumulator += clamp(seconds - last, 0, maxFrameTime)

    while (accumulator >= step) {
      update(step)
      accumulator -= step
    }

    render(accumulator / step)
  }

  return {
    start(): void {
      if (running) return
      running = true
      previousSeconds = null
      accumulator = 0
      handle = scheduler.request(frame)
    },
    stop(): void {
      if (!running) return
      running = false
      if (handle !== null) scheduler.cancel(handle)
      handle = null
    },
    isRunning: () => running,
  }
}
