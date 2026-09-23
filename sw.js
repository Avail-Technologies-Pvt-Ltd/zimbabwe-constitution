/**
 * Service Worker for Zimbabwean Constitution Mobile Web App / PWA
 * Caches core app shell (HTML, CSS, JS) and constitutional data for 100% offline access.
 */

const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `zim-constitution-${CACHE_VERSION}`;

// Core assets to pre-cache on install
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/constitution-data.js',
  './js/tts-engine.js',
  './js/search.js',
  './js/bookmarks.js',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];

/**
 * 1. INSTALL EVENT
 * Triggered when the service worker is first registered or updated.
 * Pre-caches critical app assets into the Cache API.
 */
self.addEventListener('install', (event) => {
  console.log(`[Service Worker] Installing version: ${CACHE_VERSION}`);

  // Force this new service worker to become active immediately
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[Service Worker] Pre-caching app shell & assets...');
      // Cache assets individually so failure of one does not break the rest
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
      // Take control of all open client tabs immediately without reload
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

  // Only handle GET requests (Cache API only supports GET)
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
        // Return cached version immediately for instant performance
        // Optionally revalidate in background for up-to-date content
        fetchAndRefresh(request, CACHE_NAME).catch(() => {
          // Offline, safe to ignore network failure
        });
        return cachedResponse;
      }

      // If not in cache, fetch from network and dynamically cache
      return fetch(request)
        .then((networkResponse) => {
          // Check if valid response
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          // Clone the response because stream can only be consumed once
          const responseToCache = networkResponse.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });

          return networkResponse;
        })
        .catch((error) => {
          console.log('[Service Worker] Network request failed (offline):', request.url);

          // For HTML navigation requests, return the cached index.html as offline fallback
          if (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
            return caches.match('./index.html');
          }

          throw error;
        });
    })
  );
});

/**
 * Background revalidation helper: updates cache in background if network is available
 */
async function fetchAndRefresh(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      await cache.put(request, networkResponse.clone());
    }
  } catch (e) {
    // Suppress network errors in background revalidation
  }
}

/**
 * 4. MESSAGE LISTENER
 * Allows app to communicate with service worker (e.g., skipWaiting or manual cache purge).
 */
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
