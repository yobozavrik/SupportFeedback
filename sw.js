const CACHE_VERSION = 'supportfeedback-v2';
const PRECACHE_CACHE = `${CACHE_VERSION}-precache`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/logo.svg',
  '/sw.js',
];

const manifestEntries = (self.__WB_MANIFEST || []).map((entry) => {
  if (!entry || !entry.url) return null;
  const normalized = entry.url.startsWith('/') ? entry.url : `/${entry.url}`;
  return normalized.replace(/\/+/g, '/');
}).filter(Boolean);

const PRECACHE_URLS = Array.from(new Set([...CORE_ASSETS, ...manifestEntries]));

async function precache() {
  const cache = await caches.open(PRECACHE_CACHE);
  await cache.addAll(PRECACHE_URLS);
}

async function cleanOldCaches() {
  const validCaches = new Set([PRECACHE_CACHE, RUNTIME_CACHE]);
  const keys = await caches.keys();
  await Promise.all(
    keys.filter((key) => !validCaches.has(key)).map((key) => caches.delete(key))
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(cleanOldCaches());
  self.clients.claim();
});

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    networkPromise.catch(() => undefined);
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }

  return cached;
}

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const destination = request.destination;

  if (destination === 'document' || url.pathname === '/') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (destination === 'style' || destination === 'script') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (
    destination === 'image' ||
    destination === 'font' ||
    /\.(png|jpe?g|svg|gif|webp|ico)$/i.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
