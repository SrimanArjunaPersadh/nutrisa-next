/* NutriSA service worker — SHELL ONLY (Migration Plan §4.5, §0.3).
 *
 * What this does:   caches the app shell so the app launches offline.
 * What this NEVER does: queue, buffer, replay or otherwise touch a write.
 *
 * Offline logging was CUT (§0.3). Supabase is the sole source of truth. When
 * the device is offline the shell loads and data calls FAIL VISIBLY into the
 * error state — they do not silently succeed against a local queue. The
 * passthrough rules at the top of the fetch handler are what guarantee that;
 * do not add a cache fallback to them.
 *
 * Bump CACHE_VERSION on any change to PRECACHE.
 */

const CACHE_VERSION = "nutrisa-shell-v1";

/* The shell: routes that must render with no network. Deliberately short —
 * Next's hashed assets are cached on first visit by the static rule below,
 * not listed here, because their filenames change every build. */
const PRECACHE = [
  "/",
  "/nutrition",
  "/weight",
  "/library",
  "/styleguide",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) =>
        // addAll is all-or-nothing; a single 404 would leave us with no shell
        // at all, so each entry is allowed to fail independently.
        Promise.all(
          PRECACHE.map((url) =>
            cache.add(new Request(url, { cache: "reload" })).catch(() => {}),
          ),
        ),
      )
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
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Hashed, immutable build output and icons — safe to serve from cache first. */
function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  /* ---- Passthrough. Never intercepted, never cached. ------------------- */

  // Writes. Every POST/PUT/PATCH/DELETE goes straight to the network and is
  // allowed to fail. This single line is the §0.3 guarantee.
  if (request.method !== "GET") return;

  // Cross-origin: Supabase, Open Food Facts, anything else. Not our shell.
  if (url.origin !== self.location.origin) return;

  // Route handlers (/api/ocr-label and friends) are data, never shell.
  if (url.pathname.startsWith("/api/")) return;

  /* ---- Cache-first: immutable assets ----------------------------------- */

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  /* ---- Network-first: navigations and everything else ------------------ */
  /* Fresh when online; the cached shell only when the network genuinely
   * fails. Never a stale page in front of a working connection. */

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        // An uncached route while offline still gets the shell rather than the
        // browser's offline dinosaur.
        if (request.mode === "navigate") {
          const shell = await caches.match("/");
          if (shell) return shell;
        }

        return Response.error();
      }),
  );
});
