import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Link previews need absolute URLs. SITE_URL wins; on Vercel the production
// domain is known at build time; locally the dev address is used.
const siteUrl = (
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : `http://localhost:${process.env.FRONTEND_PORT || 5173}`)
).replace(/\/$/, '');

const siteUrlPlugin = (): Plugin => ({
  name: 'site-url',
  transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl),
});

// In development Vite serves the app and forwards /api to the backend, so the
// browser sees one origin, as it does on Vercel.
export default defineConfig({
  plugins: [react(), siteUrlPlugin()],
  server: {
    port: Number(process.env.FRONTEND_PORT || 5173),
    proxy: { '/api': process.env.BACKEND_URL || 'http://127.0.0.1:3000' },
  },
  build: {
    // Keep every asset a separate file: the security policy allows no inline code.
    assetsInlineLimit: 0,
  },
});
