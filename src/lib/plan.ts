import raw from '../data/floorplan.json'
import type { CatalogItem, FloorPlan, Instance, Owner, Pt, Room, Shape, Variant } from '../types'

// The CAD model is Y-up; screen space is Y-down. Rather than mirroring at
// render time (which flips text and inverts every drag delta), flip once here
// at the data boundary. Everything downstream is plain Y-down metres.

const flipPt = (p: Pt): Pt => [p[0], -p[1]]
const flipShape = (s: Shape): Shape => ({ points: s.points.map(flipPt), closed: s.closed })
const flipVariant = (v: Variant): Variant => ({ ...v, footprint: v.footprint.map(flipPt) })

const source = raw as unknown as FloorPlan

export const OWNERS: Owner[] = ['majd', 'laura']

// Colours live in lib/theme.ts, since they vary per theme.

export const plan: FloorPlan = {
  ...source,
  bounds: {
    minX: source.bounds.minX,
    maxX: source.bounds.maxX,
    minY: -source.bounds.maxY,
    maxY: -source.bounds.minY,
  },
  planExtent: {
    minX: source.planExtent.minX,
    maxX: source.planExtent.maxX,
    minY: -source.planExtent.maxY,
    maxY: -source.planExtent.minY,
  },
  rooms: source.rooms.map(
    (r): Room => ({
      ...r,
      centroid: flipPt(r.centroid),
      bounds: {
        minX: r.bounds.minX,
        maxX: r.bounds.maxX,
        minY: -r.bounds.maxY,
        maxY: -r.bounds.minY,
      },
    }),
  ),
  base: {
    walls: source.base.walls.map(flipShape),
    windows: source.base.windows.map(flipShape),
    doors: source.base.doors.map(flipShape),
    builtins: source.base.builtins.map(flipShape),
  },
  catalog: source.catalog.map(
    (c): CatalogItem => ({
      ...c,
      footprint: c.footprint.map(flipPt),
      position: flipPt(c.position),
      rotation: -c.rotation,
      variants: c.variants?.map(flipVariant),
    }),
  ),
}

export const planExtent = plan.planExtent

let counter = 0
export function newInstanceId(defId: string) {
  counter += 1
  return `${defId}-${counter}-${Math.random().toString(36).slice(2, 7)}`
}

export function instanceFrom(def: CatalogItem, overrides: Partial<Instance> = {}): Instance {
  return {
    id: newInstanceId(def.id),
    defId: def.id,
    label: def.label,
    owner: def.owner,
    footprint: def.footprint,
    size: def.size,
    height: def.height,
    heightAssumed: def.heightAssumed,
    variants: def.variants,
    variant: def.variants ? 0 : undefined,
    position: def.position,
    rotation: def.rotation,
    onPlan: def.placed,
    ...overrides,
  }
}

/**
 * Build the starting layout: Majd's pieces keep their CAD positions where they
 * were already inside the apartment, everything else starts in the tray.
 */
export function initialInstances(): Instance[] {
  return plan.catalog.map((c) => instanceFrom(c))
}
