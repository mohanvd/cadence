import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// The player's version, read from the same file the installer is versioned
// from. The page shows it inside the window it draws.
const { version } = createRequire(import.meta.url)('../package.json');

const playerRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * cadence.auva.dev.
 *
 * Astro rather than a second React application, for one reason: this page has
 * no state and no interaction beyond its links, and the previous build shipped
 * 182 kB of React runtime to render it. Here the same components are rendered
 * at build time and none of that runtime is sent at all.
 *
 * There is deliberately no `client:` directive anywhere in the page. Adding one
 * would start shipping React again for the component that carries it.
 */
export default defineConfig({
  site: 'https://cadence.auva.dev',
  integrations: [react()],
  vite: {
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },
    resolve: {
      alias: {
        // A handful of things are shared with the player rather than copied:
        // the design tokens, and the drop card the page draws inside its
        // picture of the window. Copies of either would drift.
        '@player': fileURLToPath(new URL('../app/src', import.meta.url)),
      },
    },
    server: {
      // The dev server refuses to read outside its root without this, and the
      // shared files are one level up.
      fs: { allow: [playerRoot] },
    },
  },
});
