// ── Winkd Messenger Service Worker ──
// Cache-first for assets, network-first for API calls, offline fallback page

const CACHE_NAME = 'winkd-v2';
const OFFLINE_URL = '/app.html';

// Everything we want cached immediately on install
const PRECACHE_ASSETS = [
  '/app.html',
  '/manifest.json',
];

// ── INSTALL ──
// Pre-cache core assets so the app works offline from first load
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => {
      // Skip waiting so the new SW activates immediately
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE ──
// Delete old caches from previous versions
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => {
      // Take control of all open clients immediately
      return self.clients.claim();
    })
  );
});

// ── FETCH ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (POST etc. should always go to network)
  if (request.method !== 'GET') return;

  // Skip cross-origin requests (cdn images, external APIs)
  // except for the Imgur icon — cache that too
  if (url.origin !== location.origin && !url.hostname.includes('imgur.com')) return;

  // For navigation requests (page loads): cache-first with network fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(OFFLINE_URL).then(cached => {
        return fetch(request)
          .then(response => {
            // Update the cache with fresh version
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached || caches.match(OFFLINE_URL));
      })
    );
    return;
  }

  // For all other GET requests: stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(request).then(cached => {
        const fetchPromise = fetch(request).then(response => {
          if (response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        }).catch(() => cached);

        // Return cached immediately if we have it, fetch in background
        return cached || fetchPromise;
      })
    )
  );
});

// ── PUSH NOTIFICATIONS ──
// Stub — real implementation connects to Winkd server push endpoint
self.addEventListener('push', event => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Winkd', body: event.data.text() };
  }

  const options = {
    body: data.body || 'New message',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-96.png',
    tag: data.tag || 'winkd-message',
    renotify: true,
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
      contactId: data.contactId,
    },
    actions: [
      { action: 'reply',   title: 'Reply' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Winkd Messenger', options)
  );
});

// ── NOTIFICATION CLICK ──
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // If app already open, focus it
      for (const client of windowClients) {
        if (client.url.includes(location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ── BACKGROUND SYNC ──
// Queues outgoing messages when offline, sends when connection resumes
self.addEventListener('sync', event => {
  if (event.tag === 'winkd-send-queued') {
    event.waitUntil(flushMessageQueue());
  }
});

async function flushMessageQueue() {
  // In production this would read from IndexedDB and POST to server
  // Stub for now
  console.log('[Winkd SW] Flushing queued messages after reconnect');
}
