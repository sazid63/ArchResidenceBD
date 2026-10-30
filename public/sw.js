// ArchResidenceBD Service Worker
// Caches core assets for offline use

const CACHE_NAME = 'archresidencebd-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  // Note: In production, these would be the actual built asset paths
  // '/assets/index-*.css',
  // '/assets/index-*.js',
];

// Install - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip chrome-extension and other non-http requests
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        // Network first for API calls, cache-first for static assets
        const isApiCall = event.request.url.includes('/api/') || event.request.url.includes('localhost:3001');

        if (isApiCall) {
          // Network-first for API
          return fetch(event.request)
            .then((response) => {
              if (!response.ok) throw new Error('Network error');
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
              return response;
            })
            .catch(() => {
              // If offline and no cache, return a generic offline response
              return new Response(
                JSON.stringify({ error: 'Offline', message: 'Please check your connection' }),
                { headers: { 'Content-Type': 'application/json' }, status: 503 }
              );
            });
        } else {
          // Cache-first for static assets
          return fetch(event.request)
            .then((response) => {
              if (!response.ok) throw new Error('Network error');
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
              return response;
            })
            .catch(() => caches.match(event.request));
        }
      })
  );
});

// Handle messages from main thread
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  if (event.data === 'clearCache') {
    caches.delete(CACHE_NAME);
  }
});