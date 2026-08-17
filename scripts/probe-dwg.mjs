// Probe a DWG: dump layers and entities so we can see what's inside.
//
//   node scripts/probe-dwg.mjs "path/to/file.dwg"

import fs from 'node:fs'
import { LibreDwg } from '@mlightcad/libredwg-web'

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/probe-dwg.mjs <file.dwg>')
  process.exit(1)
}

const dwg = await LibreDwg.create()
const buf = fs.readFileSync(file)
const ptr = dwg.dwg_read_data(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 0)
if (ptr === undefined || ptr === 0) {
  console.error('libredwg could not read the file')
  process.exit(1)
}

const db = dwg.convert(ptr)

console.log('version:', dwg.dwg_get_version_type(ptr))
console.log('INSUNITS:', db.header?.INSUNITS, ' EXTMIN:', db.header?.EXTMIN, ' EXTMAX:', db.header?.EXTMAX)

const layers = db.tables?.LAYER?.entries ?? []
console.log(`\n--- LAYERS (${layers.length}) ---`)
for (const l of layers) console.log(' ', JSON.stringify(l.name))

const ents = db.entities ?? []
console.log(`\n--- ENTITIES (${ents.length}) ---`)
const byType = {}
for (const e of ents) {
  const key = `${e.type} @ ${e.layer}`
  byType[key] = (byType[key] ?? 0) + 1
}
for (const k of Object.keys(byType).sort()) console.log(`  ${String(byType[k]).padStart(4)}  ${k}`)

console.log('\n--- DETAIL ---')
for (const e of ents) {
  const bits = { type: e.type, layer: e.layer }
  if (e.vertices) {
    bits.vertexCount = e.vertices.length
    bits.closed = e.closed ?? e.flag
    bits.pts = e.vertices.slice(0, 12).map((v) => [round(v.x), round(v.y)])
  }
  if (e.text !== undefined) bits.text = e.text
  if (e.startPoint) bits.start = [round(e.startPoint.x), round(e.startPoint.y)]
  if (e.endPoint) bits.end = [round(e.endPoint.x), round(e.endPoint.y)]
  if (e.center) bits.center = [round(e.center.x), round(e.center.y)]
  if (e.radius !== undefined) bits.radius = round(e.radius)
  if (e.name) bits.name = e.name
  if (e.position) bits.position = [round(e.position.x), round(e.position.y)]
  console.log(JSON.stringify(bits))
}

function round(n) {
  return typeof n === 'number' ? Math.round(n * 1000) / 1000 : n
}
