/**
 * The room id is the shared identity of a layout — and, since there are no
 * accounts, it is also the credential. It lives in the URL so that sending
 * someone the link is all it takes to bring them into the same plan.
 */

const PARAM = 'room'

function randomRoomId(): string {
  // 128 bits from the platform CSPRNG. randomUUID needs a secure context,
  // which excludes plain http:// on a LAN address, so keep a real fallback.
  if (crypto.randomUUID) return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Read the room from the URL, minting one if absent.
 *
 * A fresh room is written back with replaceState rather than a reload, so the
 * address bar always shows a link that is safe to send to someone.
 */
export function resolveRoom(): { id: string; isNew: boolean } {
  const params = new URLSearchParams(window.location.search)
  const existing = params.get(PARAM)

  if (existing && UUID_RE.test(existing)) return { id: existing, isNew: false }

  const id = randomRoomId()
  params.set(PARAM, id)
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}?${params.toString()}${window.location.hash}`,
  )
  return { id, isNew: true }
}

/** Link to this room, for sending to the other person. */
export function roomUrl(roomId: string): string {
  const { origin, pathname } = window.location
  return `${origin}${pathname}?${PARAM}=${roomId}`
}
