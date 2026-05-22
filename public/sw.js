// Service Worker básico para permitir la instalación de la PWA
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through: No hacemos caché real todavía, solo lo mínimo para que sea instalable
  event.respondWith(fetch(event.request));
});
