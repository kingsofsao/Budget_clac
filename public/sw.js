/*
 * Trip Split service worker.
 *
 * Caching strategy (correct server data first, offline as a fallback):
 *   - /_next/static/* and icons: cache-first (content-hashed, immutable).
 *   - Page navigations: network-first. Successful trip pages are kept in a small
 *     cache so the last-seen balances/summary can be viewed without signal.
 *     When offline and nothing is cached, the /offline page is shown.
 *   - Everything else (server actions, RSC payloads, Supabase API): network only.
 *     Writes are never queued offline, so there are no sync conflicts.
 */
const VERSION = "v1";
const STATIC_CACHE = `tripsplit-static-${VERSION}`;
const PAGE_CACHE = `tripsplit-pages-${VERSION}`;
const OFFLINE_URL = "/offline";
const MAX_PAGES = 40;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icon.svg"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("tripsplit-") && k !== STATIC_CACHE && k !== PAGE_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || /^\/(icon|apple-icon)/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (
            response.ok &&
            url.pathname.startsWith("/trip/") &&
            !url.pathname.includes("/export")
          ) {
            const copy = response.clone();
            caches
              .open(PAGE_CACHE)
              .then((cache) => cache.put(request, copy))
              .then(() => trimCache(PAGE_CACHE, MAX_PAGES));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match(OFFLINE_URL))),
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "clear-pages") {
    event.waitUntil(caches.delete(PAGE_CACHE));
  }
});
