// Turn the single-file build into a fragment suitable for publishing.
//
//   npm run build && node scripts/build-artifact.mjs
//
// The publishing host supplies its own <!doctype>, <html>, <head> and <body>,
// so a complete document would end up nested inside another one. This strips
// the shell and keeps the title, styles, mount point and bundle.

import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROJECT = path.resolve(HERE, '..')
const SRC = path.join(PROJECT, 'dist', 'index.html')
const OUT = path.join(PROJECT, 'dist', 'artifact.html')
const STANDALONE = path.join(PROJECT, 'dist', 'standalone.html')

if (!fs.existsSync(SRC)) {
  console.error('dist/index.html not found — run `npm run build` first.')
  process.exit(1)
}

const html = fs.readFileSync(SRC, 'utf8')

const grabAll = (re) => [...html.matchAll(re)].map((m) => m[0])

const styles = grabAll(/<style[^>]*>[\s\S]*?<\/style>/gi)
const scripts = grabAll(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi)

if (!scripts.length) {
  console.error('No inline script found — is vite-plugin-singlefile still enabled?')
  process.exit(1)
}
if (html.includes('<script') && /<script[^>]*\bsrc=/i.test(html)) {
  console.error('Found an external <script src=>; the build is not self-contained.')
  process.exit(1)
}
if (/<link[^>]*\bhref=["']https?:/i.test(html)) {
  console.error('Found an external stylesheet link; the build is not self-contained.')
  process.exit(1)
}

// The bundle is built as an IIFE so it does not need module semantics. Browsers
// apply CORS to module scripts, which makes `file://` unreliable — and a
// double-clickable file is the whole point of the standalone build. Drop the
// attribute, but only after confirming the code really isn't an ES module.
// Verify by actually parsing rather than by pattern-matching. `new vm.Script`
// compiles as a CLASSIC script — exactly how the browser will treat it once the
// module type is stripped — so genuine top-level `import`/`export` or
// `import.meta` throws here. Grepping gives false positives: supabase-js
// carries the text `import ws from "ws"` inside a string literal for its Node
// fallback, which is harmless.
const classicScripts = scripts.map((tag) => {
  const body = tag.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '')
  try {
    new vm.Script(body, { filename: 'bundle.js' }) // compile only, never run
  } catch (err) {
    console.error('Bundle does not parse as a classic script; refusing to strip type="module".')
    console.error(`  ${err.message}`)
    console.error('Check that build.rollupOptions.output.format is "iife" in vite.config.ts.')
    process.exit(1)
  }
  return tag.replace(/^<script[^>]*>/i, '<script>')
})

const TITLE = 'Spittastr — Furniture Planner'

// Title must sit near the top — the host only scans the first few KB for it.
const fragment = [
  `<title>${TITLE}</title>`,
  ...styles,
  '<div id="root"></div>',
  ...classicScripts,
].join('\n')

fs.writeFileSync(OUT, fragment)

// A complete document too, for sending someone the file directly. Opens from a
// USB stick, an email attachment or any static host, with no account anywhere.
const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#16161e">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>${TITLE}</title>
${styles.join('\n')}
</head>
<body>
<div id="root"></div>
${classicScripts.join('\n')}
</body>
</html>`

fs.writeFileSync(STANDALONE, standalone)

const kb = (n) => `${(n / 1024).toFixed(0)} KB`
console.log(`Wrote ${path.relative(PROJECT, OUT)}      ${kb(fragment.length)}  (fragment, for publishing)`)
console.log(`Wrote ${path.relative(PROJECT, STANDALONE)}   ${kb(standalone.length)}  (full page, double-clickable)`)
console.log(`  ${styles.length} inline style block(s), ${classicScripts.length} inline classic script(s)`)
console.log('  no external references, no module semantics')
