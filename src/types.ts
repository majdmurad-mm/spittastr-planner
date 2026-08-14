export type Pt = [number, number]

export type Owner = 'majd' | 'laura'

export interface Shape {
  points: Pt[]
  closed: boolean
}

export interface Variant {
  name: string
  size: [number, number]
  footprint: Pt[]
}

export interface Room {
  area: number
  centroid: Pt
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

/** A furniture definition: either extracted from CAD or generated from a size list. */
export interface CatalogItem {
  id: string
  label: string
  owner: Owner
  /** Local frame, centred on the origin, axis-aligned to the piece's own axes. */
  footprint: Pt[]
  size: [number, number]
  height: number
  /** True when the height was inferred rather than supplied. */
  heightAssumed?: boolean
  variants?: Variant[]
  position: Pt
  rotation: number
  placed: boolean
}

export interface FloorPlan {
  generatedFrom: string
  units: string
  wallHeight: number
  builtinHeight: number
  window: { sill: number; head: number }
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
  planExtent: { minX: number; minY: number; maxX: number; maxY: number }
  /**
   * Floor area of the *fully enclosed* spaces only. The CAD wall layer is an
   * open trace with real gaps, so this under-reports badly and must not be
   * presented as the apartment's floor area.
   */
  interiorArea: number
  rooms: Room[]
  base: { walls: Shape[]; windows: Shape[]; doors: Shape[]; builtins: Shape[] }
  catalog: CatalogItem[]
}

/** A placed instance of a catalog piece. Multiple instances may share a defId. */
export interface Instance {
  id: string
  defId: string
  label: string
  owner: Owner
  footprint: Pt[]
  size: [number, number]
  height: number
  heightAssumed?: boolean
  variants?: Variant[]
  /** Index into `variants`, when the piece has them. */
  variant?: number
  position: Pt
  rotation: number
  /** false = sitting in the tray rather than on the plan. */
  onPlan: boolean
}

export interface SavedLayout {
  name: string
  savedAt: string
  instances: Instance[]
}
