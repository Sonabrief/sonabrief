// Service Worker — Sonabrief PWA
// - Cache shell app per offline
// - API sempre network
// - NON inietta più COOP/COEP: l'attivazione di crossOriginIsolated triggerava
//   un path interno di ORT/transformers v4.2.0 (con onnxruntime-web 1.26.0-dev)
//   che rallentava Whisper drasticamente su Intel iGPU senza dare in cambio
//   un multi-thread funzionante (la 2a session ORT in threaded hangava).
//   Quando transformers/ORT stable supporteranno multi-thread su questo
//   workload, si potranno riattivare le iniezioni di header (bump CACHE_NAME).

const CACHE_PREFIX = 'sonabrief-';
const CACHE_NAME = 'sonabrief-v5';
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
      Promise.all(
        // Cancella SOLO le vecchie versioni dell'app cache; NON toccare
        // cache di terze parti tipo `transformers-cache` (modello Whisper 244MB+).
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => clients.claim())
  );
});

// NO-OP per ora: prima iniettavamo COOP/COEP, ora pass-through.
// Manteniamo la firma per non dover toccare il resto del fetch handler.
function withIsolationHeaders(response) {
  return response;
}

// HTML navigation → network-first (per non servire bundle vecchi dopo un deploy)
// Asset hashed → cache-first (immutabili per definizione)
function isHTMLRequest(request, url) {
  return request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname.endsWith('.html');
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

  if (isHTMLRequest(request, url)) {
    // Network-first per evitare stale index.html dopo nuovi deploy
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return withIsolationHeaders(response);
      }).catch(() =>
        caches.match(request).then((cached) =>
          cached ? withIsolationHeaders(cached) :
            caches.match('/index.html').then((r) => r ? withIsolationHeaders(r) : Response.error())
        )
      )
    );
    return;
  }

  // Asset (JS/CSS/font/img con hash): cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return withIsolationHeaders(cached);
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return withIsolationHeaders(response);
      });
    })
  );
});
