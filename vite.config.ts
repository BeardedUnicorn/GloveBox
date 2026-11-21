import process from 'node:process';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const host = process.env.TAURI_DEV_HOST;

// MediaPipe's runtime ships inside the app (src/tracking/mediapipe/assets.ts),
// so hand tracking works offline: only the loader and binary the default
// (non-module) fileset uses.
const MEDIAPIPE_WASM = 'node_modules/@mediapipe/tasks-vision/wasm';

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: [`${MEDIAPIPE_WASM}/vision_wasm_internal.js`, `${MEDIAPIPE_WASM}/vision_wasm_internal.wasm`],
          dest: 'mediapipe/wasm',
          rename: { stripBase: true },
        },
      ],
    }),
  ],
  // Tauri expects a fixed port, and its errors shouldn't be cleared away
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    target: 'safari16',
  },
});
