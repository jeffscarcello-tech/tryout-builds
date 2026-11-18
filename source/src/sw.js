/* __NAME__ service worker: keeps the app available with no signal.
   Navigations are answered from cache instantly and refreshed in the background. */
const V = '__CACHE__';
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin || u.pathname.startsWith('/api/') || u.pathname === '/admin' || u.pathname.startsWith('/admin/') || u.pathname === '/privacy') return;
  if (r.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(V);
      const cached = await c.match('/');
      const net = fetch(new Request('/', { cache: 'no-cache' })).then(res => { if (res.ok) c.put('/', res.clone()); return res; }).catch(() => null);
      if (cached) { e.waitUntil(net); return cached; }
      const res = await net;
      return res || new Response('Offline. Open the app once with signal to use it offline.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    })());
    return;
  }
  e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); } return res; })));
});
