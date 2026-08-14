// Small 2D geometry helpers shared by the extractor.

export function centroidOf(points) {
  // Area-weighted centroid for closed rings; falls back to vertex mean for
  // degenerate (zero-area) input such as a straight line.
  let a = 0
  let cx = 0
  let cy = 0
  const n = points.length
  for (let i = 0; i < n; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[(i + 1) % n]
    const cross = x0 * y1 - x1 * y0
    a += cross
    cx += (x0 + x1) * cross
    cy += (y0 + y1) * cross
  }
  a *= 0.5
  if (Math.abs(a) < 1e-9) {
    const mx = points.reduce((s, p) => s + p[0], 0) / n
    const my = points.reduce((s, p) => s + p[1], 0) / n
    return [mx, my]
  }
  return [cx / (6 * a), cy / (6 * a)]
}

export function areaOf(points) {
  let a = 0
  const n = points.length
  for (let i = 0; i < n; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[(i + 1) % n]
    a += x0 * y1 - x1 * y0
  }
  return Math.abs(a / 2)
}

export function bboxOf(points) {
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

// Andrew's monotone chain.
export function convexHull(points) {
  const pts = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1])
  if (pts.length < 3) return pts
  const cross = (o, a, b) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

  const lower = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

// Minimum-area enclosing rectangle via rotating calipers over hull edges.
// Returns { width, height, angle } with angle in radians describing the
// rectangle's local +X axis in world space.
export function minAreaRect(points) {
  const hull = convexHull(points)
  if (hull.length < 3) {
    // Degenerate: treat the segment itself as the local X axis.
    const bb = bboxOf(points)
    const dx = bb.maxX - bb.minX
    const dy = bb.maxY - bb.minY
    return { width: Math.hypot(dx, dy), height: 0, angle: Math.atan2(dy, dx) }
  }

  let best = null
  for (let i = 0; i < hull.length; i++) {
    const [x0, y0] = hull[i]
    const [x1, y1] = hull[(i + 1) % hull.length]
    const angle = Math.atan2(y1 - y0, x1 - x0)
    const cos = Math.cos(-angle)
    const sin = Math.sin(-angle)

    let minU = Infinity
    let maxU = -Infinity
    let minV = Infinity
    let maxV = -Infinity
    for (const [x, y] of hull) {
      const u = x * cos - y * sin
      const v = x * sin + y * cos
      if (u < minU) minU = u
      if (u > maxU) maxU = u
      if (v < minV) minV = v
      if (v > maxV) maxV = v
    }
    const w = maxU - minU
    const h = maxV - minV
    const area = w * h
    if (!best || area < best.area - 1e-12) best = { area, width: w, height: h, angle }
  }
  return { width: best.width, height: best.height, angle: best.angle }
}

// Express `points` in the local frame of a rectangle centred at `origin`
// and rotated by `angle` radians.
export function toLocalFrame(points, origin, angle) {
  const cos = Math.cos(-angle)
  const sin = Math.sin(-angle)
  return points.map(([x, y]) => {
    const dx = x - origin[0]
    const dy = y - origin[1]
    return [dx * cos - dy * sin, dx * sin + dy * cos]
  })
}

export function round(value, dp = 4) {
  const f = 10 ** dp
  return Math.round(value * f) / f
}

export function roundPoints(points, dp = 4) {
  return points.map(([x, y]) => [round(x, dp), round(y, dp)])
}
