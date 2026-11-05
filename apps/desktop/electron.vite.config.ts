import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';

/**
 * Content-Security-Policy for the UI. Strict in production; in dev, React Fast Refresh
 * needs an inline preamble script.
 */
function csp(): Plugin {
  return {
    name: 'kinglet-csp',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const dev = !!ctx.server;
        const policy = [
          "default-src 'self'",
          `script-src 'self'${dev ? " 'unsafe-inline'" : ''}`,
          "style-src 'self' 'unsafe-inline'",
          'img-src * data: blob:',
          "font-src 'self' data:",
          `connect-src 'self'${dev ? ' ws: http://localhost:*' : ''}`,
        ].join('; ');
        return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}">`);
      },
    },
  };
}

export default defineConfig({
  main: {
    // @kinglet/core is TypeScript source in the workspace: bundle it instead of requiring it at runtime.
    build: { externalizeDeps: { exclude: ['@kinglet/core', '@kinglet/mcp'] } },
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
  renderer: {
    plugins: [react(), tailwindcss(), csp()],
  },
});
