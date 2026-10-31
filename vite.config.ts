import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep the runtime and its CommonJS helpers independent of lazy pages.
          if (id.includes('commonjsHelpers') || /\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|@remix-run\/router)\//.test(id)) {
            return 'react-vendor';
          }
          if (id.includes('/node_modules/abcjs/')) {
            // Parser and renderer share CommonJS initialization state. Split
            // only the symbol table and its spacing dependency to avoid a cycle.
            return id.endsWith('/write/creation/glyphs.js') || id.endsWith('/write/helpers/spacing.js')
              ? 'notation-symbols' : 'notation';
          }
        },
      },
    },
  },
})
