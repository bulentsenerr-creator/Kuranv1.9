const CACHE_NAME = "quran-pwa-v1_9_1";
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

  const isAudio = req.destination === 'audio' || url.pathname.endsWith('.mp3') || url.pathname.endsWith('.ogg');
  if (isAudio) {
    event.respondWith((async ()=>{
      const cached = await caches.match(req);
      if (cached) return cached;
      // Android Chrome & some CORS cases: try url string and different Request modes
      const cached2 = await caches.match(req.url);
      if (cached2) return cached2;
      try {
        const altCors = await caches.match(new Request(req.url, { mode: 'cors' }));
        if (altCors) return altCors;
      } catch {}
      try {
        const altNoCors = await caches.match(new Request(req.url, { mode: 'no-cors' }));
        if (altNoCors) return altNoCors;
      } catch {}
      return fetch(req);
    })());
    return;
  }

  if (url.hostname.includes("api.alquran.cloud")) {
    event.respondWith(networkFirst(req));
    return;
  }

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
