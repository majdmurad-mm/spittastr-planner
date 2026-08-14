import type { Instance, Pt } from '../types'
import { deg2rad, worldPolygon, type WallSegment } from './geometry2d'

/** Distance within which a piece edge magnetises flush to a wall, in metres. */
export const SNAP_DISTANCE = 0.12
/** Two directions count as parallel below this angle. */
const PARALLEL_TOLERANCE = Math.sin(deg2rad(8))
export const GRID = 0.05

const project = (pts: Pt[], n: Pt) => {
  let min = Infinity
  let max = -Infinity
  for (const [x, y] of pts) {
    const p = x * n[0] + y * n[1]
    if (p < min) min = p
    if (p > max) max = p
  }
  return { min, max }
}

export interface SnapResult {
  position: Pt
  /** Segments the piece ended up flush against — drawn as snap guides. */
  guides: WallSegment[]
}

/**
 * Magnetise a dragged piece to nearby walls.
 *
 * Only walls parallel to one of the piece's own axes are considered, and only
 * where the wall actually spans the piece — otherwise a distant collinear wall
 * would yank it across the room.
 */
export function snapToWalls(item: Instance, candidate: Pt, segments: WallSegment[]): SnapResult {
  const moved: Instance = { ...item, position: candidate }
  const poly = worldPolygon(moved)

  const a = deg2rad(item.rotation)
  const axes: Pt[] = [
    [Math.cos(a), Math.sin(a)], // piece's local +X
    [-Math.sin(a), Math.cos(a)], // piece's local +Y
  ]

  // One best candidate per axis. These are independent corrections: resolving
  // them together lets an edge that is already flush on one axis (offset ~0)
  // out-compete a genuine snap on the other, and nothing ever moves.
  const best: ({ offset: number; normal: Pt; seg: WallSegment } | null)[] = [null, null]

  for (const seg of segments) {
    for (let i = 0; i < 2; i++) {
      const tangent = axes[i]
      const normal = axes[1 - i]
      const slot = 1 - i

      // Wall must run parallel to this axis.
      const cross = Math.abs(seg.dir[0] * tangent[1] - seg.dir[1] * tangent[0])
      if (cross > PARALLEL_TOLERANCE) continue

      // ...and must overlap the piece along that axis, or it isn't adjacent.
      const wallT = project([seg.a, seg.b], tangent)
      const pieceT = project(poly, tangent)
      if (wallT.max < pieceT.min || pieceT.max < wallT.min) continue

      const wallN = project([seg.a, seg.b], normal)
      const wallPos = (wallN.min + wallN.max) / 2
      const pieceN = project(poly, normal)

      // Flush on either face of the piece.
      for (const offset of [wallPos - pieceN.min, wallPos - pieceN.max]) {
        if (Math.abs(offset) > SNAP_DISTANCE) continue
        const current = best[slot]
        if (!current || Math.abs(offset) < Math.abs(current.offset)) {
          best[slot] = { offset, normal, seg }
        }
      }
    }
  }

  const hits = best.filter((b): b is NonNullable<typeof b> => b !== null)

  if (!hits.length) {
    return {
      position: [Math.round(candidate[0] / GRID) * GRID, Math.round(candidate[1] / GRID) * GRID],
      guides: [],
    }
  }

  let [x, y] = candidate
  for (const hit of hits) {
    x += hit.normal[0] * hit.offset
    y += hit.normal[1] * hit.offset
  }

  return { position: [x, y], guides: hits.map((h) => h.seg) }
}

export function snapAngle(deg: number, free: boolean) {
  const wrapped = ((deg % 360) + 360) % 360
  return free ? Math.round(wrapped * 10) / 10 : Math.round(wrapped / 15) * 15
}
