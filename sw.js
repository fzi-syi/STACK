/**
 * STACK — Service Worker
 * Provides offline support, caching, and PWA install capabilities.
 * Strategy: Cache-First for static assets, Network-First for dynamic content.
 */

const CACHE_NAME = 'stack-v1.0.0';
const STATIC_CACHE = 'stack-static-v1.0.0';
const DYNAMIC_CACHE = 'stack-dynamic-v1.0.0';

// Core app shell — always cache these
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json'
];

// External CDN resources to cache
const CDN_RESOURCES = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

// ── INSTALL ──────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[STACK SW] Installing…');
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      // Cache app shell immediately
      return cache.addAll(APP_SHELL).then(() => {
        // Try to cache CDN resources — fail silently if offline during install
        return Promise.allSettled(
          CDN_RESOURCES.map(url =>
            fetch(url, { mode: 'cors' })
              .then(res => res.ok ? cache.put(url, res) : null)
              .catch(() => null)
          )
        );
      });
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[STACK SW] Activating…');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map(key => {
            console.log('[STACK SW] Clearing old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s) requests
  if (!request.url.startsWith('http')) return;

  // ── Strategy: Cache-First for app shell + static assets ──
  if (isAppShell(url) || isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // ── Strategy: Stale-While-Revalidate for CDN fonts + scripts ──
  if (isCDNResource(url)) {
    event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
    return;
  }

  // ── Strategy: Network-First with cache fallback for everything else ──
  event.respondWith(networkFirst(request, DYNAMIC_CACHE));
});

// ── CACHE STRATEGIES ─────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return offlineFallback(request);
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || offlineFallback(request);
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);

  return cached || fetchPromise;
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

function isAppShell(url) {
  return url.pathname === '/' ||
         url.pathname.endsWith('/index.html') ||
         url.pathname.endsWith('/manifest.json') ||
         url.pathname.endsWith('/sw.js');
}

function isStaticAsset(url) {
  return /\.(css|js|woff2?|ttf|otf|png|jpg|jpeg|svg|ico|webp|gif)$/i.test(url.pathname);
}

function isCDNResource(url) {
  return url.hostname.includes('fonts.googleapis.com') ||
         url.hostname.includes('fonts.gstatic.com') ||
         url.hostname.includes('cdn.jsdelivr.net') ||
         url.hostname.includes('cdnjs.cloudflare.com');
}

function offlineFallback(request) {
  const url = new URL(request.url);
  // For navigation requests, return the cached index.html
  if (request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    return caches.match('./index.html').then(cached =>
      cached || new Response(OFFLINE_HTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    );
  }
  // For everything else, return a minimal offline response
  return new Response('', { status: 503, statusText: 'Service Unavailable' });
}

// Minimal offline page (shown only if index.html itself isn't cached)
const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>STACK — Offline</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0 }
    body {
      background: #08090D; color: #F0F2F7;
      font-family: -apple-system, sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; text-align: center; padding: 24px;
    }
    .wrap { max-width: 320px }
    .logo { font-size: 1.4rem; font-weight: 800; letter-spacing: 0.18em; color: #4488FF; margin-bottom: 16px }
    p { color: #5A6070; font-size: 0.9rem; line-height: 1.6 }
    .dot { display: inline-block; width: 8px; height: 8px; background: #4488FF; border-radius: 50%; margin: 0 3px; animation: pulse 1.4s ease-in-out infinite }
    .dot:nth-child(2) { animation-delay: 0.2s }
    .dot:nth-child(3) { animation-delay: 0.4s }
    @keyframes pulse { 0%,80%,100% { opacity: 0.2 } 40% { opacity: 1 } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo">STACK</div>
    <p>You're offline. Your data is safe locally — reconnect to sync.</p>
    <br>
    <span class="dot"></span><span class="dot"></span><span class="dot"></span>
  </div>
</body>
</html>`;

// ── MESSAGE FROM PAGE → SHOW NOTIFICATION ────────────────────────────────────
// The app sends { type: 'SHOW_NOTIFICATION', title, body, tag } to the SW
// The SW then shows the notification — this works even when the page is backgrounded
self.addEventListener('message', event => {
  if (!event.data) return;

  if (event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag } = event.data;
    event.waitUntil(
      self.registration.showNotification(title || 'STACK', {
        body: body || 'Keep stacking your habits.',
        tag:  tag  || 'stack-reminder',
        icon: './manifest.json',
        badge: './manifest.json',
        vibrate: [120, 60, 120],
        renotify: true,
        requireInteraction: false,
        data: { url: './' }
      })
    );
  }

  // Notify the page that the SW is ready (used to re-schedule timers)
  if (event.data.type === 'PING') {
    event.source && event.source.postMessage({ type: 'SW_READY' });
  }
});

// ── BACKGROUND SYNC (future-ready) ───────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'stack-sync') {
    console.log('[STACK SW] Background sync triggered');
    // Placeholder for future cloud sync functionality
  }
});

// ── PUSH NOTIFICATIONS (future-ready) ────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'STACK', {
      body: data.body || 'Time to stack your habits.',
      icon: './manifest.json',
      badge: './manifest.json',
      tag: 'stack-reminder',
      renotify: true,
      vibrate: [100, 50, 100],
      data: { url: data.url || './' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
