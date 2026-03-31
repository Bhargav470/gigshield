self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'GigShield';
  const options = {
    body: data.body || 'New notification',
    icon: 'https://img.icons8.com/emoji/96/shield-emoji.png',
    badge: 'https://img.icons8.com/emoji/96/shield-emoji.png',
    vibrate: [200, 100, 200],
    data: { url: '/dashboard.html' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url || '/dashboard.html'));
});