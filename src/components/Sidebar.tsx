import { useRef, useState } from 'react'

import { occupiedArea } from '../lib/collisions'
import { saveTextFile } from '../lib/download'
import { OWNERS, plan } from '../lib/plan'
import { shareUrl } from '../lib/share'
import { THEMES } from '../lib/theme'
import { SharePanel } from './SharePanel'
import { useStore } from '../store'
import type { Instance, Owner } from '../types'

/** The sidebar chrome is always dark, so its swatches use the dark palette
 *  regardless of which theme the canvas is showing. */
const OWNER_STYLE = THEMES.dark.owner

export function Sidebar({ onClose }: { onClose: () => void }) {
  const instances = useStore((s) => s.instances)
  const selectedId = useStore((s) => s.selectedId)
  const selected = instances.find((i) => i.id === selectedId) ?? null

  return (
    <aside className="sidebar">
      <header className="brand">
        <div>
          <h1>Spittastr</h1>
          <p>{plan.catalog.length} pieces · from {plan.generatedFrom}</p>
        </div>
        <button className="sheet-close" onClick={onClose} aria-label="Close panel">✕</button>
      </header>

      <SharePanel />
      <Stats />
      {selected ? <Inspector item={selected} /> : <Hint />}
      <Tray />
      <Layouts />
      <Options />
    </aside>
  )
}

function Stats() {
  const instances = useStore((s) => s.instances)
  const floorArea = useStore((s) => s.floorArea)
  const setFloorArea = useStore((s) => s.setFloorArea)
  const [draft, setDraft] = useState(floorArea ? String(floorArea) : '')

  const used = occupiedArea(instances)
  const onPlan = instances.filter((i) => i.onPlan).length

  const commitArea = () => {
    const n = Number(draft.replace(',', '.'))
    setFloorArea(Number.isFinite(n) && n > 0 ? n : null)
  }

  return (
    <section className="panel">
      <div className="stats">
        <div>
          <strong>{onPlan}</strong>
          <span>on plan</span>
        </div>
        <div>
          <strong>{used.toFixed(1)}</strong>
          <span>used m²</span>
        </div>
        <div>
          <strong>{floorArea ? Math.max(0, floorArea - used).toFixed(1) : '—'}</strong>
          <span>free m²</span>
        </div>
      </div>

      <label className="field area-field">
        <span>Apartment floor area (m²)</span>
        <input
          inputMode="decimal"
          placeholder="e.g. 62"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitArea}
          onKeyDown={(e) => e.key === 'Enter' && commitArea()}
        />
      </label>
      <p className="muted tiny">
        The CAD wall layer is an open trace with gaps at every doorway, so floor
        area can't be derived from it. Enter yours to get a free-space figure.
      </p>
    </section>
  )
}

function Hint() {
  return (
    <section className="panel hint">
      <p>Click a piece to select it. Drag to move — edges snap flush to walls.</p>
      <p className="keys">
        <kbd>R</kbd> rotate 15° · <kbd>⌫</kbd> remove · <kbd>Ctrl</kbd>+<kbd>D</kbd> duplicate ·{' '}
        <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>F</kbd> fit · arrows nudge
      </p>
    </section>
  )
}

function Inspector({ item }: { item: Instance }) {
  const { commit, rotateTo, remove, duplicate, unplace, setVariant } = useStore()
  const style = OWNER_STYLE[item.owner]

  return (
    <section className="panel">
      <h2>
        <span className="owner-name">
          <i className="swatch" style={{ background: style.stroke }} />
          {item.label}
        </span>
      </h2>

      <dl className="props">
        <div>
          <dt>Owner</dt>
          <dd>{style.name}</dd>
        </div>
        <div>
          <dt>Footprint</dt>
          <dd>{item.size[0].toFixed(2)} × {item.size[1].toFixed(2)} m</dd>
        </div>
        <div>
          <dt>Height</dt>
          <dd>
            {item.height.toFixed(2)} m
            {item.heightAssumed && <span className="assumed" title="Height was not supplied — assumed">?</span>}
          </dd>
        </div>
        <div>
          <dt>Position</dt>
          <dd>{item.position[0].toFixed(2)}, {item.position[1].toFixed(2)}</dd>
        </div>
      </dl>

      {item.variants && (
        <div className="variants">
          {item.variants.map((v, i) => (
            <button
              key={v.name}
              className={i === (item.variant ?? 0) ? 'active' : ''}
              onClick={() => setVariant(item.id, i)}
            >
              {v.name}
            </button>
          ))}
        </div>
      )}

      <label className="field">
        <span>Rotation {Math.round(((item.rotation % 360) + 360) % 360)}°</span>
        <input
          type="range"
          min={0}
          max={359}
          step={1}
          value={((item.rotation % 360) + 360) % 360}
          onMouseDown={() => commit()}
          onChange={(e) => rotateTo(item.id, Number(e.target.value))}
        />
      </label>

      <div className="row">
        <button onClick={() => { commit(); rotateTo(item.id, item.rotation + 90) }}>Rotate 90°</button>
        <button onClick={() => duplicate(item.id)}>Duplicate</button>
      </div>
      <div className="row">
        {item.onPlan && <button onClick={() => unplace(item.id)}>To tray</button>}
        <button className="danger" onClick={() => remove(item.id)}>Remove</button>
      </div>
    </section>
  )
}

