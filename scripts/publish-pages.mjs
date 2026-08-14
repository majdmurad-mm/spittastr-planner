// Stage the built app for GitHub Pages.
//
//   npm run deploy      (build + stage, then commit and push)
//
// Pages serves the `docs/` folder on the main branch. The build is a single
// self-contained file, so there are no asset paths to rewrite and the site
// works at any sub-path — which is what GitHub Pages serves from.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROJECT = path.resolve(HERE, '..')
const SRC = path.join(PROJECT, 'dist', 'standalone.html')
const DOCS = path.join(PROJECT, 'docs')

if (!fs.existsSync(SRC)) {
  console.error('dist/standalone.html not found — run `npm run build:share` first.')
  process.exit(1)
}

fs.mkdirSync(DOCS, { recursive: true })
fs.copyFileSync(SRC, path.join(DOCS, 'index.html'))

// Without this, Pages runs the content through Jekyll, which ignores files and
// folders beginning with an underscore.
fs.writeFileSync(path.join(DOCS, '.nojekyll'), '')

const html = fs.readFileSync(SRC, 'utf8')
const configured = html.includes('supabase.co')

console.log(`Staged docs/index.html  ${(html.length / 1024).toFixed(0)} KB`)
console.log(
  configured
    ? '  live sharing: credentials baked in'
    : '  live sharing: NOT configured (no .env) — the app will run standalone',
)
