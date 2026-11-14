/*
 * Van Build service worker. Keeps the app working offline and makes it installable.
 *
 * The build fills in the two constants below: every file the app is built from, and a hash
 * of that list, so each release gets its own cache.
 *
 * - App files have content hashes in their names, so they are served from the cache.
 * - Pages are fetched from the network first, so a new release shows up on the next visit;
 *   offline, the cached page is used.
 * - Other sites (the account service) are never touched.
 *
 * A new version waits until every tab of the old one is closed before it takes over, so an
 * open tab never ends up with files from two releases.
 */

const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE__;
const CACHE = `vanbuild-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("vanbuild-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function page(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put("/", response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match("/", { ignoreVary: true });
    if (cached) return cached;
    throw error;
  }
}

async function file(request) {
  // Scripts are requested with an Origin header and the server may answer "Vary: Origin",
  // which would make a cached copy never match. These files never change once built (their
  // names carry a content hash), so any cached copy is the right one.
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && new URL(request.url).pathname.startsWith("/assets/")) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") event.respondWith(page(request));
  else event.respondWith(file(request));
});
