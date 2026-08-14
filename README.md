# Spittastr — Furniture Planner

A 2D top-down planner for the Spittastr apartment. The base plan comes from the
Rhino/CAD model; furniture is dragged, rotated and snapped against it.

## Running it

```bash
npm install
npm run dev
```

## Where things live

```
scripts/
  extract.mjs            CAD -> src/data/floorplan.json  (npm run extract)
  readers/               source readers; swap in DXF/DWG here
  geometry.mjs           hull, min-area-rect, centroid helpers
  interior.mjs           flood-fill room detection
  heights.mjs            vertical dimensions (not in the CAD file)
  laura-furniture.mjs    Laura's pieces, supplied as a dimension list
  snapshot.mjs           render floorplan.json to SVG (`--all` shows every piece)
  debug-clash.mjs        report which base shapes a piece overlaps, and by how much
src/
  lib/plan.ts            loads the JSON, flips Y once
  lib/theme.ts           paper / dark palettes and owner colours
  lib/symbols.ts         parametric top-down furniture blocks
  lib/snap.ts            wall magnetism and angle snapping
  lib/geometry2d.ts      SAT overlap, segment crossing, wall segments
  lib/collisions.ts      per-piece clash/warn classification
  components/            canvas, base plan, furniture nodes, sidebar
  store.ts               state, undo/redo, layouts, autosave
```

`snapshot.mjs` imports `src/lib/symbols.ts` directly — Node strips the types —
so the SVG export and the on-screen canvas always draw the same blocks.

## Drawing modes

**Blocks** (default) draws a top-down furniture symbol — bed with pillows,
wardrobe with door swings, piano with a keyboard band, shelving with cubbies —
inside a dashed line showing the piece's true footprint. **Outlines** falls back
to plain filled rectangles.

The symbols are authored in `src/lib/symbols.ts`, matched to a piece by its
label and drawn parametrically from its dimensions. They are *not* imported from
the DWG: that file contains no block definitions, only plain polylines. To add
or change one, edit the `RULES` table.

Two canvas themes: **Paper** (dark ink on warm paper, the default) and **Dark**.

## The data pipeline

The app never parses CAD at runtime. `npm run extract` bakes the model into
`src/data/floorplan.json`; re-run it after editing the Rhino file.

Source: `Spittastr.3dm` (override with the `FLOORPLAN_SOURCE` env var). The
`.3dm` is used rather than the `.dwg` because it parses natively via `rhino3dm`
with no external converter. To read the DWG instead, convert it to DXF and add a
reader under `scripts/readers/` — `extract.mjs` only expects the intermediate
`{ objects: [{ layer, kind, points, closed, text, at }] }` shape.

### Layer mapping

| CAD layer         | Role                                            |
| ----------------- | ----------------------------------------------- |
| `Walls`           | base plan, fixed                                |
| `windows`         | split into glazing + door swings (see below)    |
| `Furniture`       | base plan — built-ins (kitchen), fixed          |
| `Majds furniture` | movable pieces, each paired with a text label   |
| `Picture`         | ignored (hidden tracing image)                  |

The `windows` layer mixes glazing (thin lines along a wall) with door swings
(squarish arcs). They need opposite render weights, so `extract.mjs` splits them
by aspect ratio into `base.windows` and `base.doors` — anything whose short side
is under 20% of its long side is treated as glazing.

Walls are drawn as a mix of closed bands (a wall's cut outline) and open traces
(a single face). Closed bands get solid poché; open traces are stroked at a
real-world thickness so both read as the same wall.

## Things the CAD file does not give you

These are judgement calls baked into the pipeline, not facts from the model.

- **Units.** The file header claims millimetres, but the apartment measures
  6.2 × 14.9 and a bed is 2.10 × 1.40. The geometry is metres; the header flag is
  wrong and is overridden in `extract.mjs`.
- **Heights.** The model is flat 2D with no Z. Heights come from
  `scripts/heights.mjs` and Laura's list. Pieces whose height was inferred rather
  than supplied are marked `heightAssumed` and show a `?` in the inspector.
- **Floor area.** There is **no closed room boundary** anywhere in the file —
  walls are open traces with genuine gaps at every doorway, so flood-filling
  leaks and recovers only sealed closets (~17 m² against a ~92 m² bounding box).
  The app therefore does not claim a floor area; enter yours in the sidebar to
  get a free-space figure. `interiorArea`/`rooms` in the JSON are advisory only.
- **Duplicates.** Several objects are stacked 2–3× identically in the source
  (door swings, counters). The extractor de-dupes by geometry signature.

## Controls

Drag to move, drag the handle above a selected piece to rotate.

| | |
| --- | --- |
| `R` / `Shift+R` | rotate ±15° |
| Arrows | nudge 5 cm (`Shift` 25 cm) |
| `Ctrl+D` | duplicate |
| `Delete` | remove |
| `Ctrl+Z` / `Ctrl+Shift+Z` | undo / redo |
| `F` | fit to plan |
| `Esc` | deselect |

Pieces magnetise flush to walls within 12 cm, resolved per axis. Hold `Shift`
while rotating for free angles instead of 15° steps.

Red = overlaps a wall, built-in, or another piece. Amber = sits across a door
swing.

## On a phone

The same app, laid out for touch below 820px: the plan takes the screen, a
thumb-reachable action bar sits at the bottom (rotate / duplicate / remove /
undo / fit), and the panel becomes a bottom sheet.

- **Drag** a piece to move it — it still snaps flush to walls
- **Pinch** to zoom, **two fingers** to pan, **one finger** on empty space to pan
- Targets are at least 44px; the rotate handle doubles in size on touch

`touch-action: none` on the canvas stops the browser panning the page mid-drag,
and each new pinch re-baselines its own spread — otherwise the second pinch
measures against the first one's final distance and jumps.

## Saving and sharing

Three separate mechanisms, for three different jobs:

| | |
| --- | --- |
| **Autosave** | every change, to `localStorage`. Survives a refresh. |
| **Named layouts** | keep "Option A" / "Option B" side by side and switch between them. |
| **Share link** | a URL carrying the whole arrangement — send it to someone. |
| **Export / Import file** | JSON on disk, for backup or moving between devices. |

A share link encodes only each piece's `defId`, position, rotation, placed flag
and variant; geometry and sizes are rebuilt from the catalog on the other side.
That keeps a full 21-piece arrangement near 1 kB — about 1000 characters of URL
— instead of the ~8 kB a naive dump would take.

Opening a link applies its arrangement and then strips the fragment, so your
later edits survive a refresh instead of reverting to the link. Pasting a link
into an already-open tab works too — that only fires a `hashchange`, with no
reload, so it is handled explicitly.

Storage is wrapped so it never throws: published in a sandboxed frame with
storage blocked, the app still runs, it just won't remember between visits.

## Publishing

```bash
npm run build:share
```

`vite-plugin-singlefile` inlines every asset into one ~480 kB `dist/index.html`
with no external references, then `scripts/build-artifact.mjs` strips the
document shell — the publishing host supplies its own `<head>`/`<body>` — and
writes `dist/artifact.html`. That script fails loudly if the build ever stops
being self-contained, since a CDN reference would be blocked by the host CSP.
