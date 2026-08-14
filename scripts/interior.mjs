// Derive the apartment's interior from wall geometry.
//
// The CAD file has no closed room boundary — walls are drawn as open traces and
// thick bands, so no single curve can be treated as the envelope. Instead:
// rasterise every wall segment into a grid, flood-fill inward from the outside,
// and whatever is neither wall nor outside is interior floor.
//
// This is robust against gaps, overlaps and duplicate geometry in the source.

const CELL = 0.02 // metres per cell — 2 cm

export function computeInterior(shapes, extent, { cell = CELL, margin = 0.5 } = {}) {
  const minX = extent.minX - margin
  const minY = extent.minY - margin
  const cols = Math.ceil((extent.maxX + margin - minX) / cell)
  const rows = Math.ceil((extent.maxY + margin - minY) / cell)

  // 0 = free, 1 = wall, 2 = outside
  const grid = new Uint8Array(cols * rows)
  const at = (c, r) => r * cols + c

  const markCell = (c, r) => {
    if (c >= 0 && c < cols && r >= 0 && r < rows) grid[at(c, r)] = 1
  }

  // Stamp a segment into the grid, thickened by one cell so hairline gaps
  // between coincident wall traces don't leak.
  const stampSegment = (a, b) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const steps = Math.max(1, Math.ceil(len / (cell * 0.5)))
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const x = a[0] + (b[0] - a[0]) * t
      const y = a[1] + (b[1] - a[1]) * t
      const c = Math.floor((x - minX) / cell)
      const r = Math.floor((y - minY) / cell)
      for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) markCell(c + dc, r + dr)
    }
  }

  for (const s of shapes) {
    const limit = s.closed ? s.points.length : s.points.length - 1
    for (let i = 0; i < limit; i++) stampSegment(s.points[i], s.points[(i + 1) % s.points.length])
  }

  // Flood from the border: everything reachable without crossing a wall is
  // outside the apartment.
  const stack = []
  for (let c = 0; c < cols; c++) {
    stack.push([c, 0], [c, rows - 1])
  }
  for (let r = 0; r < rows; r++) {
    stack.push([0, r], [cols - 1, r])
  }
  while (stack.length) {
    const [c, r] = stack.pop()
    if (c < 0 || c >= cols || r < 0 || r >= rows) continue
    const i = at(c, r)
    if (grid[i] !== 0) continue
    grid[i] = 2
    stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1])
  }

  // Remaining free cells are enclosed floor. Group into rooms.
  const cellArea = cell * cell
  const rooms = []
  const seen = new Uint8Array(cols * rows)

  for (let r0 = 0; r0 < rows; r0++) {
    for (let c0 = 0; c0 < cols; c0++) {
      const i0 = at(c0, r0)
      if (grid[i0] !== 0 || seen[i0]) continue

      let count = 0
      let sx = 0
      let sy = 0
      let bMinX = Infinity
      let bMinY = Infinity
      let bMaxX = -Infinity
      let bMaxY = -Infinity
      const q = [[c0, r0]]
      seen[i0] = 1

      while (q.length) {
        const [c, r] = q.pop()
        count++
        const x = minX + (c + 0.5) * cell
        const y = minY + (r + 0.5) * cell
        sx += x
        sy += y
        if (x < bMinX) bMinX = x
        if (y < bMinY) bMinY = y
        if (x > bMaxX) bMaxX = x
        if (y > bMaxY) bMaxY = y

        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const c2 = c + dc
          const r2 = r + dr
          if (c2 < 0 || c2 >= cols || r2 < 0 || r2 >= rows) continue
          const i2 = at(c2, r2)
          if (grid[i2] !== 0 || seen[i2]) continue
          seen[i2] = 1
          q.push([c2, r2])
        }
      }

      const area = count * cellArea
      // Ignore slivers trapped inside wall bands.
      if (area < 0.5) continue
      rooms.push({
        area: Math.round(area * 100) / 100,
        centroid: [Math.round((sx / count) * 100) / 100, Math.round((sy / count) * 100) / 100],
        bounds: {
          minX: Math.round(bMinX * 100) / 100,
          minY: Math.round(bMinY * 100) / 100,
          maxX: Math.round(bMaxX * 100) / 100,
          maxY: Math.round(bMaxY * 100) / 100,
        },
      })
    }
  }

  rooms.sort((a, b) => b.area - a.area)
  const interiorArea = Math.round(rooms.reduce((s, r) => s + r.area, 0) * 100) / 100
  return { interiorArea, rooms }
}
