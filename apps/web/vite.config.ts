import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const desktop = JSON.parse(readFileSync(fileURLToPath(new URL('../desktop/package.json', import.meta.url)), 'utf8')) as { version: string };

// The site reuses the app's own icons and Graphite tokens (apps/desktop/src/renderer): `dedupe` makes the app's files
// resolve React from here, so the website installs on its own (pnpm install --filter @kinglet/web...).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ['react', 'react-dom'] },
  define: { __APP_VERSION__: JSON.stringify(desktop.version) },
  server: { port: 4173, fs: { allow: ['../..'] } },
});
