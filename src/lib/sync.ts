import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'

import type { Instance, Pt } from '../types'

/**
 * Live shared editing.
 *
 * Two mechanisms, deliberately:
 *
 *   - **Broadcast** carries edits between people who are connected right now.
 *     Dragging fires many updates a second, so those go out as lightweight
 *     per-piece messages and never touch the database.
 *   - **The `layouts` row** is the durable copy. It is written on a debounce
 *     and read once on open, so someone joining later — or after everyone
 *     closed the tab — still sees the current arrangement.
 *
 * Per-piece messages matter for correctness, not just bandwidth: if both
 * people drag at once and each sent the whole layout, whoever's message landed
 * last would snap the other's piece back. Applying a single piece touches only
 * that piece, so simultaneous edits to different furniture both survive.
 */

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined

/** Sync is optional: with no credentials the app runs perfectly well alone. */
export const SYNC_CONFIGURED = Boolean(URL && KEY)

const SAVE_DEBOUNCE_MS = 900

export type SyncState = 'off' | 'connecting' | 'live' | 'error'

export interface Peer {
  id: string
  name: string
}

export interface SyncHandle {
  broadcastPiece(id: string, position: Pt, rotation: number): void
  broadcastLayout(instances: Instance[]): void
  destroy(): void
}

interface SyncOptions {
  roomId: string
  name: string
  /** The whole arrangement changed (loaded from the database, or a structural edit). */
  onLayout(instances: Instance[]): void
  /** One piece moved. */
  onPiece(id: string, position: Pt, rotation: number): void
  onState(state: SyncState, detail?: string): void
  onPeers(peers: Peer[]): void
  /** Current layout, read when the room turns out to be empty and needs seeding. */
  getLayout(): Instance[]
}

interface PieceMessage {
  from: string
  id: string
  position: Pt
  rotation: number
}

interface LayoutMessage {
  from: string
  instances: Instance[]
}

export function createSync(options: SyncOptions): SyncHandle | null {
  if (!SYNC_CONFIGURED) return null

  const client: SupabaseClient = createClient(URL!, KEY!, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 30 } },
  })

  // Identifies this tab so its own broadcasts can be ignored on the way back.
  const self = crypto.randomUUID?.() ?? String(Math.random()).slice(2)
  let channel: RealtimeChannel | null = null
  let destroyed = false
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let dirty = false

  const fail = (detail: string) => {
    if (!destroyed) options.onState('error', detail)
  }

  // --- durable copy ---------------------------------------------------------

  const flush = async () => {
    saveTimer = null
    if (!dirty) return
    dirty = false
    // Read the layout at flush time, not at schedule time, so a debounced save
    // during a drag stores where the piece actually ended up.
    const instances = options.getLayout()

    const { error } = await client
      .from('layouts')
      .upsert(
        {
          room: options.roomId,
          instances,
          updated_at: new Date().toISOString(),
          updated_by: options.name,
        },
        { onConflict: 'room' },
      )

    // A permission error here almost always means the table grants are missing
    // — see supabase/setup.sql. Surface it rather than failing silently.
    if (error) fail(`Could not save: ${error.message}`)
  }

  const scheduleSave = () => {
    dirty = true
    if (saveTimer) return
    saveTimer = setTimeout(flush, SAVE_DEBOUNCE_MS)
  }

  const loadInitial = async () => {
    const { data, error } = await client
      .from('layouts')
      .select('instances')
      .eq('room', options.roomId)
      .maybeSingle()

    if (destroyed) return

    if (error) {
      fail(`Could not load the room: ${error.message}`)
      return
    }

    if (data?.instances) {
      options.onLayout(data.instances as Instance[])
    } else {
      // First person into this room: seed it from what they already have.
      scheduleSave()
    }
  }

  // --- live channel ---------------------------------------------------------

  options.onState('connecting')

  channel = client.channel(`room:${options.roomId}`, {
    config: { broadcast: { self: false }, presence: { key: self } },
  })

  channel
    .on('broadcast', { event: 'piece' }, ({ payload }) => {
      const msg = payload as PieceMessage
      if (!msg || msg.from === self) return
      options.onPiece(msg.id, msg.position, msg.rotation)
    })
    .on('broadcast', { event: 'layout' }, ({ payload }) => {
      const msg = payload as LayoutMessage
      if (!msg || msg.from === self || !Array.isArray(msg.instances)) return
      options.onLayout(msg.instances)
    })
    .on('presence', { event: 'sync' }, () => {
      if (!channel) return
      const state = channel.presenceState<{ name: string }>()
      const peers: Peer[] = Object.entries(state)
        .filter(([id]) => id !== self)
        .map(([id, entries]) => ({ id, name: entries[0]?.name ?? 'Someone' }))
      options.onPeers(peers)
    })
    .subscribe((status, err) => {
      if (destroyed) return
      if (status === 'SUBSCRIBED') {
        options.onState('live')
        void channel?.track({ name: options.name })
        void loadInitial()
      } else if (status === 'CHANNEL_ERROR') {
        fail(err?.message ?? 'Realtime connection failed')
      } else if (status === 'TIMED_OUT') {
        fail('Realtime connection timed out')
      } else if (status === 'CLOSED') {
        options.onPeers([])
      }
    })

  return {
    broadcastPiece(id, position, rotation) {
      void channel?.send({
        type: 'broadcast',
        event: 'piece',
        payload: { from: self, id, position, rotation } satisfies PieceMessage,
      })
      // Dragging is still a real edit — persist it, debounced, so closing the
      // tab mid-session doesn't lose where the piece ended up.
      scheduleSave()
    },

    broadcastLayout(instances) {
      void channel?.send({
        type: 'broadcast',
        event: 'layout',
        payload: { from: self, instances } satisfies LayoutMessage,
      })
      scheduleSave()
    },

    destroy() {
      destroyed = true
      if (saveTimer) {
        clearTimeout(saveTimer)
        void flush() // don't lose the last edit on unmount
      }
      void channel?.unsubscribe()
      channel = null
    },
  }
}
