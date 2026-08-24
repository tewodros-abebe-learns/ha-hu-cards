self.addEventListener('push', (event) => {
  const data = event.data.json();
  self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icon.png',
    tag: 'lockin-alarm',
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: { url: self.location.origin }
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data.url || self.location.origin;
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
    self.registration.showNotification(event.data.title, {
      body: event.data.body,
      tag: 'lockin-alarm',
      renotify: true,
      requireInteraction: true,
      vibrate: [500, 100, 500],
      data: { url: event.data.url }
    });
  }
});
