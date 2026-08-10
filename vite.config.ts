import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the build drops cleanly into any Wavespace/webspace folder.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    // Finished uploadable site (not `dist`) — copy contents of `www/` to your webspace.
    outDir: 'www',
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5173,
  },
})
