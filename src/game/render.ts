/**
 * All canvas drawing. Reads the world, never mutates it.
 * Positions are interpolated by `alpha` so motion stays smooth above 60 Hz.
 */
import { lerp } from './types'
import { SWING_TIME, accuracy, swatReach, type Fly, type World } from './world'

const TAU = Math.PI * 2
const GRID = 48

export function render(context: CanvasRenderingContext2D, world: World, alpha: number): void {
  context.clearRect(0, 0, world.width, world.height)
  drawBackground(context, world)

  for (const fly of world.flies) drawFly(context, fly, alpha)
  drawSwatter(context, world, alpha)
  drawHud(context, world)
}

function drawBackground(context: CanvasRenderingContext2D, world: World): void {
  context.fillStyle = '#10151c'
  context.fillRect(0, 0, world.width, world.height)

  context.strokeStyle = 'rgba(148, 163, 184, 0.07)'
  context.lineWidth = 1
  context.beginPath()
  for (let x = GRID; x < world.width; x += GRID) {
    context.moveTo(x + 0.5, 0)
    context.lineTo(x + 0.5, world.height)
  }
  for (let y = GRID; y < world.height; y += GRID) {
    context.moveTo(0, y + 0.5)
    context.lineTo(world.width, y + 0.5)
  }
  context.stroke()
}

function drawFly(context: CanvasRenderingContext2D, fly: Fly, alpha: number): void {
  const x = lerp(fly.prev.x, fly.pos.x, alpha)
  const y = lerp(fly.prev.y, fly.pos.y, alpha)
  const heading = Math.atan2(fly.vel.y, fly.vel.x)
  const flap = Math.sin(fly.flap)
  const r = fly.radius

  context.save()
  context.translate(x, y)

  // Ground shadow makes the fly read as "above" the surface.
  context.fillStyle = 'rgba(0, 0, 0, 0.35)'
  context.beginPath()
  context.ellipse(1.5, r * 0.9, r * 0.8, r * 0.35, 0, 0, TAU)
  context.fill()

  context.rotate(heading)

  // Wings: two translucent blades that scale with the flap.
  context.fillStyle = 'rgba(203, 213, 225, 0.45)'
  for (const side of [-1, 1]) {
    context.beginPath()
    context.ellipse(
      -r * 0.3,
      side * r * 0.75,
      r * 1.5,
      r * 0.55 * (0.4 + Math.abs(flap)),
      0,
      0,
      TAU,
    )
    context.fill()
  }

  // Body + head.
  context.fillStyle = fly.flash > 0 ? '#f8fafc' : '#2b3440'
  context.beginPath()
  context.ellipse(0, 0, r * 1.25, r * 0.9, 0, 0, TAU)
  context.fill()
  context.beginPath()
  context.arc(r * 1.05, 0, r * 0.62, 0, TAU)
  context.fill()

  context.fillStyle = '#e11d48'
  context.beginPath()
  context.arc(r * 1.2, -r * 0.22, r * 0.2, 0, TAU)
  context.fill()

  context.restore()
}

function drawSwatter(context: CanvasRenderingContext2D, world: World, alpha: number): void {
  const swatter = world.swatter
  const x = lerp(swatter.prev.x, swatter.pos.x, alpha)
  const y = lerp(swatter.prev.y, swatter.pos.y, alpha)
  const reach = swatReach(swatter)
  const progress = swatter.swing / SWING_TIME
  const ready = world.cooldown <= 0

  // Telegraph the hit area so aiming is learnable.
  context.beginPath()
  context.arc(x, y, reach, 0, TAU)
  context.fillStyle = `rgba(94, 234, 212, ${0.03 + progress * 0.12})`
  context.fill()
  context.strokeStyle = ready ? 'rgba(94, 234, 212, 0.5)' : 'rgba(148, 163, 184, 0.18)'
  context.lineWidth = 1.5 + progress * 2
  context.stroke()

  context.save()
  context.translate(x, y)
  context.rotate(-progress * 0.8)
  const size = swatter.radius * (1 + progress * 0.35)

  // Handle.
  context.strokeStyle = ready ? '#8d6e4f' : '#5b5348'
  context.lineWidth = 5
  context.lineCap = 'round'
  context.beginPath()
  context.moveTo(0, 0)
  context.lineTo(size * 2.4, size * 1.9)
  context.stroke()

  // Mesh head with a visible wire pattern.
  context.fillStyle = ready ? 'rgba(148, 163, 184, 0.22)' : 'rgba(148, 163, 184, 0.1)'
  context.strokeStyle = ready ? '#cbd5e1' : '#64748b'
  context.lineWidth = 2
  context.beginPath()
  context.rect(-size, -size, size * 2, size * 2)
  context.fill()
  context.stroke()

  context.strokeStyle = ready ? 'rgba(203, 213, 225, 0.5)' : 'rgba(100, 116, 139, 0.35)'
  context.lineWidth = 1
  context.beginPath()
  for (let i = 1; i < 3; i += 1) {
    const offset = -size + (size * 2 * i) / 3
    context.moveTo(offset, -size)
    context.lineTo(offset, size)
    context.moveTo(-size, offset)
    context.lineTo(size, offset)
  }
  context.stroke()
  context.restore()
}

function drawHud(context: CanvasRenderingContext2D, world: World): void {
  context.save()
  context.textBaseline = 'top'
  context.font = '700 30px ui-sans-serif, system-ui, sans-serif'

  context.fillStyle = '#5eead4'
  context.textAlign = 'left'
  context.fillText(`Swatted ${world.score}`, 20, 18)

  context.font = '600 16px ui-sans-serif, system-ui, sans-serif'
  context.fillStyle = 'rgba(148, 163, 184, 0.85)'
  context.fillText(`Missed ${world.misses}`, 20, 56)

  const hits = Math.round(accuracy(world) * 100)
  context.textAlign = 'right'
  context.fillText(`${hits}% accuracy`, world.width - 20, 18)
  context.restore()
}
