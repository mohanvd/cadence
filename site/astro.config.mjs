import { createRequire } from 'node:module';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// The version shown inside the window the page draws. It is this project's own
// `package.json`, deliberately, not the player's one directory up: `site/` is
// the root Vercel builds from and it uploads nothing above that root, so a read
// outside it fails the deployment. That makes this a number to bump alongside
// the player's at release, and the picture is a little out of date until it is.
const { version } = createRequire(import.meta.url)('./package.json');

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
 *
 * Nothing here reaches into `app/`. The page used to import the player's
 * stylesheet so its picture of the window could not drift; it carries its own
 * copy now, because that one import made the site undeployable without a Vercel
 * setting that permits reading outside the root directory, and a landing page
 * is not worth that.
 */
export default defineConfig({
  site: 'https://cadence.auva.dev',
  integrations: [react()],
  vite: {
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },
  },
});
