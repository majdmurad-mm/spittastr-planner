import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Builds to a single self-contained index.html with every asset inlined, so the
// app can be published as one file and opened from anywhere with no server.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  server: { open: true },
  build: {
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        // Emit a classic script rather than an ES module. Browsers apply CORS
        // to module scripts, which makes `file://` unreliable — and the whole
        // point of the single-file build is that someone can double-click it.
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
  },
})
