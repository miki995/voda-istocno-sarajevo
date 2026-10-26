const CACHE = 'voda-v4';
const SHELL = ['/', '/app.js', '/i18n.js', '/translit.js', '/calendar.js', '/share-image.js', '/contact-rules.js', '/analytics.js', '/map.js', '/places.json', '/styles.css', '/manifest.webmanifest', '/icon.svg', '/icon-192.png'];
const CACHED_API = ['/api/plan', '/api/zones', '/api/history'];

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
  if (request.method !== 'GET' || url.origin !== self.location.origin || !cacheable) {
    return;
  }
  const key = new Request(url.origin + url.pathname);
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(key, copy));
        }
        return response;
      })
      .catch(async () => (await caches.match(key)) ?? Response.error()),
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
