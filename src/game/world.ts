/**
 * The entire game simulation. Pure data in, pure data out: no DOM, no canvas,
 * no globals other than the injectable RNG. `updateWorld` is the only mutator.
 */
import { clamp, distance, type Size, type Vec2 } from './types'

export const SWAT_COOLDOWN = 0.2
export const SWAT_REACH = 46
export const SWING_TIME = 0.14

const SWATTER_RADIUS = 15
const KEYBOARD_SPEED = 280
const POINTER_SPEED = 1600
const FLY_RADIUS = 6
const FLY_MIN_SPEED = 75
const FLY_MAX_SPEED = 135
const FLY_WANDER = 300
const FLY_FLEE_RADIUS = 145
const FLY_FLEE_FORCE = 1200
const FLY_SPAWN_CLEARANCE = 180
const SPAWN_ATTEMPTS = 12
const DIFFICULTY_PER_KILL = 0.03
const DIFFICULTY_CAP = 2.2

export interface Intent {
  /** -1..1 per axis; ignored when the pointer is driving the swatter. */
  readonly move: Vec2
  /** Pointer position in logical pixels, or null when the pointer is away. */
  readonly pointer: Vec2 | null
  /** Edge-triggered swat request for this step. */
  readonly swat: boolean
}

export interface Fly {
  /** Position at the end of the previous step; used for interpolation. */
  prev: Vec2
  pos: Vec2
  vel: Vec2
  readonly radius: number
  /** Wing-flap animation clock, in seconds. */
  flap: number
  /** Counts down while the fly flashes from a near miss, in seconds. */
  flash: number
}

export interface Swatter {
  prev: Vec2
  pos: Vec2
  readonly radius: number
  /** Seconds left in the swing animation; 0 when idle. */
  swing: number
}

export interface World {
  readonly width: number
  readonly height: number
  readonly swatter: Swatter
  readonly random: () => number
  flies: Fly[]
  score: number
  misses: number
  time: number
  /** Seconds until the next swing is allowed. */
  cooldown: number
}

export interface WorldOptions {
  readonly flyCount?: number
  readonly random?: () => number
}

/** How far a swing reaches from the swatter's centre. */
export function swatReach(swatter: Swatter): number {
  return swatter.radius + SWAT_REACH
}

export function accuracy(world: World): number {
  const attempts = world.score + world.misses
  return attempts === 0 ? 1 : world.score / attempts
}

/** Flies get faster and more skittish as the score climbs. */
export function difficulty(world: World): number {
  return Math.min(1 + world.score * DIFFICULTY_PER_KILL, DIFFICULTY_CAP)
}

export function createWorld(view: Size, options: WorldOptions = {}): World {
  const random = options.random ?? Math.random
  const world: World = {
    width: view.width,
    height: view.height,
    swatter: {
      prev: { x: view.width / 2, y: view.height * 0.75 },
      pos: { x: view.width / 2, y: view.height * 0.75 },
      radius: SWATTER_RADIUS,
      swing: 0,
    },
    flies: [],
    score: 0,
    misses: 0,
    time: 0,
    cooldown: 0,
    random,
  }

  const count = options.flyCount ?? 5
  for (let i = 0; i < count; i += 1) world.flies.push(spawnFly(world))

  return world
}

export function updateWorld(world: World, dt: number, intent: Intent): void {
  world.time += dt
  world.cooldown = Math.max(0, world.cooldown - dt)
  world.swatter.swing = Math.max(0, world.swatter.swing - dt)

  moveSwatter(world, dt, intent)
  updateFlies(world, dt)
  if (intent.swat) swing(world)
}

function moveSwatter(world: World, dt: number, intent: Intent): void {
  const swatter = world.swatter
  swatter.prev.x = swatter.pos.x
  swatter.prev.y = swatter.pos.y

  const keyboardActive = intent.move.x !== 0 || intent.move.y !== 0
  const pointer = keyboardActive ? null : intent.pointer

  if (pointer) {
    const dx = pointer.x - swatter.pos.x
    const dy = pointer.y - swatter.pos.y
    const gap = Math.hypot(dx, dy)
    if (gap > 0.5) {
      const travel = Math.min(gap, POINTER_SPEED * dt)
      swatter.pos.x += (dx / gap) * travel
      swatter.pos.y += (dy / gap) * travel
    }
  } else {
    const length = Math.hypot(intent.move.x, intent.move.y) || 1
    swatter.pos.x += (intent.move.x / length) * KEYBOARD_SPEED * dt
    swatter.pos.y += (intent.move.y / length) * KEYBOARD_SPEED * dt
  }

  swatter.pos.x = clamp(swatter.pos.x, swatter.radius, world.width - swatter.radius)
  swatter.pos.y = clamp(swatter.pos.y, swatter.radius, world.height - swatter.radius)
}

