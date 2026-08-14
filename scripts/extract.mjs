// One-time CAD -> JSON bake.
//
//   npm run extract
//
// Reads the Rhino model and writes src/data/floorplan.json. The app never
// touches CAD at runtime; re-run this after editing the model in Rhino.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { read as readRhino } from './readers/rhino3dm-reader.mjs'
import { computeInterior } from './interior.mjs'
import {
  LAURA_FURNITURE,
  LAURA_STAGING_COLUMNS,
  LAURA_STAGING_ORIGIN,
  LAURA_STAGING_STEP,
} from './laura-furniture.mjs'
import {
  bboxOf,
  centroidOf,
  minAreaRect,
  round,
  roundPoints,
  toLocalFrame,
} from './geometry.mjs'
import {
  BUILTIN_HEIGHT,
  WALL_HEIGHT,
  WINDOW_HEAD,
  WINDOW_SILL,
  heightFor,
} from './heights.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROJECT = path.resolve(HERE, '..')

const SOURCE = process.env.FLOORPLAN_SOURCE
  ?? 'G:/My Drive/_Personal/Spittastr-Grundris/Spittastr.3dm'
const OUT = path.join(PROJECT, 'src', 'data', 'floorplan.json')

// The file header claims millimetres, but the apartment measures ~6.2 x 14.9
// and a bed footprint is 2.10 x 1.40 — the geometry is unambiguously metres and
// the header flag is wrong. Override rather than trust it.
const UNITS = 'm'

// Layer -> role. Anything unlisted (e.g. the hidden "Picture" tracing image) is
// ignored. Matching is case-insensitive.
const LAYER_ROLES = {
  walls: 'walls',
  windows: 'windows',
  furniture: 'builtins',
  'majds furniture': 'movable',
}

const slugCounts = new Map()
function slugify(label) {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'item'
  const seen = slugCounts.get(base) ?? 0
  slugCounts.set(base, seen + 1)
  return seen === 0 ? base : `${base}-${seen + 1}`
}

