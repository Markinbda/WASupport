import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Load env from the monorepo root so the web app and Netlify Functions
  // share a single .env.local file.
  envDir: '../..',
  server: {
    port: 5173,
    strictPort: true,
    // Forward Netlify function calls to the local Netlify dev server (port 8888)
    // so `/api/*` works in `pnpm dev` as well. Requires `netlify dev` (or
    // `netlify functions:serve`) to be running alongside Vite.
    proxy: {
      '/api': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      '/.netlify/functions': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
