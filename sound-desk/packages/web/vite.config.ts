import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The UI is built to be host-agnostic: `base: './'` makes every asset reference
 * relative, which is what the VSCode webview needs (it loads the bundle through
 * a `vscode-webview://` URI, so absolute `/assets/...` paths would 404).
 *
 * In dev, `/api` and `/ws` are proxied to the local engine so the browser talks
 * to the same process the extension would.
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
  },
  server: {
    port: 5178,
    proxy: {
      '/api': {
        target: process.env.SOUNDDESK_ENGINE_URL ?? 'http://127.0.0.1:8791',
        changeOrigin: false,
      },
      '/ws': {
        target: (process.env.SOUNDDESK_ENGINE_URL ?? 'http://127.0.0.1:8791').replace(/^http/, 'ws'),
        ws: true,
      },
    },
  },
});
