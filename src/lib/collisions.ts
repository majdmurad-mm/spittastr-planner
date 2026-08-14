import type { Instance, Pt } from '../types'
import { crossesShape, polygonsOverlap, worldPolygon } from './geometry2d'
import { plan } from './plan'

export type Severity = 'clash' | 'warn'

/**
 * Pull a polygon slightly toward its centroid.
 *
 * Snapping deliberately makes a piece's edge collinear with a wall, and exact
 * contact would otherwise read as an intersection. Testing a marginally smaller
 * footprint keeps flush placement clean while still catching real overlap.
 */
function shrink(poly: Pt[], by = 0.02): Pt[] {
  const n = poly.length
  const cx = poly.reduce((s, p) => s + p[0], 0) / n
  const cy = poly.reduce((s, p) => s + p[1], 0) / n
  return poly.map(([x, y]) => {
    const dx = x - cx
    const dy = y - cy
    const d = Math.hypot(dx, dy) || 1
    const f = Math.max(0, (d - by) / d)
    return [cx + dx * f, cy + dy * f] as Pt
  })
}

/**
 * Classify every on-plan piece.
 *   clash — overlaps another piece, a wall, or a built-in
 *   warn  — sits across a door swing
 */
export function findCollisions(instances: Instance[]): Map<string, Severity> {
  const out = new Map<string, Severity>()
  const onPlan = instances.filter((i) => i.onPlan)
  const polys = new Map(onPlan.map((i) => [i.id, worldPolygon(i)]))

  const flag = (id: string, severity: Severity) => {
    if (severity === 'clash' || !out.has(id)) out.set(id, severity)
  }

  for (let i = 0; i < onPlan.length; i++) {
    for (let j = i + 1; j < onPlan.length; j++) {
      const a = polys.get(onPlan[i].id)!
      const b = polys.get(onPlan[j].id)!
      if (polygonsOverlap(a, b)) {
        flag(onPlan[i].id, 'clash')
        flag(onPlan[j].id, 'clash')
      }
    }
  }

  for (const item of onPlan) {
    const tight = shrink(polys.get(item.id)!)
    const hitsStructure =
      plan.base.walls.some((w) => crossesShape(tight, w)) ||
      plan.base.builtins.some((b) => crossesShape(tight, b))
    if (hitsStructure) {
      flag(item.id, 'clash')
      continue
    }
    if (plan.base.windows.some((w) => crossesShape(tight, w))) flag(item.id, 'warn')
  }

  return out
}

/** Total footprint area of everything currently on the plan. */
export function occupiedArea(instances: Instance[]): number {
  let total = 0
  for (const item of instances) {
    if (!item.onPlan) continue
    const poly = worldPolygon(item)
    let a = 0
    for (let i = 0; i < poly.length; i++) {
      const [x0, y0] = poly[i]
      const [x1, y1] = poly[(i + 1) % poly.length]
      a += x0 * y1 - x1 * y0
    }
    total += Math.abs(a / 2)
  }
  return total
}
