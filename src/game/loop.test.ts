import { describe, expect, it, vi } from 'vitest'

import { createLoop, type Scheduler } from './loop'

const noop = (): void => undefined

/** Lets tests decide exactly when frames happen. */
function createManualScheduler(): Scheduler & {
  readonly pending: number
  tick(timeMs: number): void
} {
  let nextHandle = 1
  const queue = new Map<number, (timeMs: number) => void>()

  return {
    get pending() {
      return queue.size
    },
    request(frame) {
      const handle = nextHandle
      nextHandle += 1
      queue.set(handle, frame)
      return handle
    },
    cancel(handle) {
      queue.delete(handle)
    },
    tick(timeMs) {
      const last = [...queue.entries()].at(-1)
      if (!last) throw new Error('no frame scheduled')
      queue.delete(last[0])
      last[1](timeMs)
    },
  }
}

describe('createLoop', () => {
  it('runs one update per fixed step', () => {
    const scheduler = createManualScheduler()
    const update = vi.fn()
    const loop = createLoop({ step: 1 / 60, update, render: noop, scheduler })

    loop.start()
    scheduler.tick(0) // first frame only establishes the clock
    expect(update).not.toHaveBeenCalled()

    scheduler.tick(1000 / 60)
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(1 / 60)

    scheduler.tick(2 * (1000 / 60))
    expect(update).toHaveBeenCalledTimes(2)
  })

  it('catches up with multiple steps on a slow frame', () => {
    const scheduler = createManualScheduler()
    const update = vi.fn()
    const loop = createLoop({ step: 0.01, update, render: noop, scheduler })

    loop.start()
    scheduler.tick(0)
    scheduler.tick(35) // 35ms of lag at a 10ms step

    expect(update).toHaveBeenCalledTimes(3)
  })

  it('clamps huge stalls so the simulation cannot spiral', () => {
    const scheduler = createManualScheduler()
    const update = vi.fn()
    const loop = createLoop({
      step: 1 / 60,
      maxFrameTime: 0.1,
      update,
      render: noop,
      scheduler,
    })

    loop.start()
    scheduler.tick(0)
    scheduler.tick(5000) // a 5 second freeze

    expect(update).toHaveBeenCalledTimes(6)
  })

  it('reports interpolation progress to render', () => {
    const scheduler = createManualScheduler()
    const render = vi.fn()
    const loop = createLoop({ step: 0.01, update: noop, render, scheduler })

    loop.start()
    scheduler.tick(0)
    scheduler.tick(15)

    expect(render).toHaveBeenCalledTimes(2)
    expect(render.mock.lastCall?.[0]).toBeCloseTo(0.5, 10)
  })

  it('schedules and cancels exactly one pending frame', () => {
    const scheduler = createManualScheduler()
    const loop = createLoop({ step: 0.01, update: noop, render: noop, scheduler })

    expect(scheduler.pending).toBe(0)
    loop.start()
    expect(scheduler.pending).toBe(1)
    loop.start() // second start is a no-op
    expect(scheduler.pending).toBe(1)

    scheduler.tick(16)
    expect(scheduler.pending).toBe(1)

    loop.stop()
    expect(scheduler.pending).toBe(0)
    expect(loop.isRunning()).toBe(false)
  })

  it('does not update once stopped', () => {
    const scheduler = createManualScheduler()
    const update = vi.fn()
    const loop = createLoop({ step: 0.01, update, render: noop, scheduler })

    loop.start()
    loop.stop()

    expect(() => {
      scheduler.tick(100)
    }).toThrow('no frame scheduled')
    expect(update).not.toHaveBeenCalled()
  })

  it('restarts without replaying the gap spent stopped', () => {
    const scheduler = createManualScheduler()
    const update = vi.fn()
    const loop = createLoop({ step: 0.05, update, render: noop, scheduler })

    loop.start()
    scheduler.tick(0)
    loop.stop()

    loop.start()
    scheduler.tick(10_000) // the first frame only re-establishes the clock
    expect(update).not.toHaveBeenCalled()

    scheduler.tick(10_100) // 100ms later: one 50ms step, not a 10s backlog
    expect(update).toHaveBeenCalledTimes(1)
  })
})
