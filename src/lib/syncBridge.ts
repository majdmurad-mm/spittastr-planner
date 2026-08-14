import type { Instance, Pt } from '../types'
import type { SyncHandle } from './sync'

/**
 * A one-way hatch from the store out to the live connection.
 *
 * The store must not import the Supabase client (it would then be impossible
 * to use offline, and every test would need a network stub), and the sync
 * layer must not import the store (circular). This module is the seam.
 *
 * `applyingRemote` is the echo guard: while a remote edit is being written
 * into the store, outgoing publishes are suppressed, so a change does not
 * bounce back to the person who made it and start a feedback loop.
 */

let handle: SyncHandle | null = null
let applyingRemote = false

export const syncBridge = {
  attach(next: SyncHandle | null) {
    handle = next
  },

  detach() {
    handle = null
  },

  /** Run a store mutation that came from someone else, without re-publishing it. */
  asRemote<T>(fn: () => T): T {
    applyingRemote = true
    try {
      return fn()
    } finally {
      applyingRemote = false
    }
  },

  piece(id: string, position: Pt, rotation: number) {
    if (applyingRemote) return
    handle?.broadcastPiece(id, position, rotation)
  },

  layout(instances: Instance[]) {
    if (applyingRemote) return
    handle?.broadcastLayout(instances)
  },
}
