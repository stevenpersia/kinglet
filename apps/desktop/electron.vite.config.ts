import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {
    // @parakeet/core is TypeScript source in the workspace: bundle it instead of requiring it at runtime.
    build: { externalizeDeps: { exclude: ['@parakeet/core'] } },
  },
  preload: {
    build: {
      // Sandboxed preloads must be single self-contained files.
      isolatedEntries: true,
      externalizeDeps: false,
      rollupOptions: {
        input: {
          ui: resolve(__dirname, 'src/preload/ui.ts'),
          device: resolve(__dirname, 'src/preload/device.ts'),
        },
      },
    },
  },
  renderer: {},
});
