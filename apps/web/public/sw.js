// Service Worker base per installabilità PWA
// Sonabrief v1.0

const CACHE_NAME = 'sonabrief-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Strategia: network first, nessun caching aggressivo
// (i dati sono in IndexedDB, non serve cache offline complessa)
self.addEventListener('fetch', (event) => {
  // Lascia passare tutto — l'installabilità non richiede offline support
  return;
});
