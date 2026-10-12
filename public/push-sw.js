// Push notifications: shows what FCM sends and opens the game when it is tapped.
// Loaded into the generated service worker through vite.config.ts (workbox.importScripts).

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    const json = event.data ? event.data.json() : {};
    // FCM wraps data messages under "data"; accept both shapes.
    payload = json.data ?? json;
  } catch {
    payload = {};
  }
  event.waitUntil(
    (async () => {
      // Every push must show a notification (browsers, iOS especially, revoke push for silent ones), but while
      // the game is on screen it arrives without sound or vibration: the feed is already updating in front of them.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const watching = windows.some((client) => client.visibilityState === 'visible');
      await self.registration.showNotification(payload.title || 'Notification', {
        body: payload.body || '',
        icon: new URL('icons/icon-192.png', self.registration.scope).href,
        silent: watching,
        data: { link: payload.link || '#/' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '#/';
  // Hash routes keep the GitHub Pages base path: the link resolves against the app's scope.
  const url = new URL(link, self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => client.url.startsWith(self.registration.scope));
      if (open) {
        await open.navigate(url).catch(() => {});
        return open.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});