function Tray() {
  const instances = useStore((s) => s.instances)
  const place = useStore((s) => s.place)
  const select = useStore((s) => s.select)
  const tray = instances.filter((i) => !i.onPlan)

  return (
    <section className="panel">
      <h2>Unplaced <span className="count">{tray.length}</span></h2>
      {tray.length === 0 && <p className="muted">Everything is on the plan.</p>}

      {OWNERS.map((owner) => {
        const items = tray.filter((i) => i.owner === owner)
        if (!items.length) return null
        return (
          <div key={owner} className="owner-group">
            <h3>
              <i className="swatch" style={{ background: OWNER_STYLE[owner].stroke }} />
              {OWNER_STYLE[owner].name}
              <span className="count">{items.length}</span>
            </h3>
            <ul className="tray">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/spittastr-instance', item.id)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onClick={() => {
                      place(item.id, item.position)
                      select(item.id)
                    }}
                    title="Drag onto the plan, or click to drop it at its staged position"
                  >
                    <span className="tray-label">{item.label}</span>
                    <span className="tray-size">
                      {item.size[0].toFixed(2)}×{item.size[1].toFixed(2)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}

function Layouts() {
  const { layouts, saveLayout, loadLayout, deleteLayout, instances, importInstances, resetToCad } =
    useStore()
  const [name, setName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const [exportState, setExportState] = useState<'idle' | 'declined' | 'unavailable'>('idle')

  const exportJson = async () => {
    const outcome = await saveTextFile(
      'spittastr-layout.json',
      JSON.stringify(instances, null, 2),
    )
    setExportState(outcome === 'saved' ? 'idle' : outcome)
    if (outcome !== 'saved') setTimeout(() => setExportState('idle'), 5000)
  }

  const importJson = (file: File) => {
    file.text().then((text) => {
      try {
        const parsed = JSON.parse(text)
        if (!Array.isArray(parsed)) throw new Error('not a layout array')
        importInstances(parsed as Instance[])
      } catch {
        alert('That file is not a Spittastr layout export.')
      }
    })
  }

  const save = () => {
    if (!name.trim()) return
    saveLayout(name.trim())
    setName('')
  }

  return (
    <section className="panel">
      <h2>Layouts</h2>
      <div className="row">
        <input
          placeholder="Layout name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <button disabled={!name.trim()} onClick={save}>Save</button>
      </div>

      <ul className="layouts">
        {layouts.map((l) => (
          <li key={l.name}>
            <button onClick={() => loadLayout(l.name)} title={new Date(l.savedAt).toLocaleString()}>
              {l.name}
            </button>
            <button className="icon" onClick={() => deleteLayout(l.name)} title="Delete">×</button>
          </li>
        ))}
        {layouts.length === 0 && <p className="muted">No saved layouts yet.</p>}
      </ul>

      <ShareButton />

      <div className="row">
        <button onClick={exportJson}>Export file</button>
        <button onClick={() => fileRef.current?.click()}>Import file</button>
      </div>
      {exportState === 'declined' && <p className="muted tiny">Save cancelled.</p>}
      {exportState === 'unavailable' && (
        <p className="muted tiny">
          Saving files isn't available here — use “Share this arrangement” to send it instead.
        </p>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) importJson(file)
          e.target.value = ''
        }}
      />
      <button
        className="wide"
        onClick={() => {
          if (confirm('Reset every piece to its starting position?')) resetToCad()
        }}
      >
        Reset all
      </button>
    </section>
  )
}

/**
 * Copies a link with the current arrangement baked into the URL fragment, so
 * whoever opens it lands on exactly this layout.
 */
function ShareButton() {
  const instances = useStore((s) => s.instances)
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  const share = async () => {
    const url = shareUrl(instances)

    // The native share sheet is the right affordance on a phone.
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title: 'Spittastr layout', url })
        return
      } catch {
        /* dismissed — fall through to copying */
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      setState('copied')
    } catch {
      // Clipboard needs a secure context and permission; show the link instead.
      window.prompt('Copy this link:', url)
      setState('failed')
    }
    setTimeout(() => setState('idle'), 2500)
  }

  return (
    <button className="wide primary" onClick={share}>
      {state === 'copied' ? 'Link copied ✓' : 'Share this arrangement'}
    </button>
  )
}

function Options() {
  const {
    showLabels, showCollisions, toggle, visibleOwners, toggleOwner,
    renderMode, setRenderMode, theme, setTheme,
  } = useStore()
  const rows = [
    ['showLabels', 'Labels', showLabels],
    ['showCollisions', 'Collision check', showCollisions],
  ] as const

  return (
    <section className="panel">
      <h2>View</h2>

      <div className="seg">
        <button
          className={renderMode === 'symbols' ? 'active' : ''}
          onClick={() => setRenderMode('symbols')}
          title="CAD-style furniture blocks inside a dashed footprint"
        >
          Blocks
        </button>
        <button
          className={renderMode === 'outline' ? 'active' : ''}
          onClick={() => setRenderMode('outline')}
          title="Plain filled footprints"
        >
          Outlines
        </button>
      </div>

      <div className="seg">
        <button className={theme === 'paper' ? 'active' : ''} onClick={() => setTheme('paper')}>
          Paper
        </button>
        <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>
          Dark
        </button>
      </div>

      <hr />
      {OWNERS.map((owner: Owner) => (
        <label key={owner} className="check">
          <input
            type="checkbox"
            checked={visibleOwners[owner]}
            onChange={() => toggleOwner(owner)}
          />
          <i className="swatch" style={{ background: OWNER_STYLE[owner].stroke }} />
          <span>{OWNER_STYLE[owner].name}'s furniture</span>
        </label>
      ))}
      <hr />
      {rows.map(([key, label, value]) => (
        <label key={key} className="check">
          <input type="checkbox" checked={value} onChange={() => toggle(key)} />
          <span>{label}</span>
        </label>
      ))}
      <button className="wide" onClick={() => window.dispatchEvent(new Event('spittastr:fit'))}>
        Fit to plan
      </button>
    </section>
  )
}
