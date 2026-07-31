// Service Worker de SUMTRANS LOGISTICA.
//
// Objetivo original: cumplir el criterio "offline-capable" que Chrome exige para
// ofrecer la instalación real de la PWA (WebAPK) en Android.
//
// Y el que faltaba: que la app ABRA sin cobertura. Antes solo se precacheaba el
// shell y el resto iba a red sin guardar nunca nada, así que el HTML sí estaba
// cacheado pero el JavaScript que lo hace funcionar no. Resultado: en una zona sin
// cobertura la app se quedaba en blanco por más que la cola offline funcionara
// perfectamente, porque ni siquiera llegaba a arrancar para leerla.
//
// Estrategia:
//   · Navegaciones      → red primero, shell cacheado como respaldo.
//   · /assets/*         → caché primero. Vite les pone un hash en el nombre, así que
//                         un fichero dado nunca cambia de contenido: servirlo de la
//                         caché no puede dar una versión vieja. Al desplegar cambian
//                         los nombres y se piden a la red solos.
//   · Resto del origen  → red, y si falla, caché.

const CACHE_SHELL = 'sumtrans-shell-v2';
const CACHE_ASSETS = 'sumtrans-assets-v1';
const CACHES_VIVAS = [CACHE_SHELL, CACHE_ASSETS];

const SHELL = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

// Los assets de despliegues anteriores se quedan en la caché: los nombres llevan hash,
// así que nadie los vuelve a pedir. Sin un tope, la caché crece en cada despliegue.
const MAX_ASSETS = 120;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_SHELL)
      // addAll falla entero si un recurso falla: los añadimos de uno en uno.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !CACHES_VIVAS.includes(k)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/** Poda por orden de llegada: lo más viejo es lo primero que entró. */
const podarAssets = async (cache) => {
  const claves = await cache.keys();
  if (claves.length <= MAX_ASSETS) return;
  await Promise.all(
    claves.slice(0, claves.length - MAX_ASSETS).map((k) => cache.delete(k))
  );
};

/**
 * Caché primero: se responde con lo guardado y solo se va a la red si no está.
 * Solo se guardan respuestas correctas y del propio origen — una respuesta a medias
 * o un 404 cacheado dejaría la app rota hasta el siguiente despliegue.
 */
const desdeCacheODeRed = async (request) => {
  const cache = await caches.open(CACHE_ASSETS);

  // `ignoreVary` a propósito: estas respuestas llegan con `Vary: Origin`, así que el
  // match por defecto exige que la cabecera Origin coincida con la de cuando se
  // guardó. En un fichero con hash en el nombre eso no aporta nada —la URL ya
  // determina el contenido— y en cambio hace que un cambio de cabecera tire la
  // entrada a la basura y mande a la red justo cuando no hay red.
  const guardado = await cache.match(request, { ignoreVary: true });
  if (guardado) return guardado;

  const respuesta = await fetch(request);
  if (respuesta && respuesta.ok && respuesta.type === 'basic') {
    await cache.put(request, respuesta.clone());
    podarAssets(cache).catch(() => {});
  }
  return respuesta;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Solo GET del propio origen. Supabase, storage y cualquier POST/PATCH
  // se dejan intactos para no interferir con la app.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegaciones (abrir la app, recargar): red primero, caché si no hay red.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_SHELL).then((cache) => cache.put('/index.html', copy)).catch(() => {});
          return response;
        })
        // Mismo motivo que en los assets: sin `ignoreVary`, el respaldo depende de que
        // coincidan cabeceras que aquí no significan nada, y este es EL camino que
        // tiene que funcionar sin cobertura.
        .catch(() => caches.match('/index.html', { ignoreVary: true })
          .then((cached) => cached || caches.match('/', { ignoreVary: true })))
    );
    return;
  }

  // El JavaScript y el CSS de la app: lo que hace falta para que arranque sin red.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      desdeCacheODeRed(request).catch(() => caches.match(request))
    );
    return;
  }

  // Resto de recursos propios: red, y si falla se intenta la caché.
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
