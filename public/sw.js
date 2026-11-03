// ArchResidenceBD Service Worker
// Caches core assets for offline use

// Bump this version to force re-cache on next deploy
const CACHE_NAME = 'archresidencebd-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  // Self-hosted fonts (OFL licensed) - cached for offline use
  '/assets/fonts/inter-latin-400-normal.woff2',
  '/assets/fonts/inter-latin-500-normal.woff2',
  '/assets/fonts/inter-latin-600-normal.woff2',
  '/assets/fonts/inter-latin-700-normal.woff2',
  '/assets/fonts/inter-latin-400-italic.woff2',
  '/assets/fonts/inter-latin-500-italic.woff2',
  '/assets/fonts/inter-latin-600-normal.woff2',
  '/assets/fonts/inter-latin-600-italic.woff2',
  '/assets/fonts/inter-latin-700-normal.woff2',
  '/assets/fonts/inter-latin-700-italic.woff2',
  '/assets/fonts/lora-latin-400-normal.woff2',
  '/assets/fonts/lora-latin-500-normal.woff2',
  '/assets/fonts/lora-latin-600-normal.woff2',
  '/assets/fonts/lora-latin-700-normal.woff2',
  '/assets/fonts/lora-latin-400-italic.woff2',
  '/assets/fonts/lora-latin-500-italic.woff2',
  '/assets/fonts/lora-latin-600-italic.woff2',
  '/assets/fonts/lora-latin-700-normal.woff2',
  '/assets/fonts/noto-sans-bengali-bengali-400-normal.woff2',
  '/assets/fonts/noto-sans-bengali-bengali-500-normal.woff2',
  '/assets/fonts/noto-sans-bengali-bengali-600-normal.woff2',
  '/assets/fonts/noto-sans-bengali-bengali-700-normal.woff2',
  '/assets/fonts/noto-sans-bengali-latin-400-normal.woff2',
  // Note: In production, these would be the actual built asset paths
  // '/assets/index-*.css',
  // '/assets/index-*.js',
];

// Install - cache static assets one-by-one so a single missing file
// doesn't abort the entire install.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      // Use allSettled so partial failures don't abort install.
      const results = STATIC_ASSETS.map((url) =>
        cache.add(url).catch(() => console.warn(`[SW] Failed to cache ${url}`)),
      );
      return Promise.allSettled(results);
    }).then(() => self.skipWaiting())
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

/** Returns true when the request is for this app's own API (not external). */
function isAppApiRequest(url) {
  try {
    const reqUrl = new URL(url);
    // Match relative /api/* paths or same-origin calls
    return reqUrl.pathname.startsWith('/api/')
      || (reqUrl.origin === location.origin && !reqUrl.pathname.startsWith('/assets/') && reqUrl.pathname !== '/');
  } catch {
    return url.includes('/api/');
  }
}

/** Returns true when the request is for a static binary asset (font, image, CSS, JS). */
function isBinaryAsset(url) {
  return /\.(woff2?|ttf|eot|otf|png|jpe?g|gif|svg|ico|css|js)(\?.*)?$/.test(url)
    || url.endsWith('.map');
}

// Fetch - cache-first for static assets, network-first for API
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip chrome-extension and other non-http requests
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // ── Cache hit: serve immediately ──
        if (cachedResponse) return cachedResponse;

        // ── No cache hit: network fetch ──
        return fetch(event.request)
          .then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const responseClone = response.clone();
            // Stale-while-revalidate: put successful responses in cache for next visit
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
            return response;
          })
          .catch(() => {
            // ── Offline fallback ──
            // For binary assets (fonts, stylesheets, images) return the raw request
            // so the browser reports a network error gracefully instead of
            // receiving a JSON text body it cannot parse.
            if (isBinaryAsset(event.request.url)) {
              return new Response('', { status: 0 });
            }
            // For navigations and JSON API calls, return a structured offline notice
            return new Response(
              JSON.stringify({ error: 'Offline', message: 'Please check your connection' }),
              { headers: { 'Content-Type': 'application/json' }, status: 503 }
            );
          });
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