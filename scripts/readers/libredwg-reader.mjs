// Reader for DWG files, via a WebAssembly build of LibreDWG.
//
// Emits the same intermediate form as the Rhino reader, so extract.mjs does not
// care which format a piece of furniture came from:
//   { objects: [ { layer, kind: 'curve'|'text', points, closed, text, at } ] }
//
// Note on licensing: libredwg is GPL-3.0 and is a devDependency used only by
// this build-time script. It is never imported by the app, so it does not end
// up in the published bundle.

import fs from 'node:fs'
import { LibreDwg } from '@mlightcad/libredwg-web'

let modulePromise = null

/** The wasm module is expensive to start; share one across files. */
function getDwg() {
  modulePromise ??= LibreDwg.create()
  return modulePromise
}

const pt = (p) => [p.x, p.y]

export async function read(filePath) {
  const dwg = await getDwg()
  const buf = fs.readFileSync(filePath)
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)

  const ptr = dwg.dwg_read_data(bytes, 0)
  if (!ptr) throw new Error(`libredwg could not read: ${filePath}`)

  const db = dwg.convert(ptr)
  const objects = []

  for (const [index, e] of (db.entities ?? []).entries()) {
    const layer = e.layer ?? '0'

    // Text carries furniture labels in these drawings, same as the Rhino file.
    if (e.type === 'TEXT' || e.type === 'MTEXT') {
      const anchor = e.startPoint ?? e.insertionPoint ?? e.position
      objects.push({
        index,
        layer,
        kind: 'text',
        text: String(e.text ?? '').trim(),
        at: anchor ? pt(anchor) : [0, 0],
      })
      continue
    }

    let points = null

    if (Array.isArray(e.vertices) && e.vertices.length >= 2) {
      points = e.vertices.map(pt)
    } else if (e.startPoint && e.endPoint) {
      points = [pt(e.startPoint), pt(e.endPoint)]
    } else if (e.center && typeof e.radius === 'number') {
      // Approximate circles so they participate in hulls and bounds.
      const SEGMENTS = 32
      points = Array.from({ length: SEGMENTS }, (_, i) => {
        const a = (i / SEGMENTS) * Math.PI * 2
        return [e.center.x + Math.cos(a) * e.radius, e.center.y + Math.sin(a) * e.radius]
      })
    }

    if (!points || points.length < 2) continue

    objects.push({
      index,
      layer,
      kind: 'curve',
      points,
      // libredwg reports the closed flag as a number.
      closed: Boolean(e.closed ?? e.shape ?? 0),
    })
  }

  return { objects, header: db.header ?? {} }
}
