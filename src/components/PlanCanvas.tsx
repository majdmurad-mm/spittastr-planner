import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Layer, Line, Stage } from 'react-konva'
import type Konva from 'konva'

import { BasePlan } from './BasePlan'
import { FurnitureNode } from './FurnitureNode'
import { findCollisions } from '../lib/collisions'
import { collectSegments, type WallSegment } from '../lib/geometry2d'
import { plan, planExtent } from '../lib/plan'
import { THEMES } from '../lib/theme'
import { useStore } from '../store'
import type { Pt } from '../types'

const MIN_SCALE = 8
const MAX_SCALE = 300

interface View {
  scale: number
  x: number
  y: number
}

export function PlanCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })
  const [view, setView] = useState<View>({ scale: 40, x: 0, y: 0 })
  const [guides, setGuides] = useState<WallSegment[]>([])
  const [pinching, setPinching] = useState(false)

  const instances = useStore((s) => s.instances)
  const selectedId = useStore((s) => s.selectedId)
  const showLabels = useStore((s) => s.showLabels)
  const showCollisions = useStore((s) => s.showCollisions)
  const renderMode = useStore((s) => s.renderMode)
  const themeName = useStore((s) => s.theme)
  // Fall back rather than crash on an unknown persisted value.
  const theme = THEMES[themeName] ?? THEMES.paper
  const select = useStore((s) => s.select)
  const place = useStore((s) => s.place)
  const visibleOwners = useStore((s) => s.visibleOwners)

  // Walls and built-ins are what a piece snaps against.
  const segments = useMemo(
    () => collectSegments([...plan.base.walls, ...plan.base.builtins]),
    [],
  )

  useEffect(() => {
    document.body.style.setProperty('--canvas-bg', theme.background)
  }, [theme])

  const collisions = useMemo(
    () => (showCollisions ? findCollisions(instances) : new Map()),
    [instances, showCollisions],
  )

  const fitToPlan = useCallback((w: number, h: number) => {
    const pad = 40
    const planW = planExtent.maxX - planExtent.minX
    const planH = planExtent.maxY - planExtent.minY
    const scale = Math.min((w - pad * 2) / planW, (h - pad * 2) / planH)
    setView({
      scale,
      x: w / 2 - ((planExtent.minX + planExtent.maxX) / 2) * scale,
      y: h / 2 - ((planExtent.minY + planExtent.maxY) / 2) * scale,
    })
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width, height })
    })
    observer.observe(el)
    const rect = el.getBoundingClientRect()
    setSize({ width: rect.width, height: rect.height })
    fitToPlan(rect.width, rect.height)
    return () => observer.disconnect()
  }, [fitToPlan])

  // Expose "fit to plan" to the toolbar without threading refs through props.
  useEffect(() => {
    const handler = () => fitToPlan(size.width, size.height)
    window.addEventListener('spittastr:fit', handler)
    return () => window.removeEventListener('spittastr:fit', handler)
  }, [fitToPlan, size])

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    setView((v) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor))
      const ratio = next / v.scale
      // Keep the point under the cursor fixed.
      return { scale: next, x: clientX - (clientX - v.x) * ratio, y: clientY - (clientY - v.y) * ratio }
    })
  }, [])

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    const pointer = stage?.getPointerPosition()
    if (!pointer) return
    zoomAt(pointer.x, pointer.y, e.evt.deltaY > 0 ? 1 / 1.08 : 1.08)
  }

  // --- pinch to zoom / two-finger pan ---------------------------------------
  // Konva handles single-finger drag of pieces and the stage on its own; only
  // the two-finger gesture needs implementing. While pinching, stage dragging
  // is suspended so the plan doesn't lurch when a finger lifts.
  const pinch = useRef<{ dist: number; centre: { x: number; y: number } } | null>(null)

  const touchPoint = (t: Touch) => {
    const rect = containerRef.current!.getBoundingClientRect()
    return { x: t.clientX - rect.left, y: t.clientY - rect.top }
  }

  // A new gesture must always start from a fresh baseline. Relying on touchend
  // to clear it is not enough — it can be missed, and the next pinch then
  // measures against the previous gesture's final spread and jumps.
  const onTouchStart = (e: Konva.KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length < 2) endPinch()
  }

  const onTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches
    if (touches.length !== 2) {
      // Down to one finger (or none): end the pinch so the next one re-baselines.
      if (pinch.current) endPinch()
      return
    }

    e.evt.preventDefault()
    const stage = stageRef.current
    if (stage?.isDragging()) stage.stopDrag()
    setPinching(true)

    const p1 = touchPoint(touches[0])
    const p2 = touchPoint(touches[1])
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    const centre = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }

    const previous = pinch.current
    pinch.current = { dist, centre }
    if (!previous || previous.dist === 0) return

    setView((v) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * (dist / previous.dist)))
      const ratio = next / v.scale
      // Zoom about the pinch centre, and pan by however far that centre moved.
      return {
        scale: next,
        x: centre.x - (previous.centre.x - v.x) * ratio,
        y: centre.y - (previous.centre.y - v.y) * ratio,
      }
    })
  }

  const endPinch = () => {
    pinch.current = null
    setPinching((was) => (was ? false : was))
  }

  // Dropping a tray item onto the canvas moves that instance onto the plan —
  // it does not spawn a copy, or the piece would remain in the tray as well.
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const instanceId = e.dataTransfer.getData('text/spittastr-instance')
    if (!instanceId) return
    const rect = containerRef.current!.getBoundingClientRect()
    const position: Pt = [
      (e.clientX - rect.left - view.x) / view.scale,
      (e.clientY - rect.top - view.y) / view.scale,
    ]
    place(instanceId, position)
    select(instanceId)
  }

  return (
    <div
      ref={containerRef}
      className="canvas-host"
      style={{ background: theme.background }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        scaleX={view.scale}
        scaleY={view.scale}
        x={view.x}
        y={view.y}
        draggable={!pinching}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={endPinch}
        onTouchCancel={endPinch}
        onDragEnd={(e) => {
          // Only the stage itself panning, not a bubbled child drag.
          if (e.target === stageRef.current) {
            setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }))
          }
        }}
        onMouseDown={(e) => {
          if (e.target === e.target.getStage()) select(null)
        }}
      >
        <Layer listening={false}>
          <BasePlan theme={theme} />
        </Layer>

        <Layer>
          {instances
            .filter((i) => i.onPlan && visibleOwners[i.owner])
            .map((item) => (
              <FurnitureNode
                key={item.id}
                item={item}
                selected={item.id === selectedId}
                severity={collisions.get(item.id)}
                scale={view.scale}
                segments={segments}
                showLabel={showLabels}
                mode={renderMode}
                theme={theme}
                onGuides={setGuides}
              />
            ))}
        </Layer>

        <Layer listening={false}>
          {guides.map((g, i) => (
            <Line
              key={i}
              points={[g.a[0], g.a[1], g.b[0], g.b[1]]}
              stroke="#22a06b"
              strokeWidth={2.5}
              strokeScaleEnabled={false}
              dash={[6, 4]}
              dashEnabled
            />
          ))}
        </Layer>
      </Stage>

      <ScaleBar scale={view.scale} />
    </div>
  )
}

function ScaleBar({ scale }: { scale: number }) {
  // Pick a round metre length that renders between 60 and 160 px.
  const options = [0.5, 1, 2, 5, 10]
  const metres = options.find((m) => m * scale >= 60) ?? 10
  return (
    <div className="scale-bar">
      <div className="scale-bar-line" style={{ width: metres * scale }} />
      <span>{metres} m</span>
    </div>
  )
}
