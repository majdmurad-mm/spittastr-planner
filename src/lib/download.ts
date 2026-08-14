/**
 * Handing the viewer a file.
 *
 * The app runs in two very different places:
 *
 *   - a normal browser (dev server, or the standalone .html opened directly),
 *     where a plain anchor download works;
 *   - the published artifact viewer, which is sandboxed and silently ignores
 *     anchor downloads — blob: and data: hrefs included. There, saving has to
 *     go through the `downloads` runtime capability, which shows the viewer a
 *     confirmation they can decline.
 *
 * Prefer the capability when it is present, fall back to the anchor otherwise.
 */

type SaveOutcome = 'saved' | 'declined' | 'unavailable'

interface DownloadsNamespace {
  save(request: { filename: string; data: string | Blob }): Promise<{ status: 'saved' }>
}

interface ClaudeGlobal {
  use?(name: string): Promise<unknown>
}

/**
 * The `claude` global only exists inside the artifact viewer; in every other
 * context it is simply absent, so this must not assume it is there.
 */
async function downloadsNamespace(): Promise<DownloadsNamespace | null> {
  const claude = (globalThis as { claude?: ClaudeGlobal }).claude
  if (!claude?.use) return null
  try {
    return ((await claude.use('downloads')) as DownloadsNamespace | null) ?? null
  } catch {
    return null
  }
}

function anchorDownload(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function saveTextFile(filename: string, text: string): Promise<SaveOutcome> {
  const downloads = await downloadsNamespace()

  if (downloads) {
    try {
      await downloads.save({ filename, data: text })
      return 'saved'
    } catch (err) {
      const code = (err as { code?: string } | null)?.code
      // The viewer said no, or a prompt is already open — never auto-retry,
      // and never fall through to an anchor the viewer would ignore anyway.
      if (code === 'declined' || code === 'rate_limited') return 'declined'
      return 'unavailable'
    }
  }

  anchorDownload(filename, text)
  return 'saved'
}
