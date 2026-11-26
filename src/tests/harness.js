/* Test harness: serves the built site like GitHub Pages would, stands in for Esri, and emulates an iPhone with a GPS. */
const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.webmanifest':'application/manifest+json', '.png':'image/png', '.woff2':'font/woff2', '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
function png(w, h, f) {
  const tb = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tb[n] = c >>> 0; }
  const crc = b => { let r = 0xffffffff; for (const x of b) r = tb[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const c = f(x, y), o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; } }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// a grass-like tile: mottled green with a faint edge so scale and rotation are visible in screenshots
const TILE = png(256, 256, (x, y) => { const e = x === 0 || y === 0, n = ((x * 37 + y * 91 + ((x >> 3) * (y >> 3)) % 7 * 5) % 23); return e ? [38, 70, 44] : [52 + n, 104 + n, 58 + (n >> 1)]; });
const STYLE = key => ({ version: 8, name: 'test imagery', sources: { 'esri-imagery': { type: 'raster', tiles: [`https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${key}`], tileSize: 256, maxzoom: 23, attribution: 'Esri, Vantor, Earthstar Geographics, and the GIS User Community' } }, layers: [{ id: 'esri-imagery', type: 'raster', source: 'esri-imagery' }] });

async function start(opt = {}) {
  const state = { key: opt.key === undefined ? 'TESTKEY' : opt.key, tiles: 0, styles: 0, tilemaps: 0, badTiles: 0, maxPhoto: opt.maxPhoto || 19, styleStatus: 200 };
  const srv = http.createServer((q, s) => {
    let u = decodeURIComponent(q.url.split('?')[0]);
    if (!u.startsWith('/stroke-ledger/')) { s.writeHead(404); return s.end(); }
    u = u.slice('/stroke-ledger/'.length) || 'index.html';
    if (u === 'config.js') { s.writeHead(200, { 'content-type': TYPES['.js'] }); return s.end(`window.STROKE_LEDGER = { esriKey: ${JSON.stringify(state.key)} };`); }
    if (u === 'geo.js' && !opt.pins) {          // most tests start from unmapped courses: keep the club locations, drop the built-in pins
      const g = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'geo.json'), 'utf8')); Object.values(g.courses).forEach(c => { c.holes = []; });
      s.writeHead(200, { 'content-type': TYPES['.js'] }); return s.end('window.SL_GEO = ' + JSON.stringify(g) + ';');
    }
    const f = path.join(ROOT, u);
    if (!f.startsWith(ROOT) || u.startsWith('.git')) { s.writeHead(403); return s.end(); }
    fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); } else { s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); s.end(d); } });
  });
  await new Promise(r => srv.listen(0, r));
  const base = `http://localhost:${srv.address().port}/stroke-ledger/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices[opt.device || 'iPhone 14'], geolocation: opt.geo || undefined, permissions: opt.geo === null ? [] : ['geolocation'], acceptDownloads: true });
  await ctx.route('https://basemapstyles-api.arcgis.com/**', r => { if (state.offline) return r.abort('internetdisconnected'); state.styles++; const k = new URL(r.request().url()).searchParams.get('token'); if (state.styleStatus !== 200) return r.fulfill({ status: state.styleStatus, body: '{}' }); r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(k === 'TESTKEY' ? STYLE(k) : { error: { code: 498, message: 'Invalid token.' } }) }); });
  const esri = r => {
    if (state.offline) return r.abort('internetdisconnected');
    const u = r.request().url(), tm = /\/tilemap\/(\d+)\//.exec(u), t = /\/tile\/(\d+)\//.exec(u);
    if (tm) { state.tilemaps++; return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ valid: true, data: [+tm[1] <= state.maxPhoto ? 1 : 0] }) }); }
    if (t) { state.tiles++; if (+t[1] > state.maxPhoto) state.badTiles++; return r.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: TILE }); }
    r.fulfill({ status: 404, body: '' });
  };
  await ctx.route('https://ibasemaps-api.arcgis.com/**', esri);
  await ctx.route('https://server.arcgisonline.com/**', esri);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/GL Driver|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
  const t = {
    base, page, ctx, browser, state, errors, n: 0, fails: 0,
    ok(cond, what, extra) { t.n++; if (cond) console.log('  ok  ' + what); else { t.fails++; console.log('  FAIL ' + what + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); } },
    async open(hash = '') { await page.goto(base + (hash ? '#' + hash : '')); await page.waitForSelector('#tabs button'); },
    text: sel => page.locator(sel).first().innerText(),
    async mapReady() { await page.waitForFunction(() => SLMap._ready() && SLMap._map().loaded(), null, { timeout: 20000 }); await page.waitForTimeout(250); },
    /** screen position of a map coordinate */
    px: ll => page.evaluate(([lat, lng]) => { const m = SLMap._map(), p = m.project([lng, lat]), r = m.getContainer().getBoundingClientRect(); return [r.left + p.x, r.top + p.y, r.width, r.height, p.x, p.y]; }, ll),
    async tapMap(ll) { const [x, y, w, h, px, py] = await t.px(ll); if (px < 4 || py < 4 || px > w - 4 || py > h - 4) throw new Error('point is off the map: ' + ll); await page.locator('#mapSlot').scrollIntoViewIfNeeded(); const [x2, y2] = await t.px(ll); await page.touchscreen.tap(x2, y2); await page.waitForTimeout(120); },
    jump: (ll, zoom, bearing = 0) => page.evaluate(([ll, zoom, bearing]) => SLMap._map().jumpTo({ center: [ll[1], ll[0]], zoom, bearing }), [ll, zoom, bearing]),
    async dragMarker(sel, toLL) { await page.locator('#mapSlot').scrollIntoViewIfNeeded(); const b = await page.locator(sel).first().boundingBox(); const [x, y] = await t.px(toLL); const sx = b.x + b.width / 2, sy = b.y + b.height / 2; await page.mouse.move(sx, sy); await page.mouse.down(); for (let i = 1; i <= 6; i++) await page.mouse.move(sx + (x - sx) * i / 6, sy + (y - sy) * i / 6); await page.mouse.up(); await page.waitForTimeout(150); },
    geo: (ll, acc = 4) => ctx.setGeolocation({ latitude: ll[0], longitude: ll[1], accuracy: acc }),
    data: () => page.evaluate(() => JSON.parse(localStorage.getItem('strokeLedger.v1'))),
    shot: async (name, full) => { await page.waitForTimeout(350); await page.screenshot({ path: path.join(__dirname, 'out', name + '.png'), fullPage: !!full }); },
    async end() { t.ok(!errors.length, 'no page errors', errors.slice(0, 5)); await browser.close(); srv.close(); console.log(t.fails ? `\n${t.fails} of ${t.n} checks FAILED` : `\nall ${t.n} checks passed`); process.exitCode = t.fails ? 1 : 0; }
  };
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  return t;
}
module.exports = { start, ROOT };
