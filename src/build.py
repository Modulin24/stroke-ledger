#!/usr/bin/env python3
"""Builds the Stroke Ledger web app into the repository root, which GitHub Pages serves.

    python3 src/build.py

Reads src/head.html, src/engine.js, src/map.js, src/ui.js, src/seed.json and src/geo.json.
Writes index.html, geo.js, sw.js, manifest.webmanifest and icons/.
config.js holds the site owner's map key: it is created once if missing and never overwritten.
"""
import hashlib, json, os, re
from PIL import Image, ImageDraw

SRC = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(SRC)
S = lambda *a: os.path.join(SRC, *a); R = lambda *a: os.path.join(ROOT, *a)
NAME = 'Stroke Ledger'
read = lambda p: open(p, encoding='utf-8').read()
def write(p, text):
    open(p, 'w', encoding='utf-8', newline='\n').write(text)

# ---------- icons: full-bleed, because an iPhone rounds the corners itself and shows transparency as black ----------
def icon(size):
    s = 4; n = size * s
    im = Image.new('RGB', (n, n), (20, 43, 35)); d = ImageDraw.Draw(im); u = n / 100.0
    d.ellipse([24 * u, 72 * u, 62 * u, 84 * u], outline=(231, 238, 234), width=int(3.2 * u))          # the cup
    d.rounded_rectangle([40.4 * u, 18 * u, 45.6 * u, 79 * u], radius=2.6 * u, fill=(231, 238, 234))   # the pole
    d.polygon([(45.6 * u, 19.5 * u), (80 * u, 32 * u), (45.6 * u, 45.5 * u)], fill=(245, 197, 24))    # the flag
    return im.resize((size, size), Image.LANCZOS)
os.makedirs(R('icons'), exist_ok=True)
for px in (64, 180, 192, 512):
    icon(px).save(R('icons', f'icon-{px}.png'), optimize=True)

# ---------- course pins that ship with the app ----------
geo = json.loads(read(S('geo.json')))
write(R('geo.js'), '/* Tee and green pins for the courses that come with the app. Built from src/geo.json. */\nwindow.SL_GEO = '
      + json.dumps(geo, separators=(',', ':')) + ';\n')

# ---------- the map key file: made once, then left alone ----------
if not os.path.exists(R('config.js')):
    write(R('config.js'), '''/* Stroke Ledger settings for this site.

   esriKey: the ArcGIS (Esri) API key that turns on the satellite photo.
   Paste the key between the two quote marks below, keep the quote marks, and save the file.
   The key only works on https://modulin24.github.io, so it is fine for it to be visible here. */
window.STROKE_LEDGER = {
  esriKey: ""
};
''')

# ---------- page ----------
head = read(S('head.html')); eng = read(S('engine.js')); mp = read(S('map.js')); ui = read(S('ui.js'))
seed = json.loads(read(S('seed.json')))
seed_json = json.dumps(seed, separators=(',', ':'), ensure_ascii=False).replace('<', '\\u003c').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
for name, src in (('engine', eng), ('map', mp), ('ui', ui)):
    assert '</script' not in src.lower() and '<!--' not in src, name
m = re.match(r'<style>\n(.*?)</style>\n(.*)$', head, re.S); assert m, 'head.html should be one <style> block followed by the page markup'
css, body = m.group(1), m.group(2)
assert 'http' not in (css + body).replace('http://www.w3.org', ''), 'the page head points at another site'
face = lambda fam, stem, w: (f"@font-face{{font-family:'{fam}';font-style:normal;font-weight:{w};font-display:swap;"
                             f"src:url(fonts/{stem}-latin-{w}-normal.woff2) format('woff2')}}")
fonts = [('Barlow', 'barlow', w) for w in (400, 500, 600)] + [('Barlow Condensed', 'barlow-condensed', w) for w in (500, 600, 700)]
for _, stem, w in fonts: assert os.path.exists(R('fonts', f'{stem}-latin-{w}-normal.woff2'))

doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#eef2f0" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0e1412" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="{NAME}">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="format-detection" content="telephone=no">
<meta name="description" content="Strokes gained, course management and a GPS shot map for your own rounds of golf.">
<title>{NAME}</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="icons/icon-64.png">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<link rel="stylesheet" href="vendor/maplibre-gl.css">
<style>
html{{background:var(--bg)}}
body{{margin:0;overscroll-behavior-y:none}}
img{{max-width:100%}}
[hidden]{{display:none!important}}
{chr(10).join(face(*f) for f in fonts)}
{css}</style>
</head>
<body>
{body}<script id="seed" type="application/json">{seed_json}</script>
<script src="config.js"></script>
<script src="geo.js"></script>
<script src="vendor/maplibre-gl.js"></script>
<script>
{eng}</script>
<script>
{mp}</script>
<script>
{ui}</script>
<script>
if ('serviceWorker' in navigator) addEventListener('load', () => {{ navigator.serviceWorker.register('sw.js').catch(() => {{}}); }});
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {{}});
</script>
</body>
</html>
"""
write(R('index.html'), doc)

# ---------- home-screen app ----------
write(R('manifest.webmanifest'), json.dumps({
    'name': NAME, 'short_name': NAME, 'description': 'Strokes gained, course management and a GPS shot map.',
    'start_url': './', 'scope': './', 'display': 'standalone', 'orientation': 'portrait', 'background_color': '#0e1412', 'theme_color': '#0e1412',
    'icons': [{'src': 'icons/icon-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any maskable'},
              {'src': 'icons/icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any maskable'}]}, indent=1) + '\n')

# ---------- offline start: the app's own files are kept on the phone. Map photos are not: they always come from Esri. ----------
shell = ['index.html', 'config.js', 'geo.js', 'manifest.webmanifest', 'scorecard-template.xlsx', 'vendor/maplibre-gl.js', 'vendor/maplibre-gl.css',
         'icons/icon-64.png', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'] + [f'fonts/{stem}-latin-{w}-normal.woff2' for _, stem, w in fonts]
h = hashlib.sha256()
for f in shell:
    if f != 'config.js': h.update(open(R(f), 'rb').read())
ver = h.hexdigest()[:12]
write(R('sw.js'), f"""/* Stroke Ledger: keeps the app's own files on the device so it opens without a signal. Built by src/build.py. */
const V = 'stroke-ledger-{ver}';
const SHELL = {json.dumps(['./'] + shell)};
const FRESH = /\\/(index\\.html|config\\.js|geo\\.js)?$/;          // always ask the network first for these, so updates arrive
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('stroke-ledger-') && k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
const timed = (url, ms) => new Promise((res, rej) => {{ const t = setTimeout(() => rej(new Error('slow')), ms); fetch(url, {{ cache: 'no-cache' }}).then(x => {{ clearTimeout(t); res(x); }}, x => {{ clearTimeout(t); rej(x); }}); }});
self.addEventListener('fetch', e => {{
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith((async () => {{
    const c = await caches.open(V), key = u.origin + u.pathname;
    if (r.mode === 'navigate' || FRESH.test(u.pathname)) {{
      try {{ const x = await timed(key, 5000); if (x.ok) c.put(key, x.clone()); return x; }}
      catch (err) {{ return (await c.match(key)) || (await c.match('./')) || (await c.match('index.html')) || Response.error(); }}
    }}
    const hit = await c.match(key); if (hit) return hit;
    const x = await fetch(r); if (x.ok) c.put(key, x.clone()); return x;
  }})());
}});
""")
print(f'built {NAME}: index.html {os.path.getsize(R("index.html"))} bytes, cache {ver}')
