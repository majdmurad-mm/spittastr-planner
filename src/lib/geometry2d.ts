import type { Instance, Pt, Shape } from '../types'

export const deg2rad = (d: number) => (d * Math.PI) / 180

/** Footprint of an instance in world (plan) coordinates. */
export function worldPolygon(item: Instance): Pt[] {
  const a = deg2rad(item.rotation)
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const [cx, cy] = item.position
  return item.footprint.map(([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos])
}

export function bbox(points: Pt[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

function boxesOverlap(a: Pt[], b: Pt[], pad = 0) {
  const A = bbox(a)
  const B = bbox(b)
  return !(A.maxX + pad < B.minX || B.maxX + pad < A.minX || A.maxY + pad < B.minY || B.maxY + pad < A.minY)
}

/**
 * Separating Axis Theorem for two convex-ish polygons. Furniture footprints are
 * rectangles or near-rectangles, so SAT is exact here and cheap.
 * `tolerance` lets pieces touch without registering as a clash.
 */
export function polygonsOverlap(a: Pt[], b: Pt[], tolerance = 0.005): boolean {
  if (!boxesOverlap(a, b)) return false

  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const [x0, y0] = poly[i]
      const [x1, y1] = poly[(i + 1) % poly.length]
      // Axis perpendicular to this edge.
      let nx = -(y1 - y0)
      let ny = x1 - x0
      const len = Math.hypot(nx, ny)
      if (len < 1e-9) continue
      nx /= len
      ny /= len

      let minA = Infinity
      let maxA = -Infinity
      for (const [x, y] of a) {
        const p = x * nx + y * ny
        if (p < minA) minA = p
        if (p > maxA) maxA = p
      }
      let minB = Infinity
      let maxB = -Infinity
      for (const [x, y] of b) {
        const p = x * nx + y * ny
        if (p < minB) minB = p
        if (p > maxB) maxB = p
      }
      // A gap on any axis means no overlap.
      if (maxA - tolerance < minB || maxB - tolerance < minA) return false
    }
  }
  return true
}

function segmentsIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0])
  if (Math.abs(d) < 1e-12) return false
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}

export function pointInPolygon(pt: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    const hits = yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi
    if (hits) inside = !inside
  }
  return inside
}

/** Does a footprint cross any segment of an open/closed base-plan shape? */
export function crossesShape(poly: Pt[], shape: Shape): boolean {
  const pts = shape.points
  if (pts.length < 2) return false
  if (!boxesOverlap(poly, pts)) return false

  const limit = shape.closed ? pts.length : pts.length - 1
  for (let i = 0; i < limit; i++) {
    const w1 = pts[i]
    const w2 = pts[(i + 1) % pts.length]
    for (let j = 0; j < poly.length; j++) {
      if (segmentsIntersect(poly[j], poly[(j + 1) % poly.length], w1, w2)) return true
    }
  }
  return false
}

/** Axis-aligned edge segments of the base plan, used for magnetic snapping. */
export interface WallSegment {
  a: Pt
  b: Pt
  /** Unit direction. */
  dir: Pt
}

export function collectSegments(shapes: Shape[]): WallSegment[] {
  const out: WallSegment[] = []
  for (const s of shapes) {
    const limit = s.closed ? s.points.length : s.points.length - 1
    for (let i = 0; i < limit; i++) {
      const a = s.points[i]
      const b = s.points[(i + 1) % s.points.length]
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const len = Math.hypot(dx, dy)
      if (len < 0.05) continue // ignore slivers
      out.push({ a, b, dir: [dx / len, dy / len] })
    }
  }
  return out
}
