// Laura's furniture — supplied as a list rather than drawn in the CAD file, so
// each piece is generated as a plain rectangle from its dimensions.
//
// Dimensions as given, in CENTIMETRES: length x width x height.
// Where no height was supplied, `heightAssumed: true` marks it as a sensible
// stand-in rather than a measured value — worth checking before trusting the
// 3D view.

export const LAURA_FURNITURE = [
  { label: 'Kommode Wohnzimmer', l: 110, w: 60, h: 82 },
  { label: 'Klavier', l: 135, w: 25.5, h: 77.5 },
  { label: 'Roter Sessel', l: 60, w: 66, h: 85, heightAssumed: true },
  {
    label: 'Couch',
    l: 200,
    w: 100,
    h: 85,
    heightAssumed: true,
    // Sofa bed: the folded-out footprint matters for clearance checks.
    variants: [
      { name: 'eingeklappt', l: 200, w: 100 },
      { name: 'ausgeklappt', l: 200, w: 140 },
    ],
  },
  { label: 'Kleiderschrank', l: 170, w: 65, h: 237 },
  { label: 'Ivar Regal', l: 90, w: 30, h: 236 },
  { label: 'Schreibtisch', l: 160, w: 80, h: 73, heightAssumed: true },
  { label: 'Kommode Schlafzimmer', l: 95, w: 49, h: 80, heightAssumed: true },
  { label: 'Kommode Schlafzimmer Nr.2', l: 71, w: 41, h: 80, heightAssumed: true },
  { label: 'Kleiner Nachttisch', l: 57, w: 36, h: 55, heightAssumed: true },
]

/** Where Laura's pieces sit when dropped without a drag target — a staging
 *  grid west of the apartment, clear of Majd's staging area to the east. */
export const LAURA_STAGING_ORIGIN = [1.5, 10.5]
export const LAURA_STAGING_STEP = [2.6, 2.0]
export const LAURA_STAGING_COLUMNS = 3
