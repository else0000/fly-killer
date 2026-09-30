/** Shared geometry primitives. Kept dependency-free so every module can use them. */

export interface Vec2 {
  x: number
  y: number
}

export interface Size {
  readonly width: number
  readonly height: number
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
