import { create } from 'zustand'

import type { Instance, Owner, Pt, SavedLayout } from './types'
import { initialInstances, instanceFrom, newInstanceId, plan } from './lib/plan'
import { layoutFromUrl } from './lib/share'
import { storage } from './lib/storage'
import { SYNC_CONFIGURED, type Peer, type SyncState } from './lib/sync'
import { syncBridge } from './lib/syncBridge'
import type { ThemeName } from './lib/theme'

const AUTOSAVE_KEY = 'spittastr.autosave.v2'
const LAYOUTS_KEY = 'spittastr.layouts.v1'
const FLOOR_AREA_KEY = 'spittastr.floorArea.v1'
const MODE_KEY = 'spittastr.renderMode.v1'
const THEME_KEY = 'spittastr.theme.v1'
const NAME_KEY = 'spittastr.displayName.v1'
const HISTORY_LIMIT = 100

export type RenderMode = 'outline' | 'symbols'

function loadAutosave(): Instance[] | null {
  const parsed = storage.json<Instance[] | null>(AUTOSAVE_KEY, null)
  return Array.isArray(parsed) && parsed.length ? parsed : null
}

function loadLayouts(): SavedLayout[] {
  const parsed = storage.json<SavedLayout[]>(LAYOUTS_KEY, [])
  return Array.isArray(parsed) ? parsed : []
}

/**
 * A shared link wins over the autosave: someone opening a link expects to see
 * the arrangement they were sent, not whatever they last dragged around.
 */
function startingInstances(): Instance[] {
  return layoutFromUrl() ?? loadAutosave() ?? initialInstances()
}

interface State {
  instances: Instance[]
  selectedId: string | null
  past: Instance[][]
  future: Instance[][]
  layouts: SavedLayout[]
  showLabels: boolean
  showCollisions: boolean
  /** outline = plain footprints; symbols = CAD-style blocks in a dashed boundary. */
  renderMode: RenderMode
  setRenderMode: (mode: RenderMode) => void
  theme: ThemeName
  setTheme: (theme: ThemeName) => void
  /** Which owners' pieces are visible on the plan. */
  visibleOwners: Record<Owner, boolean>
  /**
   * Apartment floor area in m², entered by the user. The CAD file's wall layer
   * is an open trace, so this can't be derived reliably — see FloorPlan.
   */
  floorArea: number | null
  setFloorArea: (value: number | null) => void
  toggleOwner: (owner: Owner) => void
  setVariant: (id: string, variant: number) => void

  select: (id: string | null) => void
  /** Record the current state so the next mutation is undoable. */
  commit: () => void
  moveTo: (id: string, position: Pt) => void
  rotateTo: (id: string, rotation: number) => void
  nudge: (id: string, dx: number, dy: number) => void
  place: (id: string, position: Pt) => void
  unplace: (id: string) => void
  duplicate: (id: string) => void
  remove: (id: string) => void
  addFromCatalog: (defId: string, position: Pt) => void
  resetToCad: () => void

  undo: () => void
  redo: () => void

  saveLayout: (name: string) => void
  loadLayout: (name: string) => void
  deleteLayout: (name: string) => void
  importInstances: (instances: Instance[]) => void

  toggle: (key: 'showLabels' | 'showCollisions') => void

  // --- live sharing ---
  syncState: SyncState
  syncDetail?: string
  peers: Peer[]
  displayName: string
  setDisplayName: (name: string) => void
  setSyncState: (state: SyncState, detail?: string) => void
  setPeers: (peers: Peer[]) => void
  /** Apply an edit that came from the other person; never re-published, never undoable. */
  applyRemoteLayout: (instances: Instance[]) => void
  applyRemotePiece: (id: string, position: Pt, rotation: number) => void
}

