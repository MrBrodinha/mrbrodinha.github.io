import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_SUPABASE_');
  if (env.VITE_SUPABASE_PUBLISHABLE_KEY && !env.VITE_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')) {
    throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key. Secret and service-role keys must never be built into this site.');
  }
  if (env.VITE_SUPABASE_URL) {
    let url: URL;
    try { url = new URL(env.VITE_SUPABASE_URL); }
    catch { throw new Error('VITE_SUPABASE_URL must be a valid URL without embedded credentials.'); }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
      throw new Error('Use an HTTPS Supabase URL without embedded credentials; HTTP is permitted only for local development.');
    }
  }
  return {
    // Legacy VITE_* participant keys must not enter Vite's client environment.
    envPrefix: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'],
    plugins: [react(), {
      name: 'production-content-security-policy',
      apply: 'build',
      transformIndexHtml() {
        return [{
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: [
              "default-src 'self'",
              "base-uri 'none'",
              "object-src 'none'",
              "script-src 'self'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' https: blob: data:",
              "connect-src 'self' https:",
              "font-src 'self' data:",
              "media-src 'self' blob: data:",
              "frame-src 'self'",
              "form-action 'self'",
            ].join('; '),
          },
          injectTo: 'head-prepend',
        }];
      },
    }],
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
  };
})