// Identical geometry is stacked 2-3x in places (door swings, counters) — an
// artefact of the CAD import. Collapse by rounded-point signature.
function dedupeCurves(curves) {
  const seen = new Set()
  const out = []
  for (const c of curves) {
    const key = `${c.closed}|${c.points.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(';')}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}

function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Source model not found:\n  ${SOURCE}\nSet FLOORPLAN_SOURCE to override.`)
    process.exit(1)
  }

  return readRhino(SOURCE).then((model) => {
    const buckets = { walls: [], windows: [], builtins: [], movable: [] }
    const labels = []
    const skippedLayers = new Set()

    for (const obj of model.objects) {
      const role = LAYER_ROLES[obj.layer.trim().toLowerCase()]
      if (!role) {
        skippedLayers.add(obj.layer)
        continue
      }
      if (obj.kind === 'text') {
        if (role === 'movable' && obj.text) labels.push(obj)
        continue
      }
      buckets[role].push(obj)
    }

    for (const key of Object.keys(buckets)) buckets[key] = dedupeCurves(buckets[key])

    // --- Base plan -------------------------------------------------------
    const toShape = (c) => ({ points: roundPoints(c.points), closed: c.closed })

    // The `windows` layer mixes two very different things: glazing drawn as a
    // thin line along the wall, and door swings drawn as squarish arcs. They
    // need opposite render treatments, so split them by aspect ratio.
    const isGlazing = (c) => {
      const b = bboxOf(c.points)
      const w = b.maxX - b.minX
      const h = b.maxY - b.minY
      const long = Math.max(w, h)
      const short = Math.min(w, h)
      return long > 0 && short / long < 0.2
    }

    const base = {
      walls: buckets.walls.map(toShape),
      windows: buckets.windows.filter(isGlazing).map(toShape),
      doors: buckets.windows.filter((c) => !isGlazing(c)).map(toShape),
      builtins: buckets.builtins.map(toShape),
    }

    // Placed vs parked is decided against the full drawn extent of the plan.
    // The staging areas sit well outside it.
    const planExtent = bboxOf(
      [...base.walls, ...base.windows, ...base.doors, ...base.builtins].flatMap((s) => s.points),
    )

    // There is no closed room boundary in this file — walls are open traces and
    // thick bands, so the interior has to be derived rather than read off a
    // curve. Rasterise and flood-fill from outside.
    const { interiorArea, rooms } = computeInterior(
      [...base.walls, ...base.builtins],
      planExtent,
    )

    // --- Movable furniture ----------------------------------------------
    // Each piece is a closed curve paired with a text label. Pair by nearest
    // label centroid, consuming each label once.
    const unclaimed = [...labels]
    const catalog = []

    for (const curve of buckets.movable) {
      const centre = centroidOf(curve.points)
      const box = bboxOf(curve.points)

      let bestIdx = -1
      let bestDist = Infinity
      unclaimed.forEach((lab, i) => {
        // Prefer a label whose anchor falls inside the footprint's bbox.
        const inside =
          lab.at[0] >= box.minX && lab.at[0] <= box.maxX &&
          lab.at[1] >= box.minY && lab.at[1] <= box.maxY
        const d = Math.hypot(lab.at[0] - centre[0], lab.at[1] - centre[1]) - (inside ? 1000 : 0)
        if (d < bestDist) {
          bestDist = d
          bestIdx = i
        }
      })

      const label = bestIdx >= 0 ? unclaimed.splice(bestIdx, 1)[0].text : 'Unnamed'

      // Derive the piece's own axes so rotation is about its true orientation
      // rather than the world axes.
      const rect = minAreaRect(curve.points)
      const local = toLocalFrame(curve.points, centre, rect.angle)

      const placed =
        centre[0] >= planExtent.minX && centre[0] <= planExtent.maxX &&
        centre[1] >= planExtent.minY && centre[1] <= planExtent.maxY

      catalog.push({
        id: slugify(label),
        label,
        owner: 'majd',
        footprint: roundPoints(local),          // local frame, centred on origin
        size: [round(rect.width, 3), round(rect.height, 3)],
        height: heightFor(label),
        position: [round(centre[0], 4), round(centre[1], 4)],
        rotation: round((rect.angle * 180) / Math.PI, 2),
        placed,
      })
    }

    // --- Laura's furniture ------------------------------------------------
    // Supplied as a dimension list, not drawn in CAD, so each piece is a plain
    // rectangle staged west of the apartment. All start unplaced.
    const rect = (w, h) => [
      [round(-w / 2, 4), round(-h / 2, 4)],
      [round(w / 2, 4), round(-h / 2, 4)],
      [round(w / 2, 4), round(h / 2, 4)],
      [round(-w / 2, 4), round(h / 2, 4)],
    ]

    LAURA_FURNITURE.forEach((piece, i) => {
      const w = piece.l / 100
      const d = piece.w / 100
      const col = i % LAURA_STAGING_COLUMNS
      const row = Math.floor(i / LAURA_STAGING_COLUMNS)

      catalog.push({
        id: slugify(piece.label),
        label: piece.label,
        owner: 'laura',
        footprint: rect(w, d),
        size: [round(w, 3), round(d, 3)],
        height: round(piece.h / 100, 3),
        heightAssumed: !!piece.heightAssumed,
        position: [
          round(LAURA_STAGING_ORIGIN[0] + col * LAURA_STAGING_STEP[0], 4),
          round(LAURA_STAGING_ORIGIN[1] + row * LAURA_STAGING_STEP[1], 4),
        ],
        rotation: 0,
        placed: false,
        variants: piece.variants?.map((v) => ({
          name: v.name,
          size: [round(v.l / 100, 3), round(v.w / 100, 3)],
          footprint: rect(v.l / 100, v.w / 100),
        })),
      })
    })

    if (unclaimed.length) {
      console.warn(`  ! ${unclaimed.length} label(s) had no matching footprint: ${unclaimed.map((l) => l.text).join(', ')}`)
    }

    // --- Bounds over everything ------------------------------------------
    const allPoints = [
      ...base.walls, ...base.windows, ...base.builtins,
    ].flatMap((s) => s.points)
    for (const item of catalog) {
      allPoints.push(item.position)
    }
    const bounds = bboxOf(allPoints)

    const out = {
      generatedFrom: path.basename(SOURCE),
      units: UNITS,
      wallHeight: WALL_HEIGHT,
      builtinHeight: BUILTIN_HEIGHT,
      window: { sill: WINDOW_SILL, head: WINDOW_HEAD },
      bounds: {
        minX: round(bounds.minX), minY: round(bounds.minY),
        maxX: round(bounds.maxX), maxY: round(bounds.maxY),
      },
      planExtent: {
        minX: round(planExtent.minX), minY: round(planExtent.minY),
        maxX: round(planExtent.maxX), maxY: round(planExtent.maxY),
      },
      interiorArea,
      rooms,
      base,
      catalog,
    }

    fs.mkdirSync(path.dirname(OUT), { recursive: true })
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2))

    // --- Report -----------------------------------------------------------
    console.log(`Read ${path.basename(SOURCE)}`)
    if (skippedLayers.size) console.log(`  skipped layers: ${[...skippedLayers].join(', ')}`)
    console.log(`  walls ${base.walls.length}  windows ${base.windows.length}  doors ${base.doors.length}  builtins ${base.builtins.length}`)
    console.log(`  interior ${interiorArea} m² across ${rooms.length} enclosed spaces`)
    console.log(`    ${rooms.map((r) => r.area.toFixed(1)).join(', ')} m²`)
    console.log(`  furniture ${catalog.length} (${catalog.filter((c) => c.placed).length} placed, ${catalog.filter((c) => !c.placed).length} in tray)`)

    for (const owner of ['majd', 'laura']) {
      console.log(`\n  ${owner}:`)
      for (const c of catalog.filter((x) => x.owner === owner)) {
        console.log(
          `    ${c.placed ? '*' : '.'} ${c.label.padEnd(26)} ` +
          `${c.size[0].toFixed(2)} x ${c.size[1].toFixed(2)} x ${c.height.toFixed(2)} m` +
          `${c.heightAssumed ? '  (height assumed)' : ''}` +
          `${c.variants ? `  [${c.variants.length} variants]` : ''}`,
        )
      }
    }
    console.log(`\nWrote ${path.relative(PROJECT, OUT)}`)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

