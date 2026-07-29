// Service Worker de SUMTRANS LOGISTICA.
// Objetivo: cumplir el criterio "offline-capable" que Chrome exige para
// ofrecer la instalación real de la PWA (WebAPK) en Android.
// Estrategia: network-first en las navegaciones, con el shell cacheado como
// respaldo. Todo lo demás pasa por red sin tocarse.

const CACHE = 'sumtrans-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll falla entero si un recurso falla: los añadimos de uno en uno.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Solo GET del propio origen. Supabase, storage y cualquier POST/PATCH
  // se dejan intactos para no interferir con la app.
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // Navegaciones (abrir la app, recargar): red primero, caché si no hay red.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/index.html', copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Resto de recursos propios: red, y si falla se intenta la caché.
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
