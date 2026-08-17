import { isDesktop } from './desktop';

/**
 * Where `/api/*` lives.
 *
 * On the web this is empty, and the routes are same-origin. The desktop
 * application has no origin to be same as: it is served from disk, under
 * `http://tauri.localhost`, so a relative path there resolves to a host that
 * does not exist and the request fails before it leaves the machine. It has to
 * name the deployment explicitly, and the deployment has to list its origin in
 * `ALLOWED_ORIGINS` (see api/subtitles.ts) for the response to be readable.
 *
 * A build-time constant rather than a runtime lookup: this has to be swapped
 * for a preview deployment's URL when testing one, and an environment variable
 * is the only thing that reaches a compiled installer.
 */
export const API_BASE = isDesktop()
  ? import.meta.env.VITE_API_BASE || 'https://cadence.auva.dev'
  : '';
