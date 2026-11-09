/**
 * Runs the built service worker (dist/sw.js) in a Node sandbox with a fake Cache API and a network
 * that can be switched off, and checks the offline promises:
 *
 *   node scripts/tests/sw-offline.mjs        (after `npm run build`)
 *
 * install caches the whole build (and fails as a whole if a file is missing); activate drops old builds;
 * with the network down every built file and the app shell still answer; other origins and non-GET
 * requests are left alone; a new file seen online is cached.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = join(root, "dist");
const ORIGIN = "http://app.test";
const code = readFileSync(join(dist, "sw.js"), "utf8");

class FakeResponse {
  constructor(body, status = 200) {
    this.body = body;
    this.status = status;
    this.ok = status >= 200 && status < 300;
  }
  clone() {
    return new FakeResponse(this.body, this.status);
  }
}

function makeWorker({ missing = [] } = {}) {
  const listeners = {};
  const store = new Map(); // cache name -> Map(url -> response)
  const state = { online: true, fetched: [], skipWaiting: 0, claimed: 0 };
  const urlOf = (r) => new URL(typeof r === "string" ? r : r.url, ORIGIN).href;

  async function network(req) {
    state.fetched.push(urlOf(req));
    if (!state.online) throw new TypeError("Failed to fetch");
    const url = new URL(urlOf(req));
    if (url.origin !== ORIGIN) return new FakeResponse("remote");
    const path = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (missing.includes("/" + path) || !existsSync(join(dist, path))) return new FakeResponse("not found", 404);
    return new FakeResponse(readFileSync(join(dist, path)));
  }
  const cacheApi = (name) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name);
    return {
      async addAll(urls) {
        const responses = await Promise.all(urls.map((u) => network(u)));
        if (responses.some((r) => !r.ok)) throw new TypeError("addAll: a request failed");
        urls.forEach((u, i) => m.set(urlOf(u), responses[i]));
      },
      async put(req, res) {
        m.set(urlOf(req), res);
      },
    };
  };
  const caches = {
    open: async (name) => cacheApi(name),
    keys: async () => [...store.keys()],
    delete: async (name) => store.delete(name),
    match: async (req) => {
      for (const m of store.values()) if (m.has(urlOf(req))) return m.get(urlOf(req));
      return undefined;
    },
  };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type, fn) => (listeners[type] = fn),
    skipWaiting: () => void state.skipWaiting++,
    clients: { claim: async () => void state.claimed++ },
  };
  vm.runInNewContext(code, { self, caches, fetch: network, URL, Promise, console, JSON, Response: FakeResponse }, { filename: "dist/sw.js" });

  const dispatchLifecycle = async (type) => {
    const waits = [];
    listeners[type]({ waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
  };
  const request = (url, { method = "GET", mode = "cors" } = {}) => {
    let answered = null;
    listeners.fetch({ request: { url, method, mode }, respondWith: (p) => (answered = Promise.resolve(p)) });
    return answered;
  };
  return { state, store, caches, install: () => dispatchLifecycle("install"), activate: () => dispatchLifecycle("activate"), request };
}

const precache = JSON.parse(/const PRECACHE = (\[[^\n]*\]);/.exec(code)[1]);
const version = JSON.parse(/const VERSION = ("[^"]+")/.exec(code)[1]);
let n = 0;
const t = async (name, fn) => {
  await fn();
  console.log(`ok   ${name}`);
  n++;
};

await t("install caches the whole build under this build's version and takes over", async () => {
  const w = makeWorker();
  await w.install();
  assert.deepEqual([...w.store.keys()], [`archresidencebd-${version}`]);
  assert.equal(w.store.get(`archresidencebd-${version}`).size, precache.length);
  assert.equal(w.state.skipWaiting, 1);
});

await t("install fails as a whole when one file is missing, so a half-cached app is never activated", async () => {
  const w = makeWorker({ missing: ["/" + precache.find((p) => p.endsWith(".js") && p.includes("/assets/")).slice(1)] });
  await assert.rejects(w.install());
  assert.equal(w.state.skipWaiting, 0);
});

await t("activate removes the caches of older builds and keeps this one", async () => {
  const w = makeWorker();
  await w.install();
  w.store.set("archresidencebd-old", new Map([["x", 1]]));
  w.store.set("another-app", new Map());
  await w.activate();
  assert.deepEqual([...w.store.keys()].sort(), [`archresidencebd-${version}`, "another-app"].sort());
  assert.equal(w.state.claimed, 1);
});

await t("offline: every precached file still answers from the cache, without touching the network", async () => {
  const w = makeWorker();
  await w.install();
  w.state.online = false;
  w.state.fetched.length = 0;
  for (const p of precache.filter((f) => f !== "/")) {
    const res = await w.request(ORIGIN + p);
    assert.ok(res && res.ok, `${p} did not answer offline`);
  }
  assert.equal(w.state.fetched.length, 0, "an offline file request went to the network");
});

await t("offline: opening the app (any route) gives the cached app shell", async () => {
  const w = makeWorker();
  await w.install();
  w.state.online = false;
  const shell = readFileSync(join(dist, "index.html"), "utf8");
  for (const path of ["/", "/anything/deep", "/#/boq"]) {
    const res = await w.request(ORIGIN + path, { mode: "navigate" });
    assert.equal(String(res.body), shell);
  }
});

await t("online: a page load goes to the network first, so a new release is picked up", async () => {
  const w = makeWorker();
  await w.install();
  w.state.fetched.length = 0;
  await w.request(ORIGIN + "/", { mode: "navigate" });
  assert.ok(w.state.fetched.includes(ORIGIN + "/"));
});

await t("online: a same-origin file seen for the first time is fetched and cached", async () => {
  const w = makeWorker();
  await w.install();
  const extra = "/manifest.json?extra=1";
  assert.ok(await w.request(ORIGIN + extra));
  w.state.online = false;
  // the cached copy answers the same request offline
  await new Promise((r) => setTimeout(r, 0));
  assert.ok((await w.request(ORIGIN + extra)).ok);
});

await t("other origins and non-GET requests are not touched", async () => {
  const w = makeWorker();
  await w.install();
  assert.equal(w.request("https://example.com/a.js"), null);
  assert.equal(w.request(ORIGIN + "/assets/x.js", { method: "POST" }), null);
});

console.log(`\nservice worker: ${n} offline checks passed`);
