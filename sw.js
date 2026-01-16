const CACHE_NAME = "quran-pwa-v1_9";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME && !k.startsWith('quran-offline-')).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET") return;

  // Audio: try any cache first (covers per-surah/per-juz caches)
  const isAudio = req.destination === 'audio' || url.pathname.endsWith('.mp3') || url.pathname.endsWith('.ogg');
  if (isAudio) {
    event.respondWith((async ()=>{
      const cached = await caches.match(req);
      if (cached) return cached;
      return fetch(req);
    })());
    return;
  }

  // API: network-first
  if (url.hostname.includes("api.alquran.cloud")) {
    event.respondWith(networkFirst(req));
    return;
  }

  // App shell: cache-first
  event.respondWith(cacheFirst(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  return cached || fetch(req).then(res => {
    cache.put(req, res.clone());
    return res;
  });
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetch(req);
    cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    return cached || new Response(JSON.stringify({ data: null }), { headers: { "Content-Type": "application/json" } });
  }
}
