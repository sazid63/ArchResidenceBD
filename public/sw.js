// ArchResidenceBD service worker (production web build only; see src/main.tsx).
//
// scripts/build-sw.mjs rewrites this file into dist/sw.js: VERSION becomes a hash of the build and PRECACHE the
// list of every built file, so the whole app is cached when the worker installs and works offline from then on.
// In this source copy both are placeholders; the worker is never registered in dev.

const VERSION = /*__VERSION__*/ "dev";
const PRECACHE = /*__PRECACHE__*/ [];
const CACHE = "archresidencebd-" + VERSION;

// Install: cache the whole build in one step. If any file is missing the install fails and is retried on the
// next visit, so a half-cached app is never activated.
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

// Activate: drop the caches of older builds.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith("archresidencebd-") && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch other origins

  // Page loads: the network first, so a new release is picked up as soon as the user is online;
  // the cached app shell is the offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("/index.html", copy));
          }
          return res;
        })
        .catch(() => caches.match("/index.html").then((hit) => hit || caches.match("/"))),
    );
    return;
  }

  // Built files have hashed names and never change: the cache first, the network only for a miss.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});
