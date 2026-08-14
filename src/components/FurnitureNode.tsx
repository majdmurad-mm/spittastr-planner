import { useMemo, useRef } from 'react'
import { Arc, Circle, Group, Line, Text } from 'react-konva'
import type Konva from 'konva'

import type { Instance, Pt } from '../types'
import type { Severity } from '../lib/collisions'
import type { RenderMode } from '../store'
import type { Theme } from '../lib/theme'
import { snapAngle, snapToWalls } from '../lib/snap'
import type { WallSegment } from '../lib/geometry2d'
import { symbolFor, type Prim } from '../lib/symbols'
import { useStore } from '../store'

/** Touch needs a bigger grab target than a mouse cursor does. */
const COARSE_POINTER =
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

interface Props {
  item: Instance
  selected: boolean
  severity?: Severity
  scale: number
  segments: WallSegment[]
  showLabel: boolean
  mode: RenderMode
  theme: Theme
  onGuides: (guides: WallSegment[]) => void
}

export function FurnitureNode({
  item,
  selected,
  severity,
  scale,
  segments,
  showLabel,
  mode,
  theme,
  onGuides,
}: Props) {
  const groupRef = useRef<Konva.Group>(null)
  const { select, commit, moveTo, rotateTo } = useStore()

  const flat = item.footprint.flat()
  const [w, h] = item.size
  const symbols = useMemo(
    () => (mode === 'symbols' ? symbolFor(item.label, w, h) : []),
    [mode, item.label, w, h],
  )

  const owner = theme.owner[item.owner]
  const accent = severity === 'clash' ? theme.clash : severity === 'warn' ? theme.warn : owner.stroke
  const fill = severity === 'clash' ? theme.clashFill
    : severity === 'warn' ? theme.warnFill
    : selected ? owner.fillSelected
    : owner.fill

  // In symbol mode the footprint becomes a dashed boundary and the symbol
  // carries the detail; in outline mode the footprint is the whole drawing.
  const showFill = mode === 'outline' || selected || severity !== undefined

  const handleRotateDrag = (e: Konva.KonvaEventObject<DragEvent>) => {
    const stage = e.target.getStage()
    const pointer = stage?.getPointerPosition()
    if (!stage || !pointer) return
    const local = stage.getAbsoluteTransform().copy().invert().point(pointer)
    const deg = (Math.atan2(local.y - item.position[1], local.x - item.position[0]) * 180) / Math.PI
    const free = (e.evt as unknown as { shiftKey?: boolean }).shiftKey ?? false
    rotateTo(item.id, snapAngle(deg + 90, free))
    e.target.position({ x: 0, y: -h / 2 - 0.35 })
  }

  return (
    <Group
      ref={groupRef}
      x={item.position[0]}
      y={item.position[1]}
      rotation={item.rotation}
      draggable
      onMouseDown={() => select(item.id)}
      onTouchStart={() => select(item.id)}
      onDragStart={() => {
        select(item.id)
        commit() // one undo step per drag, not per frame
      }}
      onDragMove={(e) => {
        const node = e.target
        const candidate: Pt = [node.x(), node.y()]
        const { position, guides } = snapToWalls(item, candidate, segments)
        node.position({ x: position[0], y: position[1] })
        moveTo(item.id, position)
        onGuides(guides)
      }}
      onDragEnd={() => onGuides([])}
    >
      {/* Footprint: solid in outline mode, dashed boundary in symbol mode. */}
      <Line
        points={flat}
        closed
        fill={showFill ? fill : 'rgba(0,0,0,0.001)'}
        stroke={accent}
        strokeWidth={selected ? 2 : 1.25}
        strokeScaleEnabled={false}
        dash={mode === 'symbols' ? [5, 4] : undefined}
        dashEnabled={mode === 'symbols'}
        opacity={mode === 'symbols' && !selected && !severity ? 0.65 : 1}
      />

      {mode === 'symbols' ? (
        <Symbol prims={symbols} stroke={severity ? accent : owner.symbol} />
      ) : (
        /* Front-edge tick: shows which way the piece faces. */
        <Line
          points={[-w / 2, h / 2, w / 2, h / 2]}
          stroke={accent}
          strokeWidth={3}
          strokeScaleEnabled={false}
          opacity={0.75}
        />
      )}

      {showLabel && (
        <Text
          text={item.label}
          fontSize={11 / scale}
          fill={theme.furnitureLabel}
          align="center"
          verticalAlign="middle"
          width={Math.max(w, 1.2)}
          x={-Math.max(w, 1.2) / 2}
          y={mode === 'symbols' ? h / 2 + 0.06 : -0.08}
          listening={false}
        />
      )}

      {selected && (
        <>
          <Line
            points={[0, -h / 2, 0, -h / 2 - 0.35]}
            stroke={owner.stroke}
            strokeWidth={1}
            strokeScaleEnabled={false}
          />
          <Circle
            x={0}
            y={-h / 2 - 0.35}
            radius={(COARSE_POINTER ? 15 : 7) / scale}
            fill={theme.background}
            stroke={owner.stroke}
            strokeWidth={2}
            strokeScaleEnabled={false}
            draggable
            onDragStart={() => commit()}
            onDragMove={handleRotateDrag}
            onMouseEnter={(e) => {
              const stage = e.target.getStage()
              if (stage) stage.container().style.cursor = 'grab'
            }}
            onMouseLeave={(e) => {
              const stage = e.target.getStage()
              if (stage) stage.container().style.cursor = 'default'
            }}
          />
        </>
      )}
    </Group>
  )
}

function Symbol({ prims, stroke }: { prims: Prim[]; stroke: string }) {
  return (
    <>
      {prims.map((p, i) => {
        const opacity = p.light ? 0.45 : 0.9
        if (p.k === 'poly') {
          return (
            <Line
              key={i}
              points={p.pts.flat()}
              closed={p.closed}
              stroke={stroke}
              strokeWidth={1}
              strokeScaleEnabled={false}
              fill={p.filled ? stroke : undefined}
              opacity={p.filled ? opacity * 0.22 : opacity}
              listening={false}
              perfectDrawEnabled={false}
            />
          )
        }
        if (p.k === 'circle') {
          return (
            <Circle
              key={i}
              x={p.cx}
              y={p.cy}
              radius={p.r}
              stroke={stroke}
              strokeWidth={1}
              strokeScaleEnabled={false}
              fill={p.filled ? stroke : undefined}
              opacity={opacity}
              listening={false}
            />
          )
        }
        return (
          <Arc
            key={i}
            x={p.cx}
            y={p.cy}
            innerRadius={p.r}
            outerRadius={p.r}
            angle={p.to - p.from}
            rotation={p.from}
            stroke={stroke}
            strokeWidth={1}
            strokeScaleEnabled={false}
            opacity={opacity}
            listening={false}
          />
        )
      })}
    </>
  )
}
