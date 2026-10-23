self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); } catch { return; }
  if (!data || typeof data.title !== 'string') return;
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icon.svg',
    tag: 'lockin-alarm',
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: { url: self.location.origin }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let urlToOpen = self.location.origin;
  try {
    const candidate = new URL(event.notification.data?.url || '/', self.location.origin);
    if (candidate.origin === self.location.origin) urlToOpen = candidate.href;
  } catch { /* Invalid notification URLs fall back to this app. */ }
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// For local timer notifications (fallback if push is not used)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    event.waitUntil(self.registration.showNotification(event.data.title, {
      body: event.data.body,
      tag: 'lockin-alarm',
      renotify: true,
      requireInteraction: true,
      vibrate: [500, 100, 500],
      data: { url: event.data.url }
    }));
  }
});
