/* Stroke Ledger: course geometry, GPS and the satellite map.
   Points are [latitude, longitude]. Distances are in yards. The map itself is drawn by MapLibre GL JS; the photo comes
   from Esri's World Imagery through the ArcGIS Basemap Styles service, using the key in config.js. */
const SLMap = (() => {
  'use strict';
  const YD = 1.0936133, R = 6371008.8, rad = Math.PI / 180;
  const CFG = () => window.STROKE_LEDGER || {};
  const r6 = p => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6];
  const ok = p => Array.isArray(p) && p.length === 2 && isFinite(p[0]) && isFinite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180 && !(p[0] === 0 && p[1] === 0);
  const okPoly = g => Array.isArray(g) && g.length >= 3 && g.every(ok);

  /* ---------- geometry ---------- */
  function dist(a, b) {
    const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))) * YD;
  }
  // A flat frame around an origin: x east, y north, in yards. Accurate to a few centimetres over a golf hole.
  const toXY = (o, p) => [(p[1] - o[1]) * rad * R * Math.cos(o[0] * rad) * YD, (p[0] - o[0]) * rad * R * YD];
  const toLL = (o, v) => [o[0] + v[1] / YD / R / rad, o[1] + v[0] / YD / (R * Math.cos(o[0] * rad)) / rad];
  const bearing = (a, b) => { const v = toXY(a, b); return (Math.atan2(v[0], v[1]) / rad + 360) % 360; };   // degrees clockwise from north
  const dest = (a, brg, yd) => toLL(a, [Math.sin(brg * rad) * yd, Math.cos(brg * rad) * yd]);
  function centroid(poly) {
    const o = poly[0], P = poly.map(p => toXY(o, p));
    let A = 0, cx = 0, cy = 0;
    for (let i = 0, n = P.length; i < n; i++) { const a = P[i], b = P[(i + 1) % n], k = a[0] * b[1] - b[0] * a[1]; A += k; cx += (a[0] + b[0]) * k; cy += (a[1] + b[1]) * k; }
    if (Math.abs(A) < 1e-6) return toLL(o, [P.reduce((s, p) => s + p[0], 0) / P.length, P.reduce((s, p) => s + p[1], 0) / P.length]);
    return toLL(o, [cx / (3 * A), cy / (3 * A)]);
  }
  const inXY = (p, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const inPoly = (p, poly) => inXY([0, 0], poly.map(q => toXY(p, q)));
  /** Order a green's edge points around their middle, so they can be tapped in any order. */
  function ringSort(poly) {
    if (poly.length < 3) return poly.slice();
    const o = poly[0], P = poly.map(p => toXY(o, p)), cx = P.reduce((s, p) => s + p[0], 0) / P.length, cy = P.reduce((s, p) => s + p[1], 0) / P.length;
    return poly.map((p, i) => [p, Math.atan2(P[i][1] - cy, P[i][0] - cx)]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
  }
  /** Front, centre and back of the green along the line from a spot through the middle of the green. */
  function fcb(from, poly) {
    const c = centroid(poly), C = toXY(from, c), dc = Math.hypot(C[0], C[1]), P = poly.map(p => toXY(from, p));
    if (inXY([0, 0], P) || dc < 0.5) return { c: dc, f: null, b: null, inside: true };
    const u = [C[0] / dc, C[1] / dc], ts = [];
    for (let i = 0, n = P.length; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n], d = [b[0] - a[0], b[1] - a[1]], den = u[0] * d[1] - u[1] * d[0];
      if (Math.abs(den) < 1e-9) continue;
      const t = (a[0] * d[1] - a[1] * d[0]) / den, s = (a[0] * u[1] - a[1] * u[0]) / den;
      if (t >= 0 && s >= -1e-9 && s <= 1 + 1e-9) ts.push(t);
    }
    if (ts.length < 2) return { c: dc, f: null, b: null, inside: false };
    return { c: dc, f: Math.min(...ts), b: Math.max(...ts), inside: false };
  }
  /** A ring around a centre: sx yards either side of the line of play, sy yards short and long of it. */
  function ellipse(c, brg, sx, sy, n = 56) {
    const co = Math.cos(brg * rad), si = Math.sin(brg * rad), out = [];
    for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n, lx = Math.cos(a) * sx, ly = Math.sin(a) * sy; out.push(toLL(c, [lx * co + ly * si, -lx * si + ly * co])); }
    return out;
  }
  const circle = (c, r, n = 14) => ellipse(c, 0, r, r, n).map(r6);

  /** The aim point with the lowest expected score for a shot pattern, given the green's outline and the flag.
      cost(onGreen, yardsToFlag) is the strokes still needed from a finishing spot. Works on a 1-yard grid of finishing
      spots laid along the line of play, so every aim point is judged against the same map of costs. */
  function bestAim(o) {
    const c = centroid(o.green), th = bearing(o.from, c) * rad, co = Math.cos(th), si = Math.sin(th);
    const uv = p => { const v = toXY(c, p); return [v[0] * co - v[1] * si, v[0] * si + v[1] * co]; };          // u: right of the line, v: along it
    const back = q => toLL(c, [q[0] * co + q[1] * si, -q[0] * si + q[1] * co]);
    const G = o.green.map(uv), pin = uv(o.pin || c), K = 2.5, N = 17;
    const us = G.map(p => p[0]), vs = G.map(p => p[1]), gu0 = Math.min(...us), gu1 = Math.max(...us), gv0 = Math.min(...vs), gv1 = Math.max(...vs);
    const u0 = Math.floor(gu0 - K * o.sx - 6), v0 = Math.floor(gv0 - K * o.sy - 6), W = Math.ceil(gu1 + K * o.sx + 6) - u0 + 1, Hh = Math.ceil(gv1 + K * o.sy + 6) - v0 + 1;
    const C = new Float32Array(W * Hh), ON = new Uint8Array(W * Hh);
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { const L = [u0 + x, v0 + y], on = inXY(L, G); ON[y * W + x] = on ? 1 : 0; C[y * W + x] = o.cost(on, Math.hypot(L[0] - pin[0], L[1] - pin[1])); }
    const S = []; let wsum = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const zx = -K + 2 * K * i / (N - 1), zy = -K + 2 * K * j / (N - 1), w = Math.exp(-(zx * zx + zy * zy) / 2); S.push([zx * o.sx, zy * o.sy, w]); wsum += w; }
    const score = A => {
      let v = 0, g = 0;
      for (const s of S) { const x = Math.min(W - 1, Math.max(0, Math.round(A[0] + s[0] - u0))), y = Math.min(Hh - 1, Math.max(0, Math.round(A[1] + s[1] - v0))), k = y * W + x; v += s[2] * C[k]; if (ON[k]) g += s[2]; }
      return { v: v / wsum, green: g / wsum };
    };
    let best = null;
    for (let u = gu0 - 3; u <= gu1 + 3; u += 1) for (let v = gv0 - 3; v <= gv1 + 3; v += 1) { const r = score([u, v]); if (!best || r.v < best.v) best = { v: r.v, green: r.green, a: [u, v] }; }
    const atPin = score(pin);
    if (atPin.v <= best.v + 0.01) best = { v: atPin.v, green: atPin.green, a: pin };      // no real gain from aiming away: aim at the flag
    return { pt: r6(back(best.a)), v: best.v, green: best.green, pin: atPin, score: p => score(uv(p)) };
  }

  /* ---------- GPS ---------- */
  const GK = 'strokeLedger.gps';
  const gps = { want: false, fix: null, err: '', id: null };
  const subs = new Set();
  const tell = () => { drawMe(); subs.forEach(f => { try { f(gps); } catch (e) { /* a listener failed: keep going */ } }); };
  try { gps.want = localStorage.getItem(GK) === '1'; } catch (e) { /* no storage */ }
  function gpsRun() {
    if (gps.id != null || !gps.want) return;
    if (!navigator.geolocation) { gps.err = 'This browser has no GPS.'; tell(); return; }
    gps.err = '';
    gps.id = navigator.geolocation.watchPosition(p => {
      gps.fix = { ll: r6([p.coords.latitude, p.coords.longitude]), acc: p.coords.accuracy, t: Date.now() }; gps.err = ''; tell();
    }, e => {
      gps.err = e.code === 1 ? 'Location is blocked for this site.' : e.code === 2 ? 'No GPS signal yet.' : 'Still looking for GPS.';
      if (e.code === 1) { gpsPause(); gps.fix = null; }
      tell();
    }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
  }
  function gpsPause() { if (gps.id != null && navigator.geolocation) navigator.geolocation.clearWatch(gps.id); gps.id = null; }
  function gpsSet(on) { gps.want = !!on; try { localStorage.setItem(GK, on ? '1' : '0'); } catch (e) { /* ignore */ } if (on) gpsRun(); else { gpsPause(); gps.fix = null; gps.err = ''; } tell(); }
  const fresh = () => gps.fix && Date.now() - gps.fix.t < 60000 ? gps.fix : null;
  // Coming back to the app (phone unlocked at the next shot): restart the GPS so the first fix is a new one.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && gps.want && model) { gpsPause(); gpsRun(); } });
  /** A position taken now, for marking a spot. Resolves with null when the phone cannot give one in time. */
  function locate(ms) {
    return new Promise(res => {
      if (gps.fix && Date.now() - gps.fix.t < 5000) return res(gps.fix);
      if (!navigator.geolocation) return res(null);
      let done = false; const fin = v => { if (!done) { done = true; res(v); } };
      navigator.geolocation.getCurrentPosition(p => { gps.fix = { ll: r6([p.coords.latitude, p.coords.longitude]), acc: p.coords.accuracy, t: Date.now() }; gps.err = ''; tell(); fin(gps.fix); },
        e => { gps.err = e.code === 1 ? 'Location is blocked for this site.' : 'No GPS position yet.'; tell(); fin(null); }, { enableHighAccuracy: true, maximumAge: 3000, timeout: ms });
      setTimeout(() => fin(gps.fix && Date.now() - gps.fix.t < 15000 ? gps.fix : null), ms + 600);
    });
  }

  /* ---------- the photo ---------- */
  const BLANK = { version: 8, sources: {}, layers: [{ id: 'sl-bg', type: 'background', paint: { 'background-color': '#16251d' } }] };
  const photo = { state: 'none', max: 18, credit: '' };          // none | ok | nokey | offline | denied
  const PK = 'strokeLedger.photoZoom';
  const tileXY = (ll, z) => { const n = 2 ** z; return [Math.floor((ll[1] + 180) / 360 * n), Math.floor((1 - Math.asinh(Math.tan(ll[0] * rad)) / Math.PI) / 2 * n)]; };
  const timed = (url, ms) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); return fetch(url, { signal: c.signal }).finally(() => clearTimeout(t)); };
  /** The sharpest photo level that exists at a spot. It differs by region, and asking for more returns a "no data" picture. */
  async function photoMax(ll, tmpl) {
    const cell = ll.map(v => v.toFixed(2)).join(',');
    let memo = {}; try { memo = JSON.parse(localStorage.getItem(PK) || '{}'); } catch (e) { memo = {}; }
    if (memo[cell] && Date.now() - memo[cell].t < 30 * 864e5) return memo[cell].z;
    const m = /^(.*\/MapServer)\/tile\/\{z\}\/\{y\}\/\{x\}(\?.*)?$/.exec(tmpl || '');
    const roots = [];
    if (m) roots.push([m[1], (m[2] || '').replace(/^\?/, '')]);
    roots.push(['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer', '']);
    for (const [root, q] of roots) {
      try {
        const zs = [20, 19, 18, 17];
        const res = await Promise.all(zs.map(async z => { const [x, y] = tileXY(ll, z), r = await timed(`${root}/tilemap/${z}/${y}/${x}/1/1?f=json${q ? '&' + q : ''}`, 3500); const j = await r.json(); if (!j || !Array.isArray(j.data)) throw new Error('shape'); return j.data[0] ? z : 0; }));
        const z = Math.max(16, ...res);
        memo[cell] = { z, t: Date.now() }; try { localStorage.setItem(PK, JSON.stringify(memo)); } catch (e) { /* ignore */ }
        return z;
      } catch (e) { /* try the next source */ }
    }
    return 18;
  }
  async function loadStyle(ll) {
    const key = String(CFG().esriKey || '').trim();
    if (!key) { photo.state = 'nokey'; return BLANK; }
    try {
      const r = await timed('https://basemapstyles-api.arcgis.com/arcgis/rest/services/styles/v2/styles/arcgis/imagery/standard?token=' + encodeURIComponent(key), 9000);
      if (r.status === 401 || r.status === 403 || r.status === 498 || r.status === 499) { photo.state = 'denied'; return BLANK; }
      const st = await r.json();
      if (!st || st.error || !st.sources || !Array.isArray(st.layers)) { photo.state = st && st.error ? 'denied' : 'offline'; return BLANK; }
      const ras = Object.values(st.sources).filter(s => s && s.type === 'raster');
      photo.max = await photoMax(ll, ras[0] && ras[0].tiles && ras[0].tiles[0]);
      ras.forEach(s => { s.maxzoom = Math.min(s.maxzoom == null ? 22 : s.maxzoom, photo.max); });
      photo.credit = [...new Set(Object.values(st.sources).map(s => String((s && s.attribution) || '').replace(/<[^>]*>/g, '').trim()).filter(Boolean))].join('; ');
      photo.state = 'ok';
      return st;
    } catch (e) { photo.state = 'offline'; return BLANK; }
  }
  const PHOTO_MSG = { nokey: 'Satellite photo is off: the map key has not been added yet. Pins and distances still work.', denied: 'The map key was not accepted, so there is no satellite photo. Pins and distances still work.', offline: 'No connection for the satellite photo. Pins and distances still work.' };

  /* ---------- the map ---------- */
  let map = null, host = null, msgEl = null, attrEl = null, ready = false, making = false, model = null, H = {}, lastKey = null, lastCenter = null;
  const LK = 'strokeLedger.mapAt';
  const mk = {}, lists = { dot: [], vert: [] };
  const fc = feats => ({ type: 'FeatureCollection', features: feats });
  const lngs = pts => pts.map(p => [p[1], p[0]]);
  const poly = (ring, props) => ({ type: 'Feature', properties: props || {}, geometry: { type: 'Polygon', coordinates: [lngs(ring.concat([ring[0]]))] } });
  const line = (pts, props) => ({ type: 'Feature', properties: props || {}, geometry: { type: 'LineString', coordinates: lngs(pts) } });
  const el = (cls, html) => { const d = document.createElement('div'); d.className = 'mk ' + cls; d.innerHTML = html || ''; d.addEventListener('click', e => e.stopPropagation()); return d; };
  const ICON = {
    tee: '<b>T</b>',
    flag: '<svg width="26" height="34" viewBox="0 0 26 34" aria-hidden="true"><path d="M5 2v30" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/><path d="M5 2v30" stroke="#14201c" stroke-width="2.2" stroke-linecap="round"/><path d="M6.2 3 24 9 6.2 15.5z" fill="#f5c518" stroke="#14201c" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    aim: '<svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="11" fill="none" stroke="#14201c" stroke-width="5"/><path d="M22 4v36M4 22h36" stroke="#14201c" stroke-width="5" stroke-linecap="round"/><circle cx="22" cy="22" r="11" fill="none" stroke="#fff" stroke-width="2.4"/><path d="M22 4v36M4 22h36" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>',
    plan: '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="8" fill="none" stroke="#14201c" stroke-width="4"/><circle cx="11" cy="11" r="8" fill="none" stroke="#f5c518" stroke-width="2"/><circle cx="11" cy="11" r="2.2" fill="#f5c518" stroke="#14201c"/></svg>'
  };
  function marker(id, cls, html, opt) {
    if (!mk[id]) { mk[id] = new maplibregl.Marker(Object.assign({ element: el(cls, html) }, opt || {})); mk[id]._on = false; }
    return mk[id];
  }
  function place(m, ll) {
    if (!ll || !ok(ll)) { if (m._on) { m.remove(); m._on = false; } return; }
    m.setLngLat([ll[1], ll[0]]); if (!m._on) { m.addTo(map); m._on = true; }
  }
  const at = m => { const p = m.getLngLat(); return r6([p.lat, p.lng]); };
  function addOverlays() {
    const src = id => map.addSource(id, { type: 'geojson', data: fc([]) });
    ['sl-acc', 'sl-green', 'sl-path', 'sl-aim', 'sl-pat'].forEach(src);
    map.addLayer({ id: 'sl-acc', type: 'fill', source: 'sl-acc', paint: { 'fill-color': '#3987e5', 'fill-opacity': 0.16 } });
    map.addLayer({ id: 'sl-green-f', type: 'fill', source: 'sl-green', paint: { 'fill-color': '#7dffb5', 'fill-opacity': ['case', ['boolean', ['get', 'edit'], false], 0.28, 0.1] } });
    map.addLayer({ id: 'sl-green-l', type: 'line', source: 'sl-green', paint: { 'line-color': '#ffffff', 'line-width': ['case', ['boolean', ['get', 'edit'], false], 2.5, 1.6], 'line-opacity': 0.95 } });
    map.addLayer({ id: 'sl-path-c', type: 'line', source: 'sl-path', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#14201c', 'line-width': 5, 'line-opacity': 0.55 } });
    map.addLayer({ id: 'sl-path-l', type: 'line', source: 'sl-path', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 2.2 } });
    map.addLayer({ id: 'sl-aim-c', type: 'line', source: 'sl-aim', paint: { 'line-color': '#14201c', 'line-width': 4, 'line-opacity': 0.5 } });
    map.addLayer({ id: 'sl-aim-l', type: 'line', source: 'sl-aim', paint: { 'line-color': '#f5c518', 'line-width': 2, 'line-dasharray': [2, 1.6] } });
    map.addLayer({ id: 'sl-pat-f', type: 'fill', source: 'sl-pat', filter: ['==', ['get', 'k'], 2], paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.13 } });
    map.addLayer({ id: 'sl-pat-c', type: 'line', source: 'sl-pat', paint: { 'line-color': '#14201c', 'line-width': 4, 'line-opacity': 0.45 } });
    map.addLayer({ id: 'sl-pat-2', type: 'line', source: 'sl-pat', filter: ['==', ['get', 'k'], 2], paint: { 'line-color': '#ffffff', 'line-width': 1.6, 'line-dasharray': [2.5, 2] } });
    map.addLayer({ id: 'sl-pat-1', type: 'line', source: 'sl-pat', filter: ['==', ['get', 'k'], 1], paint: { 'line-color': '#ffffff', 'line-width': 2.2 } });
  }
  const setData = (id, feats) => { const s = map && map.getSource(id); if (s) s.setData(fc(feats)); };
  function drawMe() {
    if (!ready) return;
    const f = model && fresh() ? gps.fix : null;
    place(marker('me', 'mk-me', '<i></i>'), f && f.ll);
    setData('sl-acc', f && f.acc > 4 && f.acc < 150 ? [poly(ellipse(f.ll, 0, f.acc * YD, f.acc * YD, 40))] : []);
  }
  function drawAim(a) {
    if (!a || !ok(a.pt) || !ok(a.from)) { setData('sl-aim', []); setData('sl-pat', []); return; }
    const brg = bearing(a.from, a.pt);
    setData('sl-aim', [line([a.from, a.pt])]);
    setData('sl-pat', [poly(ellipse(a.pt, brg, a.sx * 2, a.sy * 2), { k: 2 }), poly(ellipse(a.pt, brg, a.sx, a.sy), { k: 1 })]);
  }
  function many(kind, n, make) {
    const L = lists[kind];
    while (L.length < n) L.push(make(L.length));
    L.forEach((m, i) => { if (i >= n && m._on) { m.remove(); m._on = false; } });
    return L;
  }
  function sync() {
    if (!ready || !model) return;
    const m = model, ed = m.mode === 'edit';
    setData('sl-green', m.green && m.green.length >= 3 ? [poly(m.green, { edit: ed })] : m.green && m.green.length === 2 ? [line(m.green, { edit: ed })] : []);
    // the ball's journey: a line through every known spot, broken where a spot is unknown
    const segs = []; let run = [];
    (m.path || []).forEach(p => { if (p && ok(p)) run.push(p); else { if (run.length > 1) segs.push(line(run)); run = []; } });
    if (run.length > 1) segs.push(line(run));
    setData('sl-path', segs);
    const dots = (m.dots || []).filter(x => x && ok(x[0]));               // numbered spots: where each shot finished
    const D = many('dot', dots.length, () => { const k = new maplibregl.Marker({ element: el('mk-dot', '') }); k._on = false; return k; });
    dots.forEach(([p, label], j) => { D[j].getElement().textContent = String(label); place(D[j], p); });
    const tee = marker('tee', 'mk-tee', ICON.tee, { draggable: true });
    tee.setDraggable(ed); place(tee, m.tee);
    if (!tee._w) { tee._w = 1; tee.on('dragend', () => H.teeMove && H.teeMove(at(tee))); }
    const flag = marker('flag', 'mk-flag', ICON.flag, { draggable: true, anchor: 'bottom', offset: [8, 2] });
    flag.setDraggable(!!m.flagDrag); place(flag, ed ? null : m.flag);
    if (!flag._w) { flag._w = 1; flag.on('dragend', () => H.flagMove && H.flagMove(at(flag))); }
    const ball = marker('ball', 'mk-ball', '<i></i>', { draggable: true });
    place(ball, ed ? null : m.ball);
    if (!ball._w) { ball._w = 1; ball.on('dragend', () => H.ballMove && H.ballMove(at(ball))); }
    place(marker('plan', 'mk-plan', ICON.plan), !ed && !m.aim ? m.planAim : null);
    const aim = marker('aim', 'mk-aim', ICON.aim, { draggable: true });
    place(aim, !ed && m.aim ? m.aim.pt : null);
    if (!aim._w) { aim._w = 1; aim.on('drag', () => model && model.aim && drawAim(Object.assign({}, model.aim, { pt: at(aim) }))); aim.on('dragend', () => H.aimMove && H.aimMove(at(aim))); }
    drawAim(ed ? null : m.aim);
    const vs = ed && m.green ? m.green : [];
    const V = many('vert', vs.length, i => {
      const k = new maplibregl.Marker({ element: el('mk-v', '<i></i>'), draggable: true }); k._on = false;
      k.on('drag', () => { if (!model || !model.green) return; const g = model.green.slice(); g[i] = at(k); setData('sl-green', g.length >= 3 ? [poly(g, { edit: true })] : []); });
      k.on('dragend', () => H.vertMove && H.vertMove(i, at(k)));
      return k;
    });
    vs.forEach((p, i) => place(V[i], p));
    drawMe();
    if (msgEl) { const t = PHOTO_MSG[photo.state] || ''; msgEl.textContent = t; msgEl.hidden = !t; }
    if (attrEl) { attrEl.hidden = photo.state !== 'ok'; attrEl.lastChild.textContent = (photo.credit || 'Esri') + '. Map drawn with MapLibre.'; }
    if (m.key !== lastKey) { lastKey = m.key; view(m.fit || 'hole', true); }
  }
  /** Frame a set of points with a given direction pointing up the screen. */
  function frame(pts, brg, pad, maxZ) {
    pts = pts.filter(p => p && ok(p)); if (!map || !pts.length) return;
    const o = pts[0], th = brg * rad, co = Math.cos(th), si = Math.sin(th);
    const rot = pts.map(p => { const v = toXY(o, p); return [v[0] * co - v[1] * si, v[0] * si + v[1] * co]; });     // x across the screen, y up it
    const xs = rot.map(p => p[0]), ys = rot.map(p => p[1]);
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const box = host.getBoundingClientRect(), W = Math.max(120, box.width), Hh = Math.max(120, box.height);
    const P = Object.assign({ t: 38, b: 44, l: 34, r: 70 }, pad || {});
    const ydPerPx = Math.max((x1 - x0) / Math.max(40, W - P.l - P.r), (y1 - y0) / Math.max(40, Hh - P.t - P.b), 0.02);
    x0 -= P.l * ydPerPx; x1 += P.r * ydPerPx; y0 -= P.b * ydPerPx; y1 += P.t * ydPerPx;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, c = toLL(o, [cx * co + cy * si, -cx * si + cy * co]);
    const zoom = Math.log2(78271.517 * Math.cos(c[0] * rad) / (ydPerPx / YD));
    map.jumpTo({ center: [c[1], c[0]], zoom: Math.min(zoom, maxZ || 20.5), bearing: brg });
  }
  function view(kind, quiet) {
    if (!ready || !model) return;
    const m = model, g = m.green && m.green.length >= 3 ? m.green : null, c = g ? centroid(g) : null, me = fresh() ? gps.fix.ll : null;
    if (m.mode === 'edit') {
      if (kind === 'me') { if (me) map.jumpTo({ center: [me[1], me[0]], zoom: Math.max(map.getZoom(), 17.5) }); return; }
      const pts = [m.tee].concat(m.green || []).filter(p => p && ok(p));
      if (pts.length >= 2) frame(pts, 0, { t: 44, b: 50, l: 44, r: 84 }, 19.5);
      else { const p = pts[0] || m.center; if (p && ok(p)) map.jumpTo({ center: [p[1], p[0]], zoom: pts[0] ? 18 : m.centerZoom || 16.3, bearing: 0 }); }
      return;
    }
    if (!g) { const p = m.tee || m.center; if (p && ok(p)) map.jumpTo({ center: [p[1], p[0]], zoom: 17, bearing: 0 }); return; }
    const near = me && dist(me, c) < 900 ? me : null;
    if (kind === 'green') { const from = near || m.from || m.tee || c; frame(g, from === c ? 0 : bearing(from, c), { t: 50, b: 60, l: 50, r: 84 }, 21); return; }
    if (kind === 'me' && !near) { if (!quiet && H.note) H.note(me ? 'You are too far from this hole to show on its map.' : 'No GPS position yet.'); return; }
    const from = kind === 'me' ? near : kind === 'shot' ? (m.from || m.tee) : (m.tee || m.from);
    if (!from) { frame(g, 0, null, 20); return; }
    const pts = kind === 'hole' ? [m.tee, m.from].concat(m.path || [], g, [m.ball]) : [from].concat(g, [m.ball, m.aim && m.aim.pt]);
    frame(pts, bearing(from, c), null, 20);
  }
  async function make() {
    if (map || making || !window.maplibregl) return;
    making = true;
    let c = (model && (model.center || model.tee || (model.green && model.green[0]))) || null;
    if (!c || !ok(c)) { try { c = JSON.parse(localStorage.getItem(LK) || 'null'); } catch (e) { c = null; } }
    if (!c || !ok(c)) c = fresh() ? gps.fix.ll : [18.43733, -69.99003];
    const style = await loadStyle(c);
    try {
      map = new maplibregl.Map({ container: host, style, center: [c[1], c[0]], zoom: 16, attributionControl: false, maxZoom: Math.min(21.5, photo.max + 2.6), minZoom: 3,
        maxPitch: 0, pitchWithRotate: false, touchPitch: false, dragRotate: false, fadeDuration: 0, clickTolerance: 6 });
    } catch (e) { making = false; host.innerHTML = '<p class="mapfail">The map could not start on this device. Shots can still be entered by hand.</p>'; return; }
    map.touchZoomRotate.enable(); map.touchZoomRotate.disableRotation(); map.doubleClickZoom.disable(); map.keyboard.disable();       // two fingers zoom; quick taps never zoom or turn the photo
    const start = () => { if (ready) return; try { addOverlays(); } catch (e) { return; } ready = true; making = false; lastKey = null; sync(); };
    map.once('style.load', start); map.once('load', start);
    map.on('click', e => { if (H.tap) H.tap(r6([e.lngLat.lat, e.lngLat.lng])); });
    map.on('moveend', () => { const k = map.getCenter(); lastCenter = r6([k.lat, k.lng]); try { localStorage.setItem(LK, JSON.stringify(lastCenter)); } catch (e) { /* ignore */ } });
    map.on('error', () => { /* a tile that fails to load is not worth stopping for */ });
  }
  /** Put the map in a slot of the page and draw the model. Called after every render; the map itself is built once and moved. */
  function show(slot, m, handlers) {
    model = m; H = handlers || {};
    if (!host) {
      host = document.createElement('div'); host.className = 'maphost';
      msgEl = document.createElement('div'); msgEl.className = 'mapmsg'; msgEl.hidden = true;
      // Credit for the photo: always on screen, with the full list of sources one tap away.
      attrEl = document.createElement('div'); attrEl.className = 'mapattr'; attrEl.hidden = true;
      attrEl.innerHTML = '<button type="button" aria-expanded="false">Powered by Esri <i>i</i></button><p hidden></p>';
      attrEl.firstChild.addEventListener('click', () => { const p = attrEl.lastChild; p.hidden = !p.hidden; attrEl.firstChild.setAttribute('aria-expanded', String(!p.hidden)); });
    }
    if (host.parentNode !== slot) { slot.appendChild(host); slot.appendChild(msgEl); slot.appendChild(attrEl); if (map) map.resize(); }
    if (!window.maplibregl) { host.innerHTML = '<p class="mapfail">The map could not load. Check the connection and open the app again. Shots can still be entered by hand.</p>'; return; }
    if (!map) make(); else sync();
    if (gps.want) gpsRun();
  }
  /** The page no longer shows a map: stop the GPS so it does not drain the battery. */
  function hide() { model = null; if (host && host.parentNode) { host.parentNode.removeChild(host); [msgEl, attrEl].forEach(x => x.parentNode && x.parentNode.removeChild(x)); } gpsPause(); }

  return { YD, r6, ok, okPoly, dist, bearing, dest, centroid, inPoly, ringSort, fcb, ellipse, circle, bestAim, toXY, toLL,
    gps, fresh, locate, gpsSet, onGps: f => { subs.add(f); return () => subs.delete(f); }, show, hide, view, photo, hasKey: () => !!String(CFG().esriKey || '').trim(), lib: () => !!window.maplibregl,
    mapCenter: () => lastCenter, redraw: sync, _map: () => map, _ready: () => ready };
})();
