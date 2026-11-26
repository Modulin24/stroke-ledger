/* Stroke Ledger: keeps the app's own files on the device so it opens without a signal. Built by src/build.py. */
const V = 'stroke-ledger-16941ffa4748';
const SHELL = ["./", "index.html", "config.js", "geo.js", "manifest.webmanifest", "scorecard-template.xlsx", "vendor/maplibre-gl.js", "vendor/maplibre-gl.css", "icons/icon-64.png", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "fonts/barlow-latin-400-normal.woff2", "fonts/barlow-latin-500-normal.woff2", "fonts/barlow-latin-600-normal.woff2", "fonts/barlow-condensed-latin-500-normal.woff2", "fonts/barlow-condensed-latin-600-normal.woff2", "fonts/barlow-condensed-latin-700-normal.woff2"];
const FRESH = /\/(index\.html|config\.js|geo\.js)?$/;          // always ask the network first for these, so updates arrive
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('stroke-ledger-') && k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
const timed = (url, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('slow')), ms); fetch(url, { cache: 'no-cache' }).then(x => { clearTimeout(t); res(x); }, x => { clearTimeout(t); rej(x); }); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(V), key = u.origin + u.pathname;
    if (r.mode === 'navigate' || FRESH.test(u.pathname)) {
      try { const x = await timed(key, 5000); if (x.ok) c.put(key, x.clone()); return x; }
      catch (err) { return (await c.match(key)) || (await c.match('./')) || (await c.match('index.html')) || Response.error(); }
    }
    const hit = await c.match(key); if (hit) return hit;
    const x = await fetch(r); if (x.ok) c.put(key, x.clone()); return x;
  })());
});
