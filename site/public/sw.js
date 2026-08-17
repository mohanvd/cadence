/*
 * A service worker whose only job is to remove itself.
 *
 * Cadence used to be a PWA, and every browser that ever loaded it still holds a
 * registered worker at this exact path. Deleting the old worker from the build
 * does not reach those machines: their copy keeps running, keeps serving the
 * precached app shell, and would pin them to the last PWA release forever:
 * still showing a player, still failing on the files the desktop app exists to
 * open, and never once fetching the landing page that replaced it.
 *
 * A worker at the same URL is the only thing a browser will accept as a
 * replacement for one already installed. So this file has to keep being served
 * from here until the installed base is gone.
 */

self.addEventListener('install', () => {
  // Take over immediately rather than waiting for every tab to close: the whole
  // point is to stop the old worker answering the next request.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));

      await self.registration.unregister();

      // Unregistering does not reload the pages already under this worker, and
      // those pages are still rendering markup from the deleted cache.
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.navigate(client.url);
      }
    })()
  );
});
