// Kill-switch service worker.
// A previous version's cache.addAll() referenced a file that was later
// deleted (recovery-app.html), which made install() reject every time —
// so browsers kept the old buggy worker in control forever and users got
// stuck on stale cached pages (e.g. Recovery link resolving to old content).
// This version wipes every cache, unregisters itself, and forces an
// uncontrolled reload so the browser goes back to fetching plain files
// over the network like a normal static site.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clientsList = await self.clients.matchAll({ type: 'window' });
      for (const client of clientsList) {
        client.navigate(client.url);
      }
    })()
  );
});
