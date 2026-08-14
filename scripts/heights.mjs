// Vertical dimensions, in metres.
//
// The CAD file is a flat 2D plan and carries no Z information, so heights are
// supplied here. These are real IKEA/product dimensions where the label
// identifies the product, and sensible defaults otherwise. Edit freely — the
// 3D view reads straight from this table via the generated JSON, and the app
// lets you override per item.

export const FURNITURE_HEIGHTS = {
  'komode ikea': 0.75,
  'fabric closet': 1.75,
  'ikea closet': 2.01,
  'kallax 4x4': 1.47,
  'kallax 2x2': 0.77,
  table: 0.74,
  bed: 0.55,
  chair: 0.85,
  desk: 0.73,
  rowing: 0.55,
  ivar: 1.79,
}

export const DEFAULT_FURNITURE_HEIGHT = 0.8

// Structure heights.
export const WALL_HEIGHT = 2.5
export const BUILTIN_HEIGHT = 0.9 // kitchen counters and similar
export const WINDOW_SILL = 0.9
export const WINDOW_HEAD = 2.1

export function heightFor(label) {
  return FURNITURE_HEIGHTS[label.trim().toLowerCase()] ?? DEFAULT_FURNITURE_HEIGHT
}
