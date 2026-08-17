import { useEffect } from 'react'

import { reconcileWithCatalog } from './plan'
import { resolveRoom } from './room'
import { createSync } from './sync'
import { syncBridge } from './syncBridge'
import { useStore } from '../store'

/** The room is fixed for the life of the page — the link identifies the plan. */
export const room = resolveRoom()

/**
 * Opens the live connection once and keeps it for the life of the app.
 *
 * Deliberately not re-created when the display name changes: tearing down the
 * channel on every keystroke in the name field would thrash the connection.
 * The name is read once, at connect time.
 */
export function useSync() {
  useEffect(() => {
    const store = useStore.getState()

    const handle = createSync({
      roomId: room.id,
      name: store.displayName || 'Someone',
      getLayout: () => useStore.getState().instances,
      // Layouts arriving from the database or the other person may predate a
      // piece being added to the catalog. Reconciling is idempotent — the
      // seeded id is deterministic — so it is safe to run on every message.
      onLayout: (instances) =>
        syncBridge.asRemote(() =>
          useStore.getState().applyRemoteLayout(reconcileWithCatalog(instances)),
        ),
      onPiece: (id, position, rotation) =>
        syncBridge.asRemote(() => useStore.getState().applyRemotePiece(id, position, rotation)),
      onState: (state, detail) => useStore.getState().setSyncState(state, detail),
      onPeers: (peers) => useStore.getState().setPeers(peers),
    })

    syncBridge.attach(handle)

    return () => {
      handle?.destroy()
      syncBridge.detach()
    }
  }, [])
}
