// Reader for Rhino .3dm files.
//
// Emits a source-agnostic intermediate form so a DXF/DWG reader can be dropped
// in later without touching extract.mjs:
//   { units, objects: [ { layer, kind: 'curve'|'text', points?, closed?, text?, at? } ] }

import rhino3dm from 'rhino3dm'
import fs from 'node:fs'

// Pull vertices off a curve. PolylineCurve exposes pointCount/point(i) directly;
// toPolyline() returns an empty polyline for these, so it can't be relied on.
function curvePoints(geom) {
  const pts = []

  if (typeof geom.pointCount === 'number' && typeof geom.point === 'function') {
    for (let i = 0; i < geom.pointCount; i++) {
      const p = geom.point(i)
      pts.push([p[0], p[1]])
    }
    return pts
  }

  // Fallback for NurbsCurve/PolyCurve/ArcCurve: tessellate via control points,
  // then densify arcs by sampling the curve domain.
  const nurbs = geom.toNurbsCurve ? geom.toNurbsCurve() : null
  if (nurbs && nurbs.points) {
    const cps = nurbs.points()
    const degree = nurbs.degree ?? 1
    if (degree === 1) {
      for (let i = 0; i < cps.count; i++) {
        const cp = cps.get(i)
        pts.push([cp[0], cp[1]])
      }
      return pts
    }
    // Curved: sample the domain evenly.
    const dom = geom.domain
    const SAMPLES = 48
    for (let i = 0; i <= SAMPLES; i++) {
      const t = dom[0] + ((dom[1] - dom[0]) * i) / SAMPLES
      const p = geom.pointAt(t)
      pts.push([p[0], p[1]])
    }
    return pts
  }

  return pts
}

export async function read(filePath) {
  const rhino = await rhino3dm()
  const bytes = new Uint8Array(fs.readFileSync(filePath))
  const doc = rhino.File3dm.fromByteArray(bytes)
  if (!doc) throw new Error(`Could not parse 3dm: ${filePath}`)

  const layers = doc.layers()
  const layerName = {}
  for (let i = 0; i < layers.count; i++) {
    const l = layers.get(i)
    layerName[l.index] = l.fullPath
  }

  const objects = []
  const objs = doc.objects()

  for (let i = 0; i < objs.count; i++) {
    const o = objs.get(i)
    const attrs = o.attributes()
    const geom = o.geometry()
    if (!geom) continue

    const layer = layerName[attrs.layerIndex] ?? `layer${attrs.layerIndex}`
    const cls = geom.constructor.name

    if (cls === 'TextEntity' || cls === 'Text') {
      const plane = geom.plane
      objects.push({
        index: i,
        layer,
        kind: 'text',
        text: (geom.plainText ?? '').trim(),
        at: plane ? [plane.origin[0], plane.origin[1]] : [0, 0],
      })
      continue
    }

    // Everything else we care about is planar curve geometry.
    if (typeof geom.isClosed === 'undefined') continue

    const points = curvePoints(geom)
    if (points.length < 2) continue

    objects.push({
      index: i,
      layer,
      kind: 'curve',
      points,
      closed: !!geom.isClosed,
    })
  }

  return { objects }
}
