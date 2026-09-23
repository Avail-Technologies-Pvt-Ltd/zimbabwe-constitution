/**
 * Service Worker for Zimbabwean Constitution Django Web App / PWA
 * Caches core app shell (HTML, CSS, JS) and constitutional data for 100% offline access.
 */

const CACHE_VERSION = 'v1.1.0';
const CACHE_NAME = `zim-constitution-${CACHE_VERSION}`;

// Core assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/static/css/styles.css',
  '/static/js/app.js',
  '/static/js/constitution-data.js',
  '/static/js/tts-engine.js',
  '/static/js/auth.js',
  '/static/js/search.js',
  '/static/js/bookmarks.js',
  '/static/icons/icon-192.svg',
  '/static/icons/icon-512.svg'
];

/**
 * 1. INSTALL EVENT
 * Triggered when the service worker is first registered or updated.
 * Pre-caches critical app assets into the Cache API.
 */
self.addEventListener('install', (event) => {
  console.log(`[Service Worker] Installing Django PWA version: ${CACHE_VERSION}`);

  // Force this new service worker to become active immediately
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[Service Worker] Pre-caching app shell & assets...');
      const cachePromises = PRECACHE_ASSETS.map(async (url) => {
        try {
          const response = await fetch(url, { cache: 'no-cache' });
          if (response.ok) {
            return await cache.put(url, response);
          } else {
            console.warn(`[Service Worker] Skipped caching ${url}: HTTP status ${response.status}`);
          }
        } catch (err) {
          console.warn(`[Service Worker] Failed to pre-cache ${url}:`, err);
        }
      });
      await Promise.all(cachePromises);
      console.log('[Service Worker] Pre-caching complete.');
    })
  );
});

/**
 * 2. ACTIVATE EVENT
 * Cleans up outdated caches from previous versions and claims clients immediately.
 */
self.addEventListener('activate', (event) => {
  console.log(`[Service Worker] Activating version: ${CACHE_VERSION}`);

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((existingCache) => {
          if (existingCache !== CACHE_NAME) {
            console.log(`[Service Worker] Deleting obsolete cache: ${existingCache}`);
            return caches.delete(existingCache);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

/**
 * 3. FETCH EVENT
 * Intercepts all network requests.
 * Strategy: Cache First, falling back to Network with dynamic caching.
 */
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle Chrome extension requests or non-http(s) schemas
  if (!request.url.startsWith('http://') && !request.url.startsWith('https://')) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached version immediately
        fetchAndRefresh(request, CACHE_NAME).catch(() => {});
        return cachedResponse;
      }

      // If not in cache, fetch from network and dynamically cache
      return fetch(request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });

          return networkResponse;
        })
        .catch((error) => {
          console.log('[Service Worker] Offline request:', request.url);

          // For HTML navigation requests, return the cached root / index
          if (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
            return caches.match('/');
          }

          throw error;
        });
    })
  );
});

async function fetchAndRefresh(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      await cache.put(request, networkResponse.clone());
    }
  } catch (e) {}
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('[Service Worker] Cache cleared upon app request.');
    });
  }
});
