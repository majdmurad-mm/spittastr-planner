import type { Pt } from '../types'

/**
 * Top-down furniture symbols, drawn parametrically from each piece's own
 * dimensions.
 *
 * The CAD file has no block definitions — Majd's furniture is plain polylines
 * and Laura's pieces are generated rectangles — so these symbols are authored
 * here rather than imported. Each returns primitives in the piece's local
 * frame: origin at the centre, spanning [-w/2, w/2] x [-h/2, h/2].
 */

export type Prim =
  | { k: 'poly'; pts: Pt[]; closed?: boolean; filled?: boolean; light?: boolean }
  | { k: 'arc'; cx: number; cy: number; r: number; from: number; to: number; light?: boolean }
  | { k: 'circle'; cx: number; cy: number; r: number; filled?: boolean; light?: boolean }

const rect = (x0: number, y0: number, x1: number, y1: number, filled = false): Prim => ({
  k: 'poly',
  pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
  closed: true,
  filled,
})

const line = (x0: number, y0: number, x1: number, y1: number, light = false): Prim => ({
  k: 'poly',
  pts: [[x0, y0], [x1, y1]],
  light,
})

/** Rotate every primitive a quarter turn, for pieces whose long axis is Y. */
function turn(prims: Prim[]): Prim[] {
  const rot = ([x, y]: Pt): Pt => [-y, x]
  return prims.map((p) => {
    if (p.k === 'poly') return { ...p, pts: p.pts.map(rot) }
    if (p.k === 'circle') {
      const [cx, cy] = rot([p.cx, p.cy])
      return { ...p, cx, cy }
    }
    const [cx, cy] = rot([p.cx, p.cy])
    return { ...p, cx, cy, from: p.from + 90, to: p.to + 90 }
  })
}

/**
 * Build a symbol in a frame where `a` is the long axis and `b` the short one,
 * then turn it back if the piece is actually taller than it is wide.
 */
function oriented(w: number, h: number, build: (a: number, b: number) => Prim[]): Prim[] {
  return w >= h ? build(w, h) : turn(build(h, w))
}

// --- individual symbols ----------------------------------------------------

// Head at the -X end, pillows across it, duvet turned down.
const bed = (w: number, h: number): Prim[] =>
  oriented(w, h, (a, b) => {
    const inset = Math.min(0.03, b * 0.05)
    const pillowDepth = Math.min(0.32, a * 0.2)
    const duvetAt = -a / 2 + pillowDepth + 0.06
    const twin = b > 1.2 // two pillows on a double
    const out: Prim[] = [rect(-a / 2 + inset, -b / 2 + inset, a / 2 - inset, b / 2 - inset)]

    if (twin) {
      const gap = 0.04
      out.push(
        rect(-a / 2 + 0.07, -b / 2 + 0.09, -a / 2 + pillowDepth, -gap / 2),
        rect(-a / 2 + 0.07, gap / 2, -a / 2 + pillowDepth, b / 2 - 0.09),
      )
    } else {
      out.push(rect(-a / 2 + 0.07, -b / 2 + 0.1, -a / 2 + pillowDepth, b / 2 - 0.1))
    }
    out.push(line(duvetAt, -b / 2 + inset, duvetAt, b / 2 - inset))
    return out
  })

// Back along the long side at -Y, arms at each end, cushion divisions.
const sofa = (w: number, h: number): Prim[] =>
  oriented(w, h, (a, b) => {
    const back = Math.min(0.22, b * 0.28)
    const arm = Math.min(0.2, a * 0.12)
    const seats = Math.max(2, Math.round(a / 0.85))
    const out: Prim[] = [
      line(-a / 2, -b / 2 + back, a / 2, -b / 2 + back),
      line(-a / 2 + arm, -b / 2 + back, -a / 2 + arm, b / 2),
      line(a / 2 - arm, -b / 2 + back, a / 2 - arm, b / 2),
    ]
    const seatW = (a - arm * 2) / seats
    for (let i = 1; i < seats; i++) {
      const x = -a / 2 + arm + seatW * i
      out.push(line(x, -b / 2 + back, x, b / 2 - 0.04, true))
    }
    return out
  })

// Seat square with a backrest at -Y.
const chair = (w: number, h: number): Prim[] => {
  const back = Math.min(0.1, h * 0.22)
  return [
    rect(-w / 2 + 0.03, -h / 2 + back, w / 2 - 0.03, h / 2 - 0.03),
    rect(-w / 2, -h / 2, w / 2, -h / 2 + back, true),
  ]
}

// Armchair: seat plus wrapping arms.
const armchair = (w: number, h: number): Prim[] => {
  const back = Math.min(0.12, h * 0.24)
  const arm = Math.min(0.11, w * 0.2)
  return [
    rect(-w / 2, -h / 2, w / 2, -h / 2 + back, true),
    rect(-w / 2, -h / 2, -w / 2 + arm, h / 2 - 0.04, true),
    rect(w / 2 - arm, -h / 2, w / 2, h / 2 - 0.04, true),
    rect(-w / 2 + arm, -h / 2 + back, w / 2 - arm, h / 2 - 0.04),
  ]
}

// Plain worksurface with a subtle inset edge.
const table = (w: number, h: number): Prim[] => [
  rect(-w / 2 + 0.03, -h / 2 + 0.03, w / 2 - 0.03, h / 2 - 0.03),
]

