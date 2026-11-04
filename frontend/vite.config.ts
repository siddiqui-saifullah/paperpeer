import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development Vite serves the app and forwards /api to the backend, so the
// browser sees one origin, as it does on Vercel.
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.FRONTEND_PORT || 5173),
    proxy: { '/api': process.env.BACKEND_URL || 'http://127.0.0.1:3000' },
  },
  build: {
    // Keep every asset a separate file: the security policy allows no inline code.
    assetsInlineLimit: 0,
  },
});