function updateFlies(world: World, dt: number): void {
  const swatter = world.swatter
  const pace = difficulty(world)

  for (const fly of world.flies) {
    fly.prev.x = fly.pos.x
    fly.prev.y = fly.pos.y
    fly.flap += dt * (10 + Math.hypot(fly.vel.x, fly.vel.y) / 12)
    fly.flash = Math.max(0, fly.flash - dt)

    // Panic away from the swatter when it gets close.
    const awayX = fly.pos.x - swatter.pos.x
    const awayY = fly.pos.y - swatter.pos.y
    const gap = Math.hypot(awayX, awayY)
    if (gap < FLY_FLEE_RADIUS && gap > 1e-6) {
      const panic = (1 - gap / FLY_FLEE_RADIUS) * FLY_FLEE_FORCE * pace * dt
      fly.vel.x += (awayX / gap) * panic
      fly.vel.y += (awayY / gap) * panic
    }

    // Jitter so they never fly in a straight line.
    fly.vel.x += (world.random() - 0.5) * FLY_WANDER * dt
    fly.vel.y += (world.random() - 0.5) * FLY_WANDER * dt

    // Keep every fly inside a readable speed band.
    const speed = Math.hypot(fly.vel.x, fly.vel.y)
    const target = speed === 0 ? FLY_MIN_SPEED : clamp(speed, FLY_MIN_SPEED, FLY_MAX_SPEED * pace)
    if (speed === 0) {
      const angle = world.random() * Math.PI * 2
      fly.vel.x = Math.cos(angle) * target
      fly.vel.y = Math.sin(angle) * target
    } else if (speed !== target) {
      fly.vel.x = (fly.vel.x / speed) * target
      fly.vel.y = (fly.vel.y / speed) * target
    }

    fly.pos.x += fly.vel.x * dt
    fly.pos.y += fly.vel.y * dt

    // Bounce off the walls, never off the screen.
    const r = fly.radius
    if (fly.pos.x < r) {
      fly.pos.x = r
      fly.vel.x = Math.abs(fly.vel.x)
    } else if (fly.pos.x > world.width - r) {
      fly.pos.x = world.width - r
      fly.vel.x = -Math.abs(fly.vel.x)
    }
    if (fly.pos.y < r) {
      fly.pos.y = r
      fly.vel.y = Math.abs(fly.vel.y)
    } else if (fly.pos.y > world.height - r) {
      fly.pos.y = world.height - r
      fly.vel.y = -Math.abs(fly.vel.y)
    }
  }
}

function swing(world: World): void {
  if (world.cooldown > 0) return
  world.cooldown = SWAT_COOLDOWN
  world.swatter.swing = SWING_TIME

  const swatter = world.swatter
  const reach = swatReach(swatter)
  const survivors: Fly[] = []
  let killed = 0

  for (const fly of world.flies) {
    if (distance(fly.pos, swatter.pos) <= reach + fly.radius) killed += 1
    else survivors.push(fly)
  }

  if (killed === 0) {
    world.misses += 1
    return
  }

  world.score += killed
  world.flies = survivors
  // Keep the population constant so difficulty never collapses.
  for (let i = 0; i < killed; i += 1) survivors.push(spawnFly(world))
}

function spawnFly(world: World): Fly {
  let pos = edgePoint(world)
  for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt += 1) {
    if (distance(pos, world.swatter.pos) > FLY_SPAWN_CLEARANCE) break
    pos = edgePoint(world)
  }

  const angle = world.random() * Math.PI * 2
  const speed = FLY_MIN_SPEED + world.random() * (FLY_MAX_SPEED - FLY_MIN_SPEED)

  return {
    prev: { x: pos.x, y: pos.y },
    pos,
    vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
    radius: FLY_RADIUS,
    flap: world.random() * Math.PI * 2,
    flash: 0,
  }
}

/** A random point on the playfield border, so flies enter from off-stage. */
function edgePoint(world: World): Vec2 {
  const inset = FLY_RADIUS + 4
  switch (Math.floor(world.random() * 4)) {
    case 0:
      return { x: inset, y: world.random() * world.height }
    case 1:
      return { x: world.width - inset, y: world.random() * world.height }
    case 2:
      return { x: world.random() * world.width, y: inset }
    default:
      return { x: world.random() * world.width, y: world.height - inset }
  }
}
