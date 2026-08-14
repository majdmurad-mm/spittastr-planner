import { useState } from 'react'

import { roomUrl } from '../lib/room'
import { SYNC_CONFIGURED } from '../lib/sync'
import { room } from '../lib/useSync'
import { useStore } from '../store'

const LABEL: Record<string, string> = {
  off: 'Not shared',
  connecting: 'Connecting…',
  live: 'Live',
  error: 'Connection problem',
}

/**
 * Sharing a room, and who is currently in it.
 *
 * The room link is the credential — there are no accounts — so this is the one
 * place that says so, rather than leaving it implied.
 */
export function SharePanel() {
  const syncState = useStore((s) => s.syncState)
  const syncDetail = useStore((s) => s.syncDetail)
  const peers = useStore((s) => s.peers)
  const displayName = useStore((s) => s.displayName)
  const setDisplayName = useStore((s) => s.setDisplayName)
  const [copied, setCopied] = useState(false)

  const copyLink = async () => {
    const url = roomUrl(room.id)
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title: 'Spittastr — our plan', url })
        return
      } catch {
        /* dismissed — fall through to copying */
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      window.prompt('Copy this link:', url)
    }
  }

  return (
    <section className="panel">
      <h2>
        Shared plan
        <span className={`status status-${syncState}`}>{LABEL[syncState] ?? syncState}</span>
      </h2>

      {!SYNC_CONFIGURED ? (
        <p className="muted tiny">
          Live sharing isn't switched on in this build. Your changes are saved on this
          device only.
        </p>
      ) : (
        <>
          <label className="field">
            <span>Your name</span>
            <input
              placeholder="e.g. Majd"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>

          <p className="muted tiny presence">
            {syncState === 'live' && peers.length === 0 && 'Nobody else is here right now.'}
            {syncState === 'live' && peers.length > 0 && (
              <>
                <i className="dot" /> {peers.map((p) => p.name).join(', ')}{' '}
                {peers.length === 1 ? 'is' : 'are'} here — you'll see each other's changes as
                they happen.
              </>
            )}
            {syncState === 'error' && (syncDetail ?? 'Trying to reconnect.')}
            {syncState === 'connecting' && 'Joining the room…'}
          </p>

          <button className="wide primary" onClick={copyLink}>
            {copied ? 'Link copied ✓' : 'Copy the link to this plan'}
          </button>
          <p className="muted tiny">
            Anyone with this link can view and edit the plan — it works instead of a
            password, so share it only with people you want editing.
          </p>
        </>
      )}
    </section>
  )
}