export const useStore = create<State>((set, get) => {
  const persist = (instances: Instance[]) => {
    try {
      storage.set(AUTOSAVE_KEY, JSON.stringify(instances))
    } catch {
      /* quota or private mode — autosave is best-effort */
    }
  }

  /** Apply a change, pushing the previous state onto the undo stack. */
  const mutate = (fn: (items: Instance[]) => Instance[]) => {
    const { instances, past } = get()
    const next = fn(instances)
    persist(next)
    set({
      instances: next,
      past: [...past, instances].slice(-HISTORY_LIMIT),
      future: [],
    })
    // Structural edits go out whole; the bridge ignores this while a remote
    // change is being applied, so edits don't echo back and loop.
    syncBridge.layout(next)
  }

  return {
    instances: startingInstances(),
    selectedId: null,
    past: [],
    future: [],
    layouts: loadLayouts(),
    showLabels: true,
    showCollisions: true,
    renderMode: storage.get(MODE_KEY) === 'outline' ? 'outline' : 'symbols',
    theme: storage.get(THEME_KEY) === 'dark' ? 'dark' : 'paper',

    setRenderMode: (mode) => {
      storage.set(MODE_KEY, mode)
      set({ renderMode: mode })
    },
    setTheme: (theme) => {
      storage.set(THEME_KEY, theme)
      set({ theme })
    },

    visibleOwners: { majd: true, laura: true },
    floorArea: (() => {
      const raw = storage.get(FLOOR_AREA_KEY)
      const n = raw === null ? NaN : Number(raw)
      return Number.isFinite(n) && n > 0 ? n : null
    })(),

    setFloorArea: (value) => {
      if (value === null) storage.remove(FLOOR_AREA_KEY)
      else storage.set(FLOOR_AREA_KEY, String(value))
      set({ floorArea: value })
    },

    toggleOwner: (owner) =>
      set((s) => ({ visibleOwners: { ...s.visibleOwners, [owner]: !s.visibleOwners[owner] } })),

    setVariant: (id, variant) =>
      mutate((items) =>
        items.map((i) => {
          if (i.id !== id || !i.variants?.[variant]) return i
          const v = i.variants[variant]
          return { ...i, variant, size: v.size, footprint: v.footprint }
        }),
      ),

    select: (id) => set({ selectedId: id }),

    commit: () => {
      const { instances, past } = get()
      set({ past: [...past, instances].slice(-HISTORY_LIMIT), future: [] })
    },

    // Live drag/rotate updates bypass history — the preceding commit() on
    // drag-start already captured the pre-move state, so a drag is one undo
    // step rather than hundreds.
    moveTo: (id, position) =>
      set((s) => {
        const next = s.instances.map((i) => (i.id === id ? { ...i, position } : i))
        persist(next)
        const moved = next.find((i) => i.id === id)
        // Send just this piece: a whole-layout message would snap the other
        // person's piece back if you both happen to be dragging at once.
        if (moved) syncBridge.piece(id, moved.position, moved.rotation)
        return { instances: next }
      }),

    rotateTo: (id, rotation) =>
      set((s) => {
        const next = s.instances.map((i) => (i.id === id ? { ...i, rotation } : i))
        persist(next)
        const turned = next.find((i) => i.id === id)
        if (turned) syncBridge.piece(id, turned.position, turned.rotation)
        return { instances: next }
      }),

    nudge: (id, dx, dy) =>
      mutate((items) =>
        items.map((i) =>
          i.id === id ? { ...i, position: [i.position[0] + dx, i.position[1] + dy] as Pt } : i,
        ),
      ),

    place: (id, position) =>
      mutate((items) => items.map((i) => (i.id === id ? { ...i, position, onPlan: true } : i))),

    unplace: (id) => mutate((items) => items.map((i) => (i.id === id ? { ...i, onPlan: false } : i))),

    duplicate: (id) => {
      const src = get().instances.find((i) => i.id === id)
      if (!src) return
      const copy: Instance = {
        ...src,
        id: newInstanceId(src.defId),
        position: [src.position[0] + 0.3, src.position[1] + 0.3],
      }
      mutate((items) => [...items, copy])
      set({ selectedId: copy.id })
    },

    remove: (id) => {
      mutate((items) => items.filter((i) => i.id !== id))
      if (get().selectedId === id) set({ selectedId: null })
    },

    addFromCatalog: (defId, position) => {
      const def = plan.catalog.find((c) => c.id === defId)
      if (!def) return
      const inst = instanceFrom(def, { position, onPlan: true })
      mutate((items) => [...items, inst])
      set({ selectedId: inst.id })
    },

    resetToCad: () => {
      mutate(() => initialInstances())
      set({ selectedId: null })
    },

    undo: () => {
      const { past, future, instances } = get()
      if (!past.length) return
      const previous = past[past.length - 1]
      persist(previous)
      set({
        instances: previous,
        past: past.slice(0, -1),
        future: [instances, ...future].slice(0, HISTORY_LIMIT),
      })
    },

    redo: () => {
      const { past, future, instances } = get()
      if (!future.length) return
      const next = future[0]
      persist(next)
      set({
        instances: next,
        past: [...past, instances].slice(-HISTORY_LIMIT),
        future: future.slice(1),
      })
    },

    saveLayout: (name) => {
      const entry: SavedLayout = {
        name,
        savedAt: new Date().toISOString(),
        instances: get().instances,
      }
      const layouts = [...get().layouts.filter((l) => l.name !== name), entry]
      storage.set(LAYOUTS_KEY, JSON.stringify(layouts))
      set({ layouts })
    },

    loadLayout: (name) => {
      const found = get().layouts.find((l) => l.name === name)
      if (!found) return
      mutate(() => found.instances)
      set({ selectedId: null })
    },

    deleteLayout: (name) => {
      const layouts = get().layouts.filter((l) => l.name !== name)
      storage.set(LAYOUTS_KEY, JSON.stringify(layouts))
      set({ layouts })
    },

    importInstances: (instances) => {
      mutate(() => instances)
      set({ selectedId: null })
    },

    toggle: (key) => set((s) => ({ [key]: !s[key] }) as unknown as Partial<State>),

    // --- live sharing ---
    syncState: SYNC_CONFIGURED ? 'connecting' : 'off',
    peers: [],
    displayName: storage.get(NAME_KEY) ?? '',

    setDisplayName: (name) => {
      storage.set(NAME_KEY, name)
      set({ displayName: name })
    },

    setSyncState: (state, detail) => set({ syncState: state, syncDetail: detail }),
    setPeers: (peers) => set({ peers }),

    applyRemoteLayout: (instances) =>
      set(() => {
        persist(instances)
        // Deliberately not pushed onto the undo stack: undo should take back
        // your own edits, not silently revert the other person's.
        return { instances }
      }),

    applyRemotePiece: (id, position, rotation) =>
      set((s) => {
        const next = s.instances.map((i) => (i.id === id ? { ...i, position, rotation } : i))
        persist(next)
        return { instances: next }
      }),
  }
})

// Handy for poking at state and snapping behaviour from the console.
if (import.meta.env.DEV) {
  const w = window as unknown as Record<string, unknown>
  w.__store = useStore
  w.__plan = plan
  void Promise.all([
    import('./lib/snap'),
    import('./lib/geometry2d'),
    import('./lib/symbols'),
    import('./lib/theme'),
    import('./lib/share'),
  ]).then(([snap, geom, symbols, theme, share]) => {
    w.__snap = snap
    w.__geom = geom
    w.__symbols = symbols
    w.__theme = theme
    w.__share = share
  })
}
