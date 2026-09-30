import { describe, expect, it } from 'vitest'

import { clamp, distance, lerp } from './types'
import {
  SWAT_COOLDOWN,
  accuracy,
  createWorld,
  difficulty,
  swatReach,
  updateWorld,
  type Fly,
  type Intent,
  type World,
} from './world'

/** Deterministic RNG so every assertion below is reproducible. */
function seededRandom(seed = 1): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const VIEW = { width: 960, height: 540 } as const
const STEP = 1 / 60

function idleIntent(overrides: Partial<Intent> = {}): Intent {
  return { move: { x: 0, y: 0 }, pointer: null, swat: false, ...overrides }
}

function makeFly(x: number, y: number): Fly {
  return {
    prev: { x, y },
    pos: { x, y },
    vel: { x: 0, y: 80 },
    radius: 6,
    flap: 0,
    flash: 0,
  }
}

function run(world: World, steps: number, intent: Intent = idleIntent()): void {
  for (let i = 0; i < steps; i += 1) updateWorld(world, STEP, intent)
}

describe('math helpers', () => {
  it('clamps into range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })

  it('interpolates', () => {
    expect(lerp(10, 20, 0)).toBe(10)
    expect(lerp(10, 20, 0.5)).toBe(15)
  })

  it('measures distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })
})

describe('createWorld', () => {
  it('spawns the requested number of flies inside the playfield', () => {
    const world = createWorld(VIEW, { flyCount: 7, random: seededRandom() })

    expect(world.flies).toHaveLength(7)
    expect(world.score).toBe(0)
    expect(world.misses).toBe(0)
    for (const fly of world.flies) {
      expect(fly.pos.x).toBeGreaterThanOrEqual(0)
      expect(fly.pos.x).toBeLessThanOrEqual(VIEW.width)
      expect(fly.pos.y).toBeGreaterThanOrEqual(0)
      expect(fly.pos.y).toBeLessThanOrEqual(VIEW.height)
    }
  })
})

describe('updateWorld movement', () => {
  it('moves the swatter with keyboard input and normalises diagonals', () => {
    const world = createWorld(VIEW, { flyCount: 0, random: seededRandom() })
    const startX = world.swatter.pos.x
    const startY = world.swatter.pos.y

    run(world, 10, idleIntent({ move: { x: 1, y: -1 } }))

    expect(world.swatter.pos.x).toBeGreaterThan(startX)
    expect(world.swatter.pos.y).toBeLessThan(startY)
    // Diagonal travel must not exceed the speed of a cardinal move.
    const cardinal = createWorld(VIEW, { flyCount: 0, random: seededRandom() })
    run(cardinal, 10, idleIntent({ move: { x: 1, y: 0 } }))
    const diagonalDistance = distance(world.swatter.pos, { x: startX, y: startY })
    const cardinalDistance = distance(cardinal.swatter.pos, { x: startX, y: startY })
    expect(diagonalDistance).toBeCloseTo(cardinalDistance, 5)
  })

  it('tracks the pointer when no keys are held', () => {
    const world = createWorld(VIEW, { flyCount: 0, random: seededRandom() })
    const target = { x: 120, y: 90 }

    run(world, 30, idleIntent({ pointer: target }))

    expect(world.swatter.pos.x).toBeCloseTo(target.x, 0)
    expect(world.swatter.pos.y).toBeCloseTo(target.y, 0)
  })

  it('lets the keyboard win while keys are held', () => {
    const world = createWorld(VIEW, { flyCount: 0, random: seededRandom() })
    const before = { ...world.swatter.pos }

    run(world, 12, idleIntent({ pointer: { x: 0, y: 0 }, move: { x: 1, y: 0 } }))

    expect(world.swatter.pos.x).toBeGreaterThan(before.x)
    expect(world.swatter.pos.y).toBeCloseTo(before.y, 5)
  })

  it('never leaves the playfield', () => {
    const world = createWorld(VIEW, { flyCount: 0, random: seededRandom() })
    const corner = { x: -500, y: -500 }

    run(world, 60, idleIntent({ pointer: corner }))
    expect(world.swatter.pos.x).toBeGreaterThanOrEqual(world.swatter.radius)
    expect(world.swatter.pos.y).toBeGreaterThanOrEqual(world.swatter.radius)

    run(world, 120, idleIntent({ pointer: { x: 5000, y: 5000 } }))
    expect(world.swatter.pos.x).toBeLessThanOrEqual(VIEW.width - world.swatter.radius)
    expect(world.swatter.pos.y).toBeLessThanOrEqual(VIEW.height - world.swatter.radius)
  })
})

describe('swatting', () => {
  it('kills flies inside the reach and keeps the population constant', () => {
    const world = createWorld(VIEW, { flyCount: 2, random: seededRandom(42) })
    world.swatter.pos.x = 400
    world.swatter.pos.y = 300
    world.flies = [makeFly(400, 300), makeFly(400 + swatReach(world.swatter) + 80, 300)]

    updateWorld(world, STEP, idleIntent({ swat: true }))

    expect(world.score).toBe(1)
    expect(world.misses).toBe(0)
    expect(world.flies).toHaveLength(2)
  })

  it('counts a miss when nothing is in range', () => {
    const world = createWorld(VIEW, { flyCount: 0, random: seededRandom() })

    updateWorld(world, STEP, idleIntent({ swat: true }))

    expect(world.score).toBe(0)
    expect(world.misses).toBe(1)
  })

  it('enforces the cooldown between swings', () => {
    const world = createWorld(VIEW, { flyCount: 0, random: seededRandom() })

    updateWorld(world, STEP, idleIntent({ swat: true }))
    updateWorld(world, STEP, idleIntent({ swat: true }))
    expect(world.misses).toBe(1)

    run(world, Math.ceil(SWAT_COOLDOWN / STEP) + 1)
    updateWorld(world, STEP, idleIntent({ swat: true }))
    expect(world.misses).toBe(2)
  })

  it('kills every fly in reach at once', () => {
    const world = createWorld(VIEW, { flyCount: 3, random: seededRandom(7) })
    world.swatter.pos.x = 100
    world.swatter.pos.y = 100
    world.flies = [makeFly(100, 100), makeFly(110, 100), makeFly(100, 110)]

    updateWorld(world, STEP, idleIntent({ swat: true }))

    expect(world.score).toBe(3)
    expect(world.flies).toHaveLength(3)
  })

  it('reports accuracy and ramps difficulty', () => {
    const world = createWorld(VIEW, { flyCount: 0, random: seededRandom() })
    expect(accuracy(world)).toBe(1)
    expect(difficulty(world)).toBe(1)

    world.score = 3
    world.misses = 1
    expect(accuracy(world)).toBe(0.75)
    expect(difficulty(world)).toBeGreaterThan(1)
  })
})

describe('fly simulation', () => {
  it('keeps every fly inside the playfield over a long run', () => {
    const world = createWorld(VIEW, { flyCount: 6, random: seededRandom(3) })

    for (let i = 0; i < 600; i += 1) {
      updateWorld(world, STEP, idleIntent({ pointer: { x: 480, y: 270 } }))
      for (const fly of world.flies) {
        expect(fly.pos.x).toBeGreaterThanOrEqual(0)
        expect(fly.pos.x).toBeLessThanOrEqual(VIEW.width)
        expect(fly.pos.y).toBeGreaterThanOrEqual(0)
        expect(fly.pos.y).toBeLessThanOrEqual(VIEW.height)
      }
    }
  })

  it('flees from the swatter', () => {
    const world = createWorld(VIEW, { flyCount: 0, random: seededRandom(5) })
    const fly = makeFly(300, 300)
    fly.vel = { x: 0, y: 0 }
    world.flies = [fly]
    world.swatter.pos.x = 290
    world.swatter.pos.y = 300
    const startGap = distance(fly.pos, world.swatter.pos)

    run(world, 1)
    // Panic dominates the random jitter, so the very first step turns the fly away.
    expect(fly.vel.x).toBeGreaterThan(0)

    run(world, 30)
    expect(fly.pos.x).toBeGreaterThan(300)
    expect(distance(fly.pos, world.swatter.pos)).toBeGreaterThan(startGap)
  })

  it('never lets a fly stall', () => {
    const world = createWorld(VIEW, { flyCount: 0, random: seededRandom(9) })
    const fly = makeFly(300, 300)
    fly.vel = { x: 0, y: 0 }
    world.flies = [fly]

    run(world, 1)

    expect(Math.hypot(fly.vel.x, fly.vel.y)).toBeGreaterThan(0)
  })

  it('advances the animation clocks', () => {
    const world = createWorld(VIEW, { flyCount: 1, random: seededRandom(11) })
    const [fly] = world.flies
    if (!fly) throw new Error('expected one fly')

    run(world, 5)

    expect(fly.flap).toBeGreaterThan(0)
    expect(world.time).toBeCloseTo(5 * STEP, 5)
  })
})
