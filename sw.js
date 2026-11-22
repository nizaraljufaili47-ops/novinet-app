// NoviNet service worker — app shell cache + offline fallback.
// Bump VERSION on every deploy so users get the new files.
const VERSION = 'novinet-v4';
const SHELL = ['./', './index.html', './privacy.html', './site-config.js', './app.js', './privacy.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './favicon-48.png'];
const NETWORK_WAIT_MS = 4000; // a stalled connection must not freeze the page: fall back to the cache

self.addEventListener('install', (event) => {
  // Cache each file on its own so one missing file can never break the install.
  event.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

function fetchWithTimeout(req, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(req, { signal: ctrl.signal }).finally(() => clearTimeout(t));
}
// Only good responses are cached — an error page must never become the offline page.
function remember(req, res) {
  if (res && res.ok && res.type !== 'opaque') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never touch the VPN API or speed-test traffic: it must always be live.
  if (url.hostname.endsWith('nip.io') || url.hostname.includes('cloudflare.com') || url.pathname.startsWith('/api/')) return;

  // Pages: network first (4 s), then the cached copy of THAT page, then the home page.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetchWithTimeout(req, NETWORK_WAIT_MS).then((res) => remember(req, res))
        .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // Same-origin files (incl. site-config.js): network first, so edits show up immediately.
  if (url.origin === location.origin) {
    event.respondWith(
      fetchWithTimeout(req, NETWORK_WAIT_MS).then((res) => remember(req, res)).catch(() => caches.match(req))
    );
    return;
  }

  // Google Fonts: cache first, refresh in the background (opaque responses are fine here).
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
  }
});
