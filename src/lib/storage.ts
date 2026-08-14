/**
 * localStorage that never throws.
 *
 * The app is published as a self-contained page and may run inside a sandboxed
 * iframe or with storage blocked entirely. Persistence is a convenience here,
 * never a requirement — a storage failure must not take down the canvas.
 */

let warned = false

function warnOnce(err: unknown) {
  if (warned) return
  warned = true
  console.warn('Storage unavailable; layouts will not persist between visits.', err)
}

export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch (err) {
      warnOnce(err)
      return null
    }
  },

  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value)
    } catch (err) {
      warnOnce(err)
    }
  },

  remove(key: string) {
    try {
      localStorage.removeItem(key)
    } catch (err) {
      warnOnce(err)
    }
  },

  json<T>(key: string, fallback: T): T {
    const raw = this.get(key)
    if (raw === null) return fallback
    try {
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  },
}
