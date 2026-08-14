import { Fragment } from 'react'
import { Line } from 'react-konva'

import { plan } from '../lib/plan'
import type { Theme } from '../lib/theme'
import type { Shape } from '../types'

/**
 * The base plan, drawn to read as an architectural floorplan rather than a
 * wireframe.
 *
 * Wall geometry in this file is a mix of closed bands (a wall's cut outline)
 * and open traces (a single face). Closed bands get solid poché; open traces
 * are stroked at a real-world thickness so both read as the same wall.
 */
export function BasePlan({ theme }: { theme: Theme }) {
  const closedWalls = plan.base.walls.filter((s) => s.closed)
  const openWalls = plan.base.walls.filter((s) => !s.closed)

  return (
    <Fragment>
      {/* Built-ins sit under the walls. */}
      {plan.base.builtins.map((s, i) => (
        <Poly
          key={`b${i}`}
          shape={s}
          stroke={theme.builtin}
          fill={s.closed ? theme.builtinFill : undefined}
          width={0.018}
        />
      ))}

      {/* Door swings: thin, so they read as annotation rather than structure. */}
      {plan.base.doors.map((s, i) => (
        <Poly key={`d${i}`} shape={s} stroke={theme.door} width={0.012} />
      ))}

      {/* Wall poché. */}
      {closedWalls.map((s, i) => (
        <Poly key={`wc${i}`} shape={s} stroke={theme.wall} fill={theme.wall} width={0.012} />
      ))}
      {openWalls.map((s, i) => (
        <Poly key={`wo${i}`} shape={s} stroke={theme.wall} width={theme.wallWeight} cap="square" />
      ))}

      {/* Glazing drawn over the wall it sits in: a light band with a centre line. */}
      {plan.base.windows.map((s, i) => (
        <Fragment key={`win${i}`}>
          <Poly shape={s} stroke={theme.windowGlass} width={theme.wallWeight * 1.15} cap="butt" />
          <Poly shape={s} stroke={theme.window} width={0.015} cap="butt" />
        </Fragment>
      ))}
    </Fragment>
  )
}

function Poly({
  shape,
  stroke,
  fill,
  width,
  cap = 'round',
}: {
  shape: Shape
  stroke: string
  fill?: string
  width: number
  cap?: 'butt' | 'round' | 'square'
}) {
  return (
    <Line
      points={shape.points.flat()}
      closed={shape.closed}
      stroke={stroke}
      strokeWidth={width}
      fill={fill}
      lineCap={cap}
      lineJoin="miter"
      listening={false}
      perfectDrawEnabled={false}
    />
  )
}