// Desk: worksurface plus a drawer bank at one end.
const desk = (w: number, h: number): Prim[] =>
  oriented(w, h, (a, b) => {
    const bank = Math.min(0.42, a * 0.3)
    return [
      rect(-a / 2 + 0.02, -b / 2 + 0.02, a / 2 - 0.02, b / 2 - 0.02),
      line(a / 2 - bank, -b / 2 + 0.02, a / 2 - bank, b / 2 - 0.02),
      line(a / 2 - bank, -b / 6, a / 2 - 0.02, -b / 6, true),
      line(a / 2 - bank, b / 6, a / 2 - 0.02, b / 6, true),
    ]
  })

// Chest of drawers: stacked drawer fronts, handles facing +Y.
const dresser = (w: number, h: number): Prim[] =>
  oriented(w, h, (a, b) => {
    const drawers = Math.max(2, Math.min(4, Math.round(a / 0.45)))
    const out: Prim[] = [rect(-a / 2, -b / 2, a / 2, b / 2)]
    const dw = a / drawers
    for (let i = 0; i < drawers; i++) {
      const x0 = -a / 2 + dw * i
      if (i > 0) out.push(line(x0, -b / 2, x0, b / 2))
      out.push(line(x0 + dw * 0.3, b / 2 - 0.05, x0 + dw * 0.7, b / 2 - 0.05, true))
    }
    return out
  })

// Wardrobe: carcass, door split, and swing arcs opening toward +Y.
const wardrobe = (w: number, h: number): Prim[] =>
  oriented(w, h, (a, b) => {
    const leaf = a / 2
    return [
      rect(-a / 2, -b / 2, a / 2, b / 2),
      line(0, -b / 2, 0, b / 2),
      { k: 'arc', cx: -a / 2, cy: b / 2, r: leaf, from: -90, to: 0, light: true },
      { k: 'arc', cx: a / 2, cy: b / 2, r: leaf, from: 180, to: 270, light: true },
      line(-a / 2, b / 2, -a / 2, b / 2 + leaf, true),
      line(a / 2, b / 2, a / 2, b / 2 + leaf, true),
    ]
  })

// Open shelving: a grid of cubbies (Kallax, Ivar).
const shelving = (w: number, h: number, cubeHint?: number): Prim[] =>
  oriented(w, h, (a, b) => {
    const cube = cubeHint ?? 0.39
    const cols = Math.max(1, Math.round(a / cube))
    const out: Prim[] = [rect(-a / 2, -b / 2, a / 2, b / 2)]
    for (let i = 1; i < cols; i++) {
      const x = -a / 2 + (a / cols) * i
      out.push(line(x, -b / 2, x, b / 2))
    }
    return out
  })

// Upright piano: case with a keyboard band along the long side.
const piano = (w: number, h: number): Prim[] =>
  oriented(w, h, (a, b) => {
    const keys = Math.min(0.12, b * 0.45)
    const out: Prim[] = [
      rect(-a / 2, -b / 2, a / 2, b / 2),
      line(-a / 2, b / 2 - keys, a / 2, b / 2 - keys),
    ]
    const n = Math.round(a / 0.06)
    for (let i = 1; i < n; i++) {
      const x = -a / 2 + (a / n) * i
      out.push(line(x, b / 2 - keys, x, b / 2, true))
    }
    return out
  })

// Rowing machine: rail along the long axis with a seat block.
const rowing = (w: number, h: number): Prim[] =>
  oriented(w, h, (a, b) => [
    rect(-a / 2, -b / 2, -a / 2 + b * 0.55, b / 2),
    line(-a / 2 + b * 0.55, 0, a / 2, 0),
    rect(a / 2 - b * 0.75, -b * 0.3, a / 2 - b * 0.25, b * 0.3),
    line(a / 2, -b / 2, a / 2, b / 2),
  ])

// Fallback: crossed diagonals, the CAD convention for an unspecified block.
const generic = (w: number, h: number): Prim[] => [
  line(-w / 2, -h / 2, w / 2, h / 2, true),
  line(-w / 2, h / 2, w / 2, -h / 2, true),
]

// --- dispatch --------------------------------------------------------------

/** Match on the label, most specific first. */
const RULES: [RegExp, (w: number, h: number) => Prim[]][] = [
  [/\bbed\b|bett/i, bed],
  [/couch|sofa/i, sofa],
  [/sessel|armchair/i, armchair],
  [/\bchair\b|stuhl/i, chair],
  [/kallax/i, (w, h) => shelving(w, h, 0.39)],
  [/ivar|regal|shelf|bookcase/i, (w, h) => shelving(w, h, 0.42)],
  [/closet|schrank|wardrobe/i, wardrobe],
  [/komode|kommode|dresser|nachttisch|sideboard/i, dresser],
  [/klavier|piano/i, piano],
  [/rowing|rudern/i, rowing],
  [/desk|schreibtisch/i, desk],
  [/table|tisch/i, table],
]

export function symbolFor(label: string, w: number, h: number): Prim[] {
  for (const [pattern, build] of RULES) {
    if (pattern.test(label)) return build(w, h)
  }
  return generic(w, h)
}
