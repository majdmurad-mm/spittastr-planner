// Why is a piece flagged? Report which base-plan shape it crosses and how deep.
import fs from 'node:fs'

const plan = JSON.parse(fs.readFileSync(new URL('../src/data/floorplan.json', import.meta.url)))

const rot = ([x, y], deg) => {
  const a = (deg * Math.PI) / 180
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]
}
const world = (c) =>
  c.footprint.map((p) => {
    const r = rot(p, c.rotation)
    return [c.position[0] + r[0], c.position[1] + r[1]]
  })

const bbox = (pts) => ({
  minX: Math.min(...pts.map((p) => p[0])),
  maxX: Math.max(...pts.map((p) => p[0])),
  minY: Math.min(...pts.map((p) => p[1])),
  maxY: Math.max(...pts.map((p) => p[1])),
})

// How far does a segment penetrate the piece's bbox?
function penetration(poly, a, b) {
  const B = bbox(poly)
  const inside = (p) => p[0] >= B.minX && p[0] <= B.maxX && p[1] >= B.minY && p[1] <= B.maxY
  // Sample the segment; measure the deepest inset from the nearest bbox edge.
  let deepest = 0
  const steps = 200
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    if (!inside(p)) continue
    const d = Math.min(p[0] - B.minX, B.maxX - p[0], p[1] - B.minY, B.maxY - p[1])
    if (d > deepest) deepest = d
  }
  return deepest
}

for (const c of plan.catalog.filter((x) => x.placed)) {
  const poly = world(c)
  const hits = []
  for (const [layer, shapes] of Object.entries(plan.base)) {
    shapes.forEach((s, si) => {
      const limit = s.closed ? s.points.length : s.points.length - 1
      let worst = 0
      for (let i = 0; i < limit; i++) {
        const d = penetration(poly, s.points[i], s.points[(i + 1) % s.points.length])
        if (d > worst) worst = d
      }
      if (worst > 0.001) hits.push(`${layer}[${si}] ${(worst * 100).toFixed(1)}cm`)
    })
  }
  console.log(`${c.label.padEnd(12)} ${hits.length ? hits.join('  ') : 'clear'}`)
}
