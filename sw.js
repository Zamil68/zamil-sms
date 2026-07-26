// sw.js — enables mobile background push notifications (registration uses showNotification)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  let t = 'Zamil SMS', b = '';
  try { const d = e.data.json(); t = d.title || t; b = d.body || b; } catch (_) {}
  e.waitUntil(self.registration.showNotification(t, { body: b, icon: '/branding/favicon.ico', badge: '/branding/favicon.ico', tag: 'zamil-sms', renotify: true }));
});
self.addEventListener('notificationclick', (e) => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => { for (const c of cs) if (c.url.includes('/dashboard')) return c.focus(); return self.clients.openWindow('/dashboard/dashboard.html'); })); });
