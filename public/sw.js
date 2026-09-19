const CACHE_PREFIX = "baseball-scorebook-";
const BUILD_ID =
  new URL(self.location.href).searchParams.get("v") || "development";
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_ID}`;
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/favicon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME
              )
              .map((key) => caches.delete(key))
          )
        ),
      self.registration.navigationPreload?.enable(),
    ])
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (
    request.method !== "GET" ||
    !request.url.startsWith(self.location.origin)
  ) {
    return;
  }

  // Shared game data must always come from the server, never from a cache.
  if (new URL(request.url).pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response =
            (await event.preloadResponse) || (await fetch(request));
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
          }
          return response;
        } catch {
          return (await caches.match(request)) || (await caches.match("/"));
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const network = fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => null);
      return (
        cached ||
        (await network) ||
        new Response("オフラインのため読み込めません", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      );
    })()
  );
});
