import type { Instance, Pt } from '../types'
import { instanceFrom, plan } from './plan'

/**
 * Encode an arrangement into a URL fragment so it can be sent to someone else.
 *
 * Only the transform is carried: geometry, size and heights are rebuilt from
 * the catalog by `defId`. That keeps a full 21-piece layout under ~1 kB of
 * base64 instead of the ~8 kB a naive dump of the instances would need.
 *
 * Row format: [defId, x, y, rotation, onPlan, variant]
 */

type Row = [string, number, number, number, 0 | 1, number]

const round = (n: number) => Math.round(n * 1000) / 1000

// base64url over UTF-8, so the code survives being pasted into a URL.
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(code: string): string {
  const padded = code.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function encodeLayout(instances: Instance[]): string {
  const rows: Row[] = instances.map((i) => [
    i.defId,
    round(i.position[0]),
    round(i.position[1]),
    round(i.rotation),
    i.onPlan ? 1 : 0,
    i.variant ?? -1,
  ])
  return toBase64Url(JSON.stringify(rows))
}

export function decodeLayout(code: string): Instance[] | null {
  try {
    const rows = JSON.parse(fromBase64Url(code)) as Row[]
    if (!Array.isArray(rows)) return null

    const out: Instance[] = []
    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 5) continue
      const [defId, x, y, rotation, onPlan, variant] = row
      const def = plan.catalog.find((c) => c.id === defId)
      if (!def) continue // catalog changed since the link was made — skip it

      const inst = instanceFrom(def, {
        position: [x, y] as Pt,
        rotation,
        onPlan: onPlan === 1,
      })
      if (typeof variant === 'number' && variant >= 0 && def.variants?.[variant]) {
        inst.variant = variant
        inst.size = def.variants[variant].size
        inst.footprint = def.variants[variant].footprint
      }
      out.push(inst)
    }
    return out.length ? out : null
  } catch {
    return null
  }
}

export const SHARE_PREFIX = '#layout='

/** Full URL for the current arrangement. */
export function shareUrl(instances: Instance[]): string {
  const { origin, pathname, search } = window.location
  return `${origin}${pathname}${search}${SHARE_PREFIX}${encodeLayout(instances)}`
}

/** Read an arrangement out of the address bar, if one was linked. */
export function layoutFromUrl(): Instance[] | null {
  const hash = window.location.hash
  if (!hash.startsWith(SHARE_PREFIX)) return null
  return decodeLayout(hash.slice(SHARE_PREFIX.length))
}
