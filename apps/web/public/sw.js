// Service Worker — Sonabrief PWA
// - Cache shell app per offline
// - API sempre network
// - Inietta COOP/COEP per abilitare crossOriginIsolated → SharedArrayBuffer →
//   WASM multi-thread in ORT 1.22 (transformers 3.5.2).
//   COEP usa "credentialless" (non "require-corp") per compatibilità con
//   risorse cross-origin (Polar billing, Cloudflare auth, ecc.).
//   Il multi-thread viene attivato SOLO su Intel iGPU (dove WebGPU è lento);
//   su NVIDIA/AMD si usa comunque WebGPU che è più veloce.

const CACHE_PREFIX = 'sonabrief-';
const CACHE_NAME = 'sonabrief-v6';
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

function withIsolationHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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
