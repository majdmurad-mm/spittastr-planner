// Render floorplan.json to a standalone SVG, matching the app's paper theme.
//
//   node scripts/snapshot.mjs [out.svg] [--all]
//
// Imports the app's own symbol library (Node strips the TypeScript), so the
// snapshot and the canvas cannot drift apart.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { symbolFor } from '../src/lib/symbols.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROJECT = path.resolve(HERE, '..')
const plan = JSON.parse(fs.readFileSync(path.join(PROJECT, 'src/data/floorplan.json'), 'utf8'))

const args = process.argv.slice(2)
const SHOW_ALL = args.includes('--all')
const OUT = args.find((a) => !a.startsWith('--')) ?? path.join(PROJECT, 'plan-snapshot.svg')

const T = {
  bg: '#f4f1ea',
  wall: '#23262f',
  builtin: '#8d8778',
  builtinFill: 'rgba(141,135,120,.14)',
  door: '#9a958a',
  window: '#3f4854',
  glass: '#ffffff',
  label: '#3a3f4b',
  majd: '#2a5db0',
  laura: '#b8288f',
}

const S = 46 // px per metre
const PAD = 30
const flip = ([x, y]) => [x, -y]

const shown = plan.catalog.filter((c) => SHOW_ALL || c.placed)

const basePts = [
  ...plan.base.walls, ...plan.base.windows, ...plan.base.doors, ...plan.base.builtins,
].flatMap((s) => s.points.map(flip))
const allPts = [...basePts, ...shown.map((c) => flip(c.position))]

const minX = Math.min(...allPts.map((p) => p[0])) - 0.6
const maxX = Math.max(...allPts.map((p) => p[0])) + 0.6
const minY = Math.min(...allPts.map((p) => p[1])) - 0.6
const maxY = Math.max(...allPts.map((p) => p[1])) + 0.6

const W = Math.round((maxX - minX) * S + PAD * 2)
const H = Math.round((maxY - minY) * S + PAD * 2)
const tx = ([x, y]) => [+((x - minX) * S + PAD).toFixed(1), +((y - minY) * S + PAD).toFixed(1)]

const pathOf = (pts, closed) => {
  const p = pts.map(tx)
  return `M ${p.map((q) => q.join(',')).join(' L ')}${closed ? ' Z' : ''}`
}

const shape = (s, attrs) => `<path d="${pathOf(s.points.map(flip), s.closed)}" ${attrs}/>`

const rotate = ([x, y], deg) => {
  const a = (deg * Math.PI) / 180
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]
}

const parts = [`<rect width="${W}" height="${H}" fill="${T.bg}"/>`]

// --- base plan, in architectural weights ---
for (const s of plan.base.builtins) {
  parts.push(shape(s, `fill="${s.closed ? T.builtinFill : 'none'}" stroke="${T.builtin}" stroke-width="0.9"`))
}
for (const s of plan.base.doors) {
  parts.push(shape(s, `fill="none" stroke="${T.door}" stroke-width="0.7"`))
}
for (const s of plan.base.walls.filter((s) => s.closed)) {
  parts.push(shape(s, `fill="${T.wall}" stroke="${T.wall}" stroke-width="0.6"`))
}
for (const s of plan.base.walls.filter((s) => !s.closed)) {
  parts.push(shape(s, `fill="none" stroke="${T.wall}" stroke-width="${0.055 * S}" stroke-linecap="square"`))
}
for (const s of plan.base.windows) {
  parts.push(shape(s, `fill="none" stroke="${T.glass}" stroke-width="${0.063 * S}"`))
  parts.push(shape(s, `fill="none" stroke="${T.window}" stroke-width="0.9"`))
}

// --- furniture: dashed footprint + symbol block ---
for (const c of shown) {
  const colour = T[c.owner]
  const toWorld = (p) => {
    const r = rotate(p, c.rotation)
    return flip([c.position[0] + r[0], c.position[1] + r[1]])
  }

  parts.push(
    `<path d="${pathOf(c.footprint.map(toWorld), true)}" fill="none" stroke="${colour}" ` +
      `stroke-width="1" stroke-dasharray="5 4" opacity="0.7"/>`,
  )

  for (const prim of symbolFor(c.label, c.size[0], c.size[1])) {
    const op = prim.light ? 0.45 : 0.9
    if (prim.k === 'poly') {
      parts.push(
        `<path d="${pathOf(prim.pts.map(toWorld), prim.closed)}" ` +
          `fill="${prim.filled ? colour : 'none'}" fill-opacity="${prim.filled ? 0.2 : 0}" ` +
          `stroke="${colour}" stroke-width="1" opacity="${op}"/>`,
      )
    } else if (prim.k === 'circle') {
      const [cx, cy] = tx(toWorld([prim.cx, prim.cy]))
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${(prim.r * S).toFixed(1)}" fill="none" stroke="${colour}" stroke-width="1" opacity="${op}"/>`)
    } else {
      // Sample the arc so it inherits the same world transform as everything else.
      const pts = []
      const steps = 24
      for (let i = 0; i <= steps; i++) {
        const ang = ((prim.from + ((prim.to - prim.from) * i) / steps) * Math.PI) / 180
        pts.push(toWorld([prim.cx + Math.cos(ang) * prim.r, prim.cy + Math.sin(ang) * prim.r]))
      }
      parts.push(`<path d="${pathOf(pts, false)}" fill="none" stroke="${colour}" stroke-width="1" opacity="${op}"/>`)
    }
  }

  const [lx, ly] = tx(flip([c.position[0], c.position[1] - c.size[1] / 2 - 0.14]))
  parts.push(
    `<text x="${lx}" y="${ly}" fill="${T.label}" font-size="10" font-family="sans-serif" ` +
      `text-anchor="middle">${c.label.replace(/&/g, '&amp;')}</text>`,
  )
}

fs.writeFileSync(
  OUT,
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`,
)

console.log(`Wrote ${path.relative(PROJECT, OUT)} (${W}x${H})  ${shown.length} pieces drawn`)
