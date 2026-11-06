/* Eboclean service worker.
 * - Pages: network first, fall back to the cached app (works offline: rooms/tasks live on the device).
 * - Built JS/CSS/fonts/icons: cache first (file names change on every release).
 * - API calls: never cached (always fresh, private data).
 */
const VERSION = "eboclean-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const PRECACHE = ["/", "/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // always network

  // Page loads: try the network, keep a fresh copy of the app, fall back offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put("/", copy));
          }
          return res;
        })
        .catch(async () => (await caches.match("/")) || (await caches.match("/offline.html"))),
    );
    return;
  }

  // Static build files, icons, fonts: cache first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || /\.(?:png|svg|woff2?|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
