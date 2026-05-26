// Service Worker — Sonabrief PWA
// - Cache shell app per offline
// - API sempre network
// - Inietta COOP/COEP per abilitare crossOriginIsolated (multi-threading WASM)

const CACHE_NAME = 'sonabrief-v3';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

// Aggiunge header COOP/COEP a una risposta same-origin
function withIsolationHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls: sempre network, no cache, no header injection
  if (url.pathname.startsWith('/v1/') || url.hostname.includes('workers.dev')) {
    return;
  }

  // Solo richieste GET same-origin: cache + iniezione header
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return withIsolationHeaders(cached);
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return withIsolationHeaders(response);
      }).catch(() => {
        if (request.mode === 'navigate') {
          return caches.match('/index.html').then(r => r ? withIsolationHeaders(r) : Response.error());
        }
      });
    })
  );
});
