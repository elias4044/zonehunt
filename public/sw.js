/*
    Service worker for Zonehunt.

    Bump SHELL_VERSION when you change this file's behaviour.

    -- Elias, 2026
*/

const SHELL_VERSION = "v3";
const SHELL = "zonehunt-shell-" + SHELL_VERSION;
const STATIC = "zonehunt-static"; // hashed build assets: safe to keep forever
const TILES = "zonehunt-tiles";
const MAX_TILES = 900;

const PRECACHE = [
  "/",
  "/manifest.json",
  "/icon.svg",
  "/logo.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("zonehunt-shell-") && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isTile(url) {
  return /\/\d{1,2}\/\d+\/\d+(@2x)?\.(png|jpe?g|webp)(\?.*)?$/.test(url.pathname) && url.origin !== self.location.origin;
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

async function cacheFirst(request, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  // Opaque (cross-origin, no CORS) responses are fine for <img> tiles, status is 0 for them.
  if (res.ok || res.type === "opaque") {
    cache.put(request, res.clone());
    if (max) trim(cacheName, max);
  }
  return res;
}

async function networkFirstShell(request) {
  const cache = await caches.open(SHELL);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) cache.put("/", res.clone());
    return res;
  } catch {
    // Everything is a single page app, so the cached "/" is the right answer for any route.
    const fallback = await cache.match("/");
    if (fallback) return fallback;
    return new Response("Offline, and the app hasn't been cached yet. Connect once to install it.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_/"))) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstShell(request));
    return;
  }

  if (isTile(url)) {
    event.respondWith(cacheFirst(request, TILES, MAX_TILES).catch(() => Response.error()));
    return;
  }

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/_next/static/")) {
      event.respondWith(cacheFirst(request, STATIC));
      return;
    }
    // Everything else from our own origin (icons, manifest): serve cached, refresh in the background.
    event.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const hit = await cache.match(request);
        const fresh = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || fresh;
      })
    );
  }
});
