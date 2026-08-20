import { fileURLToPath, URL } from 'node:url';
import { createRequire } from 'node:module';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The installer reads its version from this same file (see the note in
// src-tauri/tauri.conf.json) so what the interface reports is what shipped.
const { version } = createRequire(import.meta.url)('./package.json');

/*
 * The player. The website is its own project under `site/`.
 *
 * The service worker, the offline precache and the web app manifest that used
 * to be configured here all existed to make a browser tab behave like an
 * installed program; none of them survive being one, and every one of them was
 * a source of the staleness bugs the desktop build exists to end.
 *
 * `public/sw.js` is the one piece left behind on purpose. See the note there.
 */
export default defineConfig({
  /*
   * The player's sources, its entry document and the files it serves verbatim
   * all live under `app/`, so that the repository root holds directories and
   * documentation and nothing else. `site/` is the other half, and is its own
   * project with its own toolchain.
   */
  root: fileURLToPath(new URL('./app', import.meta.url)),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./app/src', import.meta.url)),
    },
  },
  // Vite wiping the screen on rebuild takes the Rust compiler's output with it,
  // which is the half of a `tauri dev` run that actually reports errors.
  clearScreen: false,
  server: {
    port: 3000,
    // Tauri loads a fixed URL, so silently moving to another port would leave
    // the window pointed at nothing.
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**', '**/site/**'],
    },
  },
  /* libass runs in a worker and is loaded as a module, so the worker Vite
     builds has to be one too. The default is a self-contained script, which
     the renderer refuses because it starts it with `type: 'module'`. */
  worker: { format: 'es' },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  build: {
    // Relative to `root`, so it lands at the repository root where the Tauri
    // config expects to find it.
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    /*
     * One known engine, WebView2 on Windows, but not necessarily a current one:
     * the runtime updates on the user's schedule rather than ours. chrome105 is
     * the floor Tauri targets and costs nothing here.
     */
    target: 'chrome105',
    // Vite 8 bundles with Rolldown; `oxc` is its native minifier. The old
    // `esbuild` value is deprecated and now needs esbuild as a separate
    // install, which is a dependency this project no longer has a reason to
    // carry.
    minify: 'oxc',
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor';
          }
          if (id.includes('@radix-ui')) {
            return 'ui';
          }
          if (id.includes('lucide-react')) {
            return 'icons';
          }
        },
      },
    },
  },
  plugins: [react(), tailwindcss()],
});
