import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Identifies this build: the commit on GitHub Actions, "dev" locally, plus the build time.
// It is baked into the app and also written to version.json, so an open (or cached) page can
// notice that a newer version has been published.
const BUILD_VERSION = `${(process.env.GITHUB_SHA ?? 'dev').slice(0, 7)}.${new Date()
  .toISOString()
  .slice(0, 16)
  .replace(/\D/g, '')}`;

export default defineConfig(() => {
  return {
    define: { __APP_VERSION__: JSON.stringify(BUILD_VERSION) },
    // GitHub Pages serves the site from /OPR-List/ (set by the deploy workflow)
    base: process.env.VITE_BASE ?? '/',
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'emit-version-json',
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: BUILD_VERSION }) });
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
