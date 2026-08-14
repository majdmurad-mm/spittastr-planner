import { useEffect, useState } from 'react'

import { PlanCanvas } from './components/PlanCanvas'
import { Sidebar } from './components/Sidebar'
import { MobileBar } from './components/MobileBar'
import { SHARE_PREFIX, layoutFromUrl } from './lib/share'
import { useSync } from './lib/useSync'
import { useStore } from './store'

const NUDGE = 0.05
const NUDGE_COARSE = 0.25

export function App() {
  // On a phone the panel is a bottom sheet, collapsed by default so the plan
  // gets the screen. On desktop it is always-on and this flag is unused.
  const [sheetOpen, setSheetOpen] = useState(false)

  useSync()

  useEffect(() => {
    // The store consumed any shared layout when it was created. Drop the
    // fragment now so later edits survive a refresh instead of being reverted
    // to whatever the link contained.
    if (window.location.hash.startsWith(SHARE_PREFIX)) {
      const { pathname, search } = window.location
      window.history.replaceState(null, '', pathname + search)
    }

    // Pasting a link into an already-open tab only changes the fragment — no
    // reload happens — so apply it here too.
    const onHashChange = () => {
      const layout = layoutFromUrl()
      if (!layout) return
      useStore.getState().importInstances(layout)
      const { pathname, search } = window.location
      window.history.replaceState(null, '', pathname + search)
    }

    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      // Don't hijack typing in the layout-name field.
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

      const s = useStore.getState()
      const id = s.selectedId
      const ctrl = e.ctrlKey || e.metaKey

      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if (ctrl && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        s.redo()
        return
      }
      if (e.key === 'Escape') {
        s.select(null)
        return
      }
      if (e.key.toLowerCase() === 'f') {
        window.dispatchEvent(new Event('spittastr:fit'))
        return
      }

      if (!id) return

      if (ctrl && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        s.duplicate(id)
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        s.remove(id)
        return
      }
      if (e.key.toLowerCase() === 'r') {
        const item = s.instances.find((i) => i.id === id)
        if (!item) return
        s.commit()
        s.rotateTo(id, item.rotation + (e.shiftKey ? -15 : 15))
        return
      }

      const step = e.shiftKey ? NUDGE_COARSE : NUDGE
      const deltas: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }
      const d = deltas[e.key]
      if (d) {
        e.preventDefault()
        s.nudge(id, d[0], d[1])
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`app${sheetOpen ? ' sheet-open' : ''}`}>
      <main>
        <PlanCanvas />
      </main>

      <MobileBar sheetOpen={sheetOpen} onToggleSheet={() => setSheetOpen((v) => !v)} />

      <Sidebar onClose={() => setSheetOpen(false)} />

      {sheetOpen && <div className="scrim" onClick={() => setSheetOpen(false)} />}
    </div>
  )
}
