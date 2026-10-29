import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // HarfBuzz (text outlines for export) starts its WebAssembly with a top-level await.
    target: 'es2022',
    // The 3D stage loads on demand and is three.js, about 504 kB; the main bundle stays far under.
    chunkSizeWarningLimit: 600,
  },
  // Pre-bundling would move HarfBuzz away from the .wasm file it loads beside itself.
  optimizeDeps: {
    exclude: ['harfbuzzjs'],
  },
});
