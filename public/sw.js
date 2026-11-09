// ArchResidenceBD service worker (production web build only; see src/main.tsx).
//
// scripts/build-sw.mjs rewrites this file into dist/sw.js: VERSION becomes a hash of the build and PRECACHE the
// list of every built file, so the whole app is cached when the worker installs and works offline from then on.
// In this source copy both are placeholders; the worker is never registered in dev.

const VERSION = /*__VERSION__*/ "dev";
const PRECACHE = /*__PRECACHE__*/ [];
const CACHE = "archresidencebd-" + VERSION;

// Install: cache the whole build in one step. If any file is missing the install fails and is retried on the
// next visit, so a half-cached app is never activated. The build time is kept so activate can tell builds apart.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE).then(() => cache.put("/__built_at", new Response(String(Date.now())))))
      .then(() => self.skipWaiting()),
  );
});

// Activate: drop old builds, but keep the newest older one. A page that is still running the previous build
// loads its screens lazily by hashed file name; deleting that build now would break the page until it reloads.
// (caches.match in the fetch handler looks in every cache, so the old files keep answering.)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then(async (names) => {
        const older = names.filter((n) => n.startsWith("archresidencebd-") && n !== CACHE);
        const stamped = await Promise.all(
          older.map(async (n) => {
            const hit = await (await caches.open(n)).match("/__built_at");
            return { n, t: hit ? Number(await hit.text()) : 0 };
          }),
        );
        stamped.sort((a, b) => b.t - a.t);
        await Promise.all(stamped.slice(1).map((s) => caches.delete(s.n)));
      })
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
