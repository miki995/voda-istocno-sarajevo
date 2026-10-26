const CACHE = 'voda-v1';
const SHELL = ['/', '/app.js', '/i18n.js', '/translit.js', '/calendar.js', '/analytics.js', '/styles.css', '/manifest.webmanifest', '/icon.svg', '/icon-192.png'];
const CACHED_API = ['/api/plan', '/api/zones'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(names => Promise.all(names.filter(name => name !== CACHE).map(name => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

// Network first, so a new version or a new plan always wins; the cached copy is only used without a connection.
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  const cacheable = SHELL.includes(url.pathname) || CACHED_API.includes(url.pathname);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !(cacheable || request.mode === 'navigate')) {
    return;
  }
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request.mode === 'navigate' ? '/' : request, copy));
        }
        return response;
      })
      .catch(async () => (await caches.match(request.mode === 'navigate' ? '/' : request)) ?? Response.error()),
  );
});

self.addEventListener('push', event => {
  const message = event.data ? event.data.json() : { title: 'Voda Istočno Sarajevo', body: '' };
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      tag: message.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      lang: message.lang === 'en' ? 'en' : message.lang === 'sr-Latn' ? 'sr-Latn' : 'sr-Cyrl',
    }),
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
      const open = windows.find(client => 'focus' in client);
      return open ? open.focus() : self.clients.openWindow('/');
    }),
  );
});
