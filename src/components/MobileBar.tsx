import { THEMES } from '../lib/theme'
import { useStore } from '../store'

const OWNER_STYLE = THEMES.dark.owner

/**
 * Phone-only action bar pinned above the bottom sheet.
 *
 * Keyboard shortcuts do the work on desktop; on touch the common actions
 * (rotate, duplicate, remove, undo) need to be reachable with a thumb without
 * opening the panel.
 */
export function MobileBar({
  sheetOpen,
  onToggleSheet,
}: {
  sheetOpen: boolean
  onToggleSheet: () => void
}) {
  const instances = useStore((s) => s.instances)
  const selectedId = useStore((s) => s.selectedId)
  const { commit, rotateTo, duplicate, remove, undo, past } = useStore()
  const selected = instances.find((i) => i.id === selectedId) ?? null
  const tray = instances.filter((i) => !i.onPlan).length

  return (
    <div className="mobile-bar">
      {selected ? (
        <>
          <span className="mb-name">
            <i className="swatch" style={{ background: OWNER_STYLE[selected.owner].stroke }} />
            {selected.label}
          </span>
          <button
            aria-label="Rotate 90 degrees"
            onClick={() => {
              commit()
              rotateTo(selected.id, selected.rotation + 90)
            }}
          >
            ⟳
          </button>
          <button aria-label="Duplicate" onClick={() => duplicate(selected.id)}>⧉</button>
          <button aria-label="Remove" className="danger" onClick={() => remove(selected.id)}>✕</button>
        </>
      ) : (
        <span className="mb-name muted">
          {tray > 0 ? `${tray} piece${tray === 1 ? '' : 's'} unplaced` : 'Tap a piece to select'}
        </span>
      )}

      <button aria-label="Undo" disabled={!past.length} onClick={undo}>↶</button>
      <button
        aria-label="Fit to plan"
        onClick={() => window.dispatchEvent(new Event('spittastr:fit'))}
      >
        ⤢
      </button>
      <button className="mb-menu" onClick={onToggleSheet}>
        {sheetOpen ? 'Close' : 'Menu'}
      </button>
    </div>
  )
}
