(() => {
'use strict';
const E = SGE;
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const clone = x => JSON.parse(JSON.stringify(x));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = (x, d = 2) => (x == null || isNaN(x)) ? '–' : (x > 0.0049 ? '+' : x < -0.0049 ? '−' : '') + Math.abs(x).toFixed(d);
const num = (x, d = 1) => (x == null || isNaN(x)) ? '–' : (+x).toFixed(d);
const dist = d => Number.isInteger(+d) ? String(+d) : (+d).toFixed(1);
const pf = v => parseFloat(String(v).replace(',', '.'));
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const TABS = [['rounds','Rounds'],['stats','Stats'],['best','Top 10'],['courses','Courses'],['aim','Aim'],['expect','Expect'],['guide','Guide']];
const VIEWS = ['rounds','stats','best','courses','aim','expect','guide','setup'];
const MISS = [['L','Left'],['R','Right'],['S','Short'],['O','Long']];
const ZT = { fwy:'Fairway / fringe', rgh:'Rough', rec:'Trees', snd:'Bunker', pen:'Water', ob:'Out of bounds' };
const CATS = [['ott','Off the tee'],['app','Approach'],['arg','Around green'],['putt','Putting'],['tot','Total']];
const T5 = o => ['Bogey or worse on a par 5','Double bogey or worse','Three-putt',`Bogey or worse with ${o.wedgeYards} yds or less in`,'Missed easy up-and-down'];
// Every club that can be put in the bag from Setup. Distances are starting points for a mid-handicap golfer and are meant to be replaced.
const CLUBS = [['D','Driver',230,250],['3W','3-wood',210,225],['5W','5-wood',195,205],['7W','7-wood',185,194],['9W','9-wood',175,183],['4H','4-hybrid',185,195],['5H','5-hybrid',175,184],['6H','6-hybrid',165,173],
  ['2i','2-iron',195,207],['3i','3-iron',185,195],['4i','4-iron',178,187],['5i','5-iron',170,178],['6i','6-iron',160,167],['7i','7-iron',150,156],['8i','8-iron',140,145],['9i','9-iron',130,134],
  ['PW','PW',118,121],['GW','GW',105,107],['SW','SW',90,91],['LW','LW',75,76],['P','Putter',0,0]]
  .map(([id, name, carry, total]) => ({ id, name, carry, total, lat: Math.round(carry * 0.085), depth: Math.round(carry * 0.07) }));
const DEF_BAG = ['D','3W','5W','4H','5i','6i','7i','8i','9i','PW','GW','SW','LW','P'].map(id => CLUBS.find(c => c.id === id));   // the bag a new user starts with
const BK = Object.keys(E.BASES), HK = BK.filter(b => b !== 'tour');
const HL = { tour:'Tour', scratch:'Scratch', h5:'5 hcp', h10:'10 hcp', h15:'15 hcp', h20:'20 hcp' }, HS = { scratch:'Scr', h5:'5', h10:'10', h15:'15', h20:'20' };

/* ---------- state ---------- */
const LS = 'strokeLedger.v1';
let practice = null;            // while practice mode is on: a snapshot of the real data, and nothing is saved
const held = {};                // account updates that arrive during practice mode, applied when it ends
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const defSettings = () => ({ baseline:'h10', argYards:50, wedgeYards:150, bag: DEF_BAG.map(c => ({ ...c })), updatedAt:0 });
const S = {
  settings: defSettings(), courses: { list:[], updatedAt:0 }, rounds: {}, dirty: { s:false, c:false, r:{} }, tomb: {},
  sync: { state:'starting', err:null },
  ui: { view:'rounds', roundId:null, hole:0, pad:null, editShot:null, confirm:null, nr:{}, statCourse:'all', statRange:'10', trend:'tot',
    courseId:null, openHole:null, editCard:false, aimMode:'tee', aimCourse:'', aimHole:'',
    tee:{ len:400, fw:30, l1:8, lType:'rec', r1:8, rType:'rec', clubs:null },
    ap:{ dist:150, lie:'fwy', club:'', gw:25, gd:30, px:12, py:15, left:'rgh', right:'rgh', short:'fwy', long:'rgh' },
    calc:{ l0:'fwy', d0:150, l1:'grn', d1:25, holed:false, pen:0 }, expLie:'fwy', backup:'', aim:null, mapEd:null }
};
function normSettings(s) {
  const d = defSettings(); s = Object.assign(d, s || {});
  if (!Array.isArray(s.bag) || !s.bag.length) s.bag = d.bag;
  if (!E.BASES[s.baseline]) s.baseline = 'h10';
  s.argYards = +s.argYards || 50; s.wedgeYards = +s.wedgeYards || 150;
  return s;
}
function normCourses(c) {
  c = c && Array.isArray(c.list) ? c : { list:[], updatedAt:0 };
  c.list.forEach(k => { k.tees = k.tees || []; k.holes = k.holes || []; k.holes.forEach(h => { h.plan = Object.assign({ club:'', aim:'', avoid:'', notes:'' }, h.plan || {}); }); });
  return c;
}
function loadLocal() {
  let j = null, seeded = false;
  try { j = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { /* storage unavailable: run from memory */ }
  if (!j) { try { const el = document.getElementById('seed'); if (el) { j = JSON.parse(el.textContent); seeded = !!j; } } catch (e) { j = null; } }   // first run of the PC app
  try {
    if (j) { S.settings = normSettings(j.settings); S.courses = normCourses(j.courses); S.rounds = j.rounds || {}; Object.values(S.rounds).forEach(normRound); S.dirty = Object.assign({ s:false, c:false, r:{} }, j.dirty || {}); S.tomb = j.tomb || {}; }
  } catch (e) { /* unreadable data: start empty */ }
  if (seeded) saveLocal();
  mergeGeo();
}
function saveLocal() {
  if (practice) return;
  try { localStorage.setItem(LS, JSON.stringify({ settings:S.settings, courses:S.courses, rounds:S.rounds, dirty:S.dirty, tomb:S.tomb })); } catch (e) { /* ignore */ }
}

/* ---------- account sync (db capability), with this device as the working copy ---------- */
let cloud = null; const timers = {}, wq = {};
const later = (k, fn, ms) => { clearTimeout(timers[k]); timers[k] = setTimeout(fn, ms); };
function touchSettings() { S.settings.updatedAt = Date.now(); if (practice) return; S.dirty.s = true; saveLocal(); later('s', pushSettings, 900); syncUi(); }
function touchCourses() { S.courses.updatedAt = Date.now(); if (practice) return; S.dirty.c = true; saveLocal(); later('c', pushCourses, 900); syncUi(); }
function touchRound(id) { const r = S.rounds[id]; if (!r) return; r.updatedAt = Date.now(); if (practice) return; S.dirty.r[id] = true; saveLocal(); later('r:' + id, () => pushRound(id), 900); syncUi(); }
function pushSettings() { if (!practice && cloud && S.dirty.s) enqueue('s', cloud.settings, clone(S.settings)); }
function pushCourses() { if (!practice && cloud && S.dirty.c) enqueue('c', cloud.courses, clone(S.courses)); }
function pushRound(id) { if (!practice && cloud && S.dirty.r[id] && S.rounds[id]) enqueue('r:' + id, cloud.rounds.doc(id), clone(S.rounds[id])); }
function removeRound(id) {
  if (practice) { delete S.rounds[id]; return; }
  delete S.rounds[id]; delete S.dirty.r[id]; clearTimeout(timers['r:' + id]); S.tomb[id] = Date.now(); saveLocal();
  if (cloud) enqueue('r:' + id, cloud.rounds.doc(id), null);
}
function enqueue(key, ref, data) { const q = wq[key] || (wq[key] = { fail:0 }); q.ref = ref; q.next = { data, at: data ? data.updatedAt : 0 }; pump(key); syncUi(); }
let active = 0; const waiting = [];
async function pump(key) {
  const q = wq[key]; if (!q || q.busy || !q.next) return;
  if (active >= 4) { if (!waiting.includes(key)) waiting.push(key); return; }
  q.busy = true; active++; const job = q.next; q.next = null;
  let retry = 0;
  try {
    if (job.data === null) await q.ref.delete(); else await q.ref.set(job.data);
    q.fail = 0;
    if (key === 's') { if (S.settings.updatedAt === job.at) S.dirty.s = false; }
    else if (key === 'c') { if (S.courses.updatedAt === job.at) S.dirty.c = false; }
    else { const id = key.slice(2); if (job.data === null) delete S.tomb[id]; else if (S.rounds[id] && S.rounds[id].updatedAt === job.at) delete S.dirty.r[id]; }
    saveLocal();
  } catch (e) {
    const code = e && e.code;
    if (['invalid_argument','quota_exceeded','revoked','not_granted','capability_disabled','capability_removed','transform_error'].includes(code)) S.sync.err = code;
    else { q.fail++; if (!q.next) q.next = job; retry = Math.min(60000, 3000 * q.fail); }
  }
  active--;
  if (retry) setTimeout(() => { q.busy = false; pump(key); }, retry); else { q.busy = false; if (q.next) pump(key); }
  const nxt = waiting.shift(); if (nxt) pump(nxt);
  syncUi();
}
const idle = key => !wq[key] || (!wq[key].busy && !wq[key].next);
function mergeDoc(kind, snap) {
  if (practice) { held[kind] = snap; return; }
  if (snap.metadata && snap.metadata.hasPendingWrites) return;
  const key = kind === 's' ? 'settings' : 'courses', push = kind === 's' ? pushSettings : pushCourses;
  if (!snap.exists) { if (!snap.metadata.fromCache && S.dirty[kind] && idle(kind)) push(); return; }
  const remote = snap.data(), local = S[key];
  if (S.dirty[kind] && (local.updatedAt || 0) > (remote.updatedAt || 0)) { if (idle(kind)) push(); return; }
  if ((remote.updatedAt || 0) === (local.updatedAt || 0)) { if (S.dirty[kind]) { S.dirty[kind] = false; saveLocal(); } return; }
  S[key] = kind === 's' ? normSettings(clone(remote)) : normCourses(clone(remote));
  S.dirty[kind] = false; saveLocal(); render();
}
function mergeRounds(snap) {
  if (practice) { held.r = snap; return; }
  let changed = false; const ids = {};
  snap.docs.forEach(d => {
    const id = d.id; ids[id] = 1;
    if (S.tomb[id]) { if (idle('r:' + id)) enqueue('r:' + id, cloud.rounds.doc(id), null); return; }
    if (d.metadata && d.metadata.hasPendingWrites) return;
    const remote = d.data(), local = S.rounds[id];
    if (local && S.dirty.r[id] && (local.updatedAt || 0) > (remote.updatedAt || 0)) { if (idle('r:' + id)) pushRound(id); return; }
    if (!local || (local.updatedAt || 0) !== (remote.updatedAt || 0)) { S.rounds[id] = normRound(clone(remote)); S.rounds[id].id = id; changed = true; }
    if (S.dirty.r[id]) { delete S.dirty.r[id]; changed = true; }
  });
  if (!snap.metadata.fromCache) {
    Object.keys(S.rounds).forEach(id => {
      if (ids[id]) return;
      if (S.dirty.r[id]) { if (idle('r:' + id)) pushRound(id); }
      else { delete S.rounds[id]; changed = true; if (S.ui.roundId === id) S.ui.roundId = null; }
    });
    Object.keys(S.tomb).forEach(id => { if (!ids[id] && idle('r:' + id)) delete S.tomb[id]; });
  }
  if (changed) { saveLocal(); render(); }
}
async function initCloud() {
  let db = null, user = null, id = null;
  try {
    if (window.claude && typeof window.claude.use === 'function') [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    id = user ? await user.id() : null;
  } catch (e) { /* no account storage in this view */ }
  if (!db || !id) { S.sync.state = 'local'; render(); return; }
  try {
    const me = db.collection('data/users/' + id);
    cloud = { settings: me.doc('settings'), courses: me.doc('courses'), rounds: me.doc('ledger').collection('rounds') };
  } catch (e) { cloud = null; S.sync.state = 'local'; syncUi(); return; }
  S.sync.state = 'loading'; syncUi();
  const seen = {}; let got = 0;
  const slow = setTimeout(() => { if (S.sync.state === 'loading') { S.sync.state = 'slow'; syncUi(); } }, 10000);
  const first = (k, snap) => { if (!seen[k] && !snap.metadata.fromCache) { seen[k] = 1; if (++got === 3) { clearTimeout(slow); S.sync.state = 'cloud'; render(); } } };
  const fail = e => { clearTimeout(slow); S.sync.state = 'error'; S.sync.err = e && e.code; syncUi(); };
  cloud.settings.onSnapshot(s => { mergeDoc('s', s); first('s', s); }, fail);
  cloud.courses.onSnapshot(s => { mergeDoc('c', s); first('c', s); }, fail);
  cloud.rounds.onSnapshot(s => { mergeRounds(s); first('r', s); }, fail);
}
function syncUi() {
  const el = $('#sync'), tx = $('#syncText'); if (!el) return;
  if (practice) { el.className = 'sync busy'; tx.textContent = 'Practice mode'; return; }
  const pending = S.dirty.s || S.dirty.c || Object.keys(S.dirty.r).length || Object.keys(wq).some(k => !idle(k));
  let cls = '', t = '';
  const st = S.sync.state;
  if (st === 'local') t = 'Saved on this device';
  else if (st === 'starting' || st === 'loading') { t = 'Loading your data'; cls = 'busy'; }
  else if (st === 'slow') { t = "Can't reach your account yet. Showing this device's copy."; cls = 'bad'; }
  else if (st === 'error' || S.sync.err) { t = 'Sync stopped. Changes stay on this device.'; cls = 'bad'; }
  else if (pending) { t = 'Saving'; cls = 'busy'; }
  else { t = 'Synced to your account'; cls = 'ok'; }
  el.className = 'sync ' + cls; tx.textContent = t;
}

/* ---------- helpers ---------- */
const base = () => S.settings.baseline;
const opts = () => ({ argYards: +S.settings.argYards || 50, wedgeYards: +S.settings.wedgeYards || 150 });
const courseById = id => S.courses.list.find(c => c.id === id);
const club = id => S.settings.bag.find(b => b.id === id);
const clubName = id => { const c = club(id) || CLUBS.find(x => x.id === id); return c ? c.name : (id || ''); };   // a club taken out of the bag keeps its name on old shots
const putterId = () => { const p = S.settings.bag.find(b => /putt/i.test(b.name)); return p ? p.id : ''; };
const allRounds = () => Object.values(S.rounds).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0));
const hasPlay = r => (r.holes || []).some(h => h.done || h.card || (h.shots && h.shots.length));
const statRounds = () => { const all = allRounds(), real = all.filter(r => !r.example && hasPlay(r)); return real.length ? real : all; };
const roundName = r => (r.segs || []).map(s => s.name).filter((n, i, a) => a.indexOf(n) === i).join(' / ') || 'Round';
function dateLabel(d) { const p = String(d || '').split('-'); if (p.length < 3) return d || ''; const y = +p[0]; return `${MON[+p[1] - 1]} ${+p[2]}${y !== new Date().getFullYear() ? ', ' + y : ''}`; }
const toPar = n => n === 0 ? 'E' : (n > 0 ? '+' : '−') + Math.abs(n);
const scoreName = n => ({ '-3':'Albatross', '-2':'Eagle', '-1':'Birdie', '0':'Par', '1':'Bogey', '2':'Double bogey', '3':'Triple bogey' }[n] || (n > 0 ? `+${n}` : `−${-n}`));
const sgChip = (v, d = 2) => v == null ? '<span class="sgc pend">…</span>' : `<span class="sgc ${v > 0.0049 ? 'gain' : v < -0.0049 ? 'loss' : ''}">${fmt(v, d)}</span>`;
const opt = (v, label, cur) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(label)}</option>`;
const seg = (act, cur, items, attrs = '') => `<span class="seg">${items.map(([v, l]) => `<button type="button" data-act="${act}" data-v="${esc(v)}" ${attrs} aria-pressed="${String(v) === String(cur)}">${esc(l)}</button>`).join('')}</span>`;
const lieChips = (act, cur, attrs = '', only = null) => (only || Object.keys(E.LIES)).map(l => `<button type="button" class="chip" data-act="${act}" data-v="${l}" ${attrs} aria-pressed="${l === cur}"><span class="liedot z-${l}"></span>${E.LIES[l]}</button>`).join('');
const clubChips = (act, cur, attrs = '') => S.settings.bag.map(c => `<button type="button" class="chip" data-act="${act}" data-v="${esc(c.id)}" ${attrs} aria-pressed="${c.id === cur}">${esc(c.name)}</button>`).join('');
const missChips = (act, cur, attrs = '') => MISS.map(([v, l]) => `<button type="button" class="chip" data-act="${act}" data-v="${v}" ${attrs} aria-pressed="${(cur || '').includes(v)}">${l}</button>`).join('');
const missText = m => MISS.filter(([v]) => (m || '').includes(v)).map(x => x[1].toLowerCase()).join(' ');
const toggleMiss = (m, v) => { m = m || ''; if (m.includes(v)) return m.replace(v, ''); const opp = { L:'R', R:'L', S:'O', O:'S' }[v]; return m.replace(opp, '') + v; };
function tbl(head, rows) { return `<div class="twrap"><table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }
function sgBars(sg, scale, unit) {
  const val = k => sg[k] * scale, mx = Math.max(1, ...CATS.map(c => Math.abs(val(c[0]))));
  return `<div class="bars" role="img" aria-label="Strokes gained by part of the game">` + CATS.map(([k, l]) => {
    const v = val(k), w = Math.min(100, Math.abs(v) / mx * 100).toFixed(1);
    return `<div class="bar-row${k === 'tot' ? ' tot' : ''}" title="${l}: ${fmt(v)} ${unit}"><span>${l}</span><span class="bt"><span class="bneg">${v < 0 ? `<i style="width:${w}%"></i>` : ''}</span><span class="bpos">${v > 0 ? `<i style="width:${w}%"></i>` : ''}</span></span><span class="bv num">${fmt(v)}</span></div>`;
  }).join('') + `</div>`;
}

/* ---------- Rounds ---------- */
function vRounds() { const r = S.ui.roundId && S.rounds[S.ui.roundId]; return r ? (isCardRound(r) ? vCardRound(r) : vRound(r)) : vRoundList(); }
function vRoundList() {
  const cs = S.courses.list, rs = allRounds().reverse(), nr = S.ui.nr;
  let h = '';
  if (IOS && !STANDALONE && !hintSeen()) h += `<div class="note maphint"><span><b>Put this app on your Home Screen.</b> In Safari, tap the Share button, then Add to Home Screen. Do it before you set up your bag or enter rounds: the Home Screen app keeps its own data.</span><button type="button" class="btn ghost sm" data-act="hintOff">Got it</button></div>`;
  else h += bagNudge();
  h += backupNag();
  if (!cs.length) {
    h += `<section class="card"><h2 class="h2">New round</h2><p class="empty">${S.sync.state === 'loading' || S.sync.state === 'starting' ? 'Loading your courses.' : 'Add a course first. Each course needs a par and a yardage for every hole.'}</p><div class="btnrow"><button class="btn" data-act="go" data-view="courses">Go to Courses</button></div></section>`;
  } else {
    if (!nr.date) nr.date = today();
    if (!courseById(nr.c1)) nr.c1 = cs[0].id;
    const c1 = courseById(nr.c1); if (!c1.tees.some(t => t.name === nr.t1)) nr.t1 = c1.defaultTee || (c1.tees[0] || {}).name || '';
    const c2 = courseById(nr.c2); if (!c2) nr.c2 = ''; else if (!c2.tees.some(t => t.name === nr.t2)) nr.t2 = c2.defaultTee || (c2.tees[0] || {}).name || '';
    h += `<form class="card" data-sub="newRound"><h2 class="h2">New round</h2><div class="frow">
      <label class="f">Date<input type="date" id="nr-date" data-ch="nr" data-k="date" value="${esc(nr.date)}"></label>
      <label class="f">First nine<select id="nr-c1" data-ch="nr" data-k="c1">${cs.map(c => opt(c.id, `${c.name} (${c.holes.length})`, nr.c1)).join('')}</select></label>
      <label class="f">Tees<select id="nr-t1" data-ch="nr" data-k="t1">${c1.tees.map(t => opt(t.name, t.name, nr.t1)).join('')}</select></label>
      <label class="f">Second nine<select id="nr-c2" data-ch="nr" data-k="c2">${opt('', 'None', nr.c2)}${cs.map(c => opt(c.id, `${c.name} (${c.holes.length})`, nr.c2)).join('')}</select></label>
      ${c2 ? `<label class="f">Tees<select id="nr-t2" data-ch="nr" data-k="t2">${c2.tees.map(t => opt(t.name, t.name, nr.t2)).join('')}</select></label>` : ''}
    </div><div class="btnrow"><button class="btn flag" type="submit">Start round</button></div></form>`;
  }
  h += `<div class="btnrow"><h2 class="h2">Rounds</h2><span class="grow"></span><button class="btn ghost sm" data-act="go" data-view="setup">${CARD ? 'Import scorecards' : 'Import from TheGrint'}</button></div>`;
  if (!rs.length) h += `<p class="empty">No rounds yet. Start one above, then log each shot: the club, where the ball finished and how far it has left.</p>`;
  else h += `<div class="rlist">` + rs.map(r => {
    const a = E.analyzeRound(r, base(), opts());
    return `<button class="rcard" data-act="openRound" data-id="${esc(r.id)}">
      <span class="rc-date">${dateLabel(r.date)}</span>
      <span class="rc-name">${esc(roundName(r))}${r.example ? ' <em class="tag">Example</em>' : ''}${isCardRound(r) ? ` <em class="tag alt">${r.src === 'card' ? 'Scorecard' : 'TheGrint'}</em>` : ''}<small>${a.done ? `${toPar(a.score - a.par)} through ${a.done} hole${a.done > 1 ? 's' : ''}` : 'Not started'}</small></span>
      <span class="rc-score num">${a.done ? a.score : '–'}</span>${sgChip(a.done && a.all.n ? a.all.sg : null)}</button>`;
  }).join('') + `</div><p class="sub">The chip on each round is total strokes gained against the ${esc(E.BASES[base()])} benchmark.</p>`;
  return h;
}
const startPos = h => (h.next && h.next.d > 0) ? h.next : { lie:'tee', d:+h.yards || 0 };
const posText = (lie, d) => `${E.LIES[lie]} ${dist(d)} ${lie === 'grn' ? 'ft' : 'yd'}`;
const FROM = { tee:'the tee', fwy:'the fairway', rgh:'the rough', snd:'the sand', rec:'a recovery spot', grn:'the green' };
function normRound(r) {            // older saves kept the ball's current spot as an unfinished last shot
  (r.holes || []).forEach(h => { h.shots = h.shots || []; if (!h.done && h.shots.length && !h.next) { const s = h.shots.pop(); h.next = backTo(s); } });
  return r;
}
/** The club the shot pad starts on. On the green, the putter. From the tee, the hole plan's club, else the longest club on a par 4 or 5.
    Inside the around-the-green distance, the club used most often from there before. Otherwise the club whose carry is nearest the distance. */
function suggestClub(h, st, d0) {
  const put = putterId();
  if (st.lie === 'grn') return put;
  if (st.lie === 'rec') return '';                       // a recovery shot is anyone's guess
  const full = S.settings.bag.filter(k => +k.carry > 0 && k.id !== put); if (!full.length) return '';
  const x = holeDef(h), plan = (x && x.plan) || {}, first = !h.shots.length, reach = k => +k.total || +k.carry;
  if (first && plan.club && full.some(k => k.id === plan.club)) return plan.club;
  if (first && h.par >= 4) return full.slice().sort((p, q) => reach(q) - reach(p))[0].id;
  const d = first && pf(d0) > 0 ? pf(d0) : +st.d; if (!(d > 0)) return '';
  const arg = opts().argYards;
  if (!first && d <= arg) {
    const n = {};
    Object.values(S.rounds).forEach(r => { if (!r.example) (r.holes || []).forEach(z => (z.shots || []).forEach(s => { if (s.c && s.lie !== 'grn' && s.lie !== 'tee' && +s.d <= arg && full.some(k => k.id === s.c)) n[s.c] = (n[s.c] || 0) + 1; })); });
    const top = Object.keys(n).sort((a, b) => n[b] - n[a])[0];
    return top || full.slice().sort((p, q) => +p.carry - +q.carry)[0].id;
  }
  const pool = first ? full : full.filter(k => k.id !== 'D' && !/driver/i.test(k.name));
  return (pool.length ? pool : full).slice().sort((p, q) => Math.abs(+p.carry - d) - Math.abs(+q.carry - d))[0].id;
}
function padFor(r, hi) {
  const h = r.holes[hi], n = h.shots.length, key = `${r.id}:${hi}:${n}`;
  if (S.ui.pad && S.ui.pad.key === key) return S.ui.pad;
  const st = startPos(h);
  const lie = st.lie === 'grn' ? 'grn' : (st.lie === 'tee' && h.par >= 4) ? 'fwy' : st.d <= 260 ? 'grn' : 'fwy';
  const c = suggestClub(h, st, st.d);
  return (S.ui.pad = { key, lie, d:'', d0:String(st.d || ''), c, cAuto: !!c, m:'', p:0, err:'' });
}
/** A par 3 whose yardage changed (tee or flag moved): pick the club again, unless the golfer already chose one. */
function resuggest(h, p) { if (p && p.cAuto && !h.shots.length) { p.c = suggestClub(h, startPos(h), p.d0); p.cAuto = !!p.c; } }
/** Where the aim was, if the aim tool is on for this shot: kept with the shot so the GPS can later measure how far off line it finished. */
function aimNow(h) { const r = curRound(), geo = h && geoOf(holeDef(h)); if (!r || !geo || curHole() !== h) return null; const a = aimState(r, S.ui.hole, geo); return a && SLMap.ok(a.pt) ? SLMap.r6(a.pt) : null; }
function mkShot(h, p) {
  const st = startPos(h), d0 = h.shots.length ? st.d : (pf(p.d0) > 0 ? pf(p.d0) : st.d);
  const s = { lie:st.lie, d:d0, c:p.c || '' };
  const g0 = h.shots.length ? st.g : h.tg; if (g0) s.g = g0;
  if (p.m) s.m = p.m;
  if (p.p) s.p = p.p;
  if (st.lie !== 'grn') { const a = aimNow(h); if (a) s.a = a; }
  return s;
}
/** Take the last shot off a hole. Putts logged by "2 putts" or "3 putts" with no length come off together with the putt that
    started them, so the ball goes back to a spot whose distance is known. */
function popShot(h) { let s = h.shots.pop(); while (s && s.u && h.shots.length) s = h.shots.pop(); return s; }
const spotText = x => x.u ? 'Green, length not logged' : posText(x.lie, x.d);
const unloggedAfter = (h, i) => { let k = 0; for (let j = i + 1; h.shots[j] && h.shots[j].u; j++) k++; return k; };
function vRound(r) {
  const o = opts(), a = E.analyzeRound(r, base(), o);
  const hi = S.ui.hole = Math.max(0, Math.min(S.ui.hole | 0, r.holes.length - 1));
  const h = r.holes[hi], ha = a.holes[hi], n = h.shots.length;
  const course = courseById(h.cid), plan = course && course.holes[h.n - 1] ? course.holes[h.n - 1].plan : null;
  const anySg = a.holes.some(x => x.shots.some(s => s.sg != null));
  let out = `<div class="rhead"><button class="btn ghost sm" data-act="closeRound">‹ Rounds</button>
    <div class="rtitle"><b>${esc(roundName(r))}</b><span>${dateLabel(r.date)}${r.example ? ' · <em class="tag">Example</em>' : ''}</span></div>
    <div class="rsum"><span class="big num">${a.done ? a.score : '–'}</span><span class="sub">${a.done ? `${toPar(a.score - a.par)} thru ${a.done}` : 'no holes yet'}</span>${sgChip(anySg ? a.live.tot : null)}</div></div>`;
  out += `<div class="strip" style="grid-template-columns:repeat(${Math.min(9, r.holes.length)},1fr)">` + r.holes.map((x, i) => {
    const xa = a.holes[i]; let cls = 'hb';
    if (i === hi) cls += ' cur';
    if (xa.done) { const dl = xa.score - x.par; cls += dl <= -2 ? ' s-2' : dl === -1 ? ' s-1' : dl === 0 ? '' : dl === 1 ? ' s1' : ' s2'; } else if (x.shots.length) cls += ' part';
    return `<button class="${cls}" data-act="hole" data-i="${i}" aria-label="Hole ${i + 1}${xa.done ? ', score ' + xa.score : ''}"><i>${i + 1}</i><b class="num">${xa.done ? xa.score : x.shots.length ? '·' : ''}</b></button>`;
  }).join('') + `</div>`;
  out += `<section class="card"><div class="holehead"><h2>Hole ${hi + 1}</h2><span class="meta">Par ${h.par} · ${h.yards} yds</span>
    <span class="nav"><button class="btn ghost sm" data-act="hole" data-i="${hi - 1}" ${hi ? '' : 'disabled'} aria-label="Previous hole">‹</button><button class="btn ghost sm" data-act="hole" data-i="${hi + 1}" ${hi < r.holes.length - 1 ? '' : 'disabled'} aria-label="Next hole">›</button></span></div>`;
  if (plan && (plan.club || plan.aim || plan.avoid)) out += `<p class="plan"><b>Plan:</b> ${[plan.club && esc(clubName(plan.club)), plan.aim && esc(plan.aim), plan.avoid && 'avoid ' + esc(plan.avoid)].filter(Boolean).join(' · ')}</p>`;
  out += mapPanel(r, hi);
  let list = '';
  if (n) list = `<ul class="shots">` + h.shots.map((s, i) => {
    const x = ha.shots[i], ed = S.ui.editShot === i, nx = h.shots[i + 1] || (!h.done && h.next) || null, holed = !nx && h.done, more = unloggedAfter(h, i);
    const bits = [hitText(h, i), s.m && 'missed ' + missText(s.m), s.p && `+${s.p} penalty`, more && `strokes gained includes the next ${more > 1 ? more + ' putts' : 'putt'}`, s.u && 'counted in the putt before'].filter(Boolean).join(' · ');
    let row = `<li class="shot"><button class="shot-main" data-act="editShot" data-i="${i}" aria-expanded="${ed}"><span class="sn num">${i + 1}</span><span class="liedot ${nx ? 'z-' + nx.lie : 'z-hole'}"></span>
      <span class="sl"><b>${s.c ? esc(clubName(s.c)) : 'Shot ' + (i + 1)}</b><span>${spotText(s)} → ${nx ? spotText(nx) : holed ? 'holed' : '…'}</span>${bits ? `<small>${bits}</small>` : ''}</span>${s.u ? '<span class="sgc pend">–</span>' : sgChip(x.sg)}</button>`;
    if (ed) row += `<div class="shot-ed"><div class="chips"><span class="lbl">Club</span>${clubChips('edClub', s.c, `data-i="${i}"`)}</div>
      ${i === 0 ? `<label class="f inline">Hit from<input id="ed-d0" type="text" inputmode="decimal" autocomplete="off" data-ch="edD0" value="${esc(s.d)}"><span>yards</span></label>` : ''}
      ${nx && !s.u ? `${nx.u ? '' : `<div class="chips"><span class="lbl">Finished</span>${lieChips('edLie', nx.lie, `data-i="${i}"`)}</div>`}
      <label class="f inline">Left to the hole<input id="ed-d" type="text" inputmode="decimal" autocomplete="off" data-ch="edD" data-i="${i}" value="${esc(nx.u ? '' : nx.d)}"${nx.u ? ' placeholder="not logged"' : ''}><span>${nx.lie === 'grn' ? 'feet' : 'yards'}</span></label>` : ''}
      ${s.u ? '' : `<div class="chips"><span class="lbl">Missed</span>${missChips('edMiss', s.m, `data-i="${i}"`)}</div>
      <div class="chips"><span class="lbl">Penalty strokes</span>${seg('edPen', String(s.p || 0), [['0','None'],['1','+1'],['2','+2']], `data-i="${i}"`)}</div>`}
      <div class="btnrow"><button class="btn ghost sm danger" data-act="delShot" data-i="${i}">${s.u ? 'Delete this putt' : 'Delete shot'}</button><span class="grow"></span><button class="btn sm" data-act="editShot" data-i="${i}">Done</button></div></div>`;
    return row + `</li>`;
  }).join('') + `</ul>`;
  const mapped = MAPS && !!geoOf(holeDef(h));          // with a map, the shot pad sits right under the photo and the list follows it
  if (!mapped || ha.done) out += list;
  if (ha.done) {
    out += `<div class="holed"><div class="res"><span class="big num">${ha.score}</span><span>${scoreName(ha.score - h.par)}</span>${sgChip(ha.sg.tot)}</div>
      <div class="btnrow"><button class="btn ghost sm" data-act="reopen">Reopen hole</button>${hi < r.holes.length - 1 ? `<button class="btn flag" data-act="hole" data-i="${hi + 1}">Next hole ›</button>` : `<button class="btn flag" data-act="finishRound">Finish round</button>`}</div></div>`;
  }
  out += `</section>`;
  if (!ha.done) {
    const p = padFor(r, hi), st = startPos(h);
    out += `<form class="card pad" data-sub="addShot"><div class="padhead"><span class="lbl">Shot ${n + 1}</span><b>${n ? `From ${FROM[st.lie]}, ${dist(st.d)} ${st.lie === 'grn' ? 'feet' : 'yards'} out` : 'From the tee'}</b></div>${markRow(h, p, n)}
      ${n ? '' : `<label class="f inline">Hole plays<input id="pad-d0" type="text" inputmode="numeric" autocomplete="off" data-in="padD0" data-ch="padD0" value="${esc(p.d0)}"><span>yards today</span></label>`}
      <div class="chips"><span class="lbl">Club</span>${p.cAuto && p.c && st.lie !== 'grn' ? `<em class="tag alt" id="clubSugg">Suggested</em>` : ''}${clubChips('padClub', p.c)}</div>
      <div class="chips"><span class="lbl">Where did it finish?</span>${lieChips('padLie', p.lie, '', ['fwy','rgh','snd','rec','grn'])}</div>
      <label class="dist"><input id="pad-d" type="text" inputmode="decimal" autocomplete="off" data-in="padD" value="${esc(p.d)}" placeholder="0" aria-label="Distance left to the hole"><span>${p.lie === 'grn' ? 'feet' : 'yards'} left to the hole</span></label>
      ${p.err ? `<p class="err" role="alert">${esc(p.err)}</p>` : ''}
      <div class="pad-last"><span class="lbl">Missed</span>${missChips('padMiss', p.m)}<span class="lbl">Penalty</span>${seg('padPen', String(p.p || 0), [['0','None'],['1','+1'],['2','+2']])}</div>
      <div class="btnrow"><button class="btn" type="submit">Save shot</button><button class="btn flag" type="button" data-act="holed">Holed it</button>${st.lie === 'grn' ? `<button class="btn ghost" type="button" data-act="putts" data-v="2">2 putts</button><button class="btn ghost" type="button" data-act="putts" data-v="3">3 putts</button>` : ''}<span class="grow"></span><button class="btn ghost sm" type="button" data-act="rehit">OB or lost: re-hit</button>${n ? `<button class="btn ghost sm" type="button" data-act="undoShot">Undo last shot</button>` : ''}</div>
      ${st.lie === 'grn' ? `<p class="sub">2 putts and 3 putts finish the hole from here. Type the next putt's length first if you know it. Left blank, the app scores your putting from this putt's length and the number of putts.</p>` : ''}
      <p class="sub">${st.lie === 'grn' ? '' : p.cAuto && p.c ? 'The club is picked for you from the hole plan or the distance: tap another if you hit something else. ' : 'Pick the club you hit. '}Say where the ball finished and how far it has left. ${geoOf(holeDef(h)) ? 'Marking the ball on the map fills in the distance for you. ' : ''}Tap Holed it when the shot goes in. Missed and Penalty are optional.</p></form>`;
  }
  if (mapped && !ha.done && n) out += `<section class="card"><h3 class="h3">Shots on this hole</h3>${list}</section>`;
  if (anySg) {
    const t5 = T5(o);
    out += `<section class="card"><h3 class="h3">This round vs ${esc(E.BASES[base()])}</h3>${sgBars(a.live, 1, 'strokes')}
      <div class="kv"><div><b>${a.done ? a.gir : '–'}<small> / ${a.done}</small></b><span>Greens in regulation</span></div><div><b>${a.firN ? a.fir : '–'}<small> / ${a.firN}</small></b><span>Fairways</span></div>
      <div><b>${a.putts}</b><span>Putts</span></div><div><b>${a.udN ? a.ud : '–'}<small> / ${a.udN}</small></b><span>Up-and-downs</span></div><div><b>${a.pens}</b><span>Penalty strokes</span></div></div>
      <div class="t5"><span class="lbl">Tiger 5 mistakes: ${a.t5.reduce((x, y) => x + y, 0)}</span>${t5.map((l, i) => `<div><span>${l}</span><b class="num">${a.t5[i]}</b></div>`).join('')}</div></section>`;
  }
  const top5 = bestOf(shotsOf(r, a), 5);
  if (top5.length) out += `<section class="card"><h3 class="h3">${top5.length === 5 ? 'Best 5 shots of the round' : 'Best shots of the round so far'}</h3>${shotRows(top5, false)}<p class="sub">Ranked by strokes gained against the ${esc(E.BASES[base()])} benchmark. Tap a shot to go to its hole.</p></section>`;
  if (mapped) out += `<section class="card"><div class="btnrow"><span class="lbl">GPS updates</span>${seg('gpsMode', SLMap.gps.mode, [['live','Live'],['tap','Battery saver']])}</div><p class="sub">${SLMap.gps.mode === 'tap' ? 'Battery saver: the GPS wakes only when you tap Mark ball here, Me or the GPS button on the photo.' : 'Live: the GPS follows you while the photo is on screen. Battery saver uses less power.'}</p></section>`;
  out += `<section class="card"><label class="f">Round notes<textarea id="r-notes" data-ch="roundNotes">${esc(r.notes || '')}</textarea></label>
    <div class="btnrow">${S.ui.confirm === 'delRound' ? `<span>Delete this round for good?</span><button class="btn sm danger ghost" data-act="delRound">Delete</button><button class="btn sm ghost" data-act="cancel">Keep</button>` : `<button class="btn sm ghost danger" data-act="ask" data-v="delRound">Delete round</button>`}</div></section>`;
  return out;
}

/* ---------- best shots: the top five of a round and the top ten ever ---------- */
/** Every shot whose strokes gained is known, from finished holes and holes still in play. Scorecard rounds have no shots. */
function shotsOf(r, a) {
  const out = [];
  (r.holes || []).forEach((h, hi) => {
    const ha = a.holes[hi]; if (!ha || ha.card) return;
    (h.shots || []).forEach((s, i) => {
      const sg = ha.shots[i] && ha.shots[i].sg; if (sg == null) return;
      const nx = h.shots[i + 1] || (h.done ? null : h.next), holed = !h.shots[i + 1] && h.done, more = unloggedAfter(h, i);
      out.push({ rid:r.id, date:r.date, cid:h.cid, hn:h.n, hi, par:h.par, i, lie:s.lie, d:+s.d, c:s.c || '', sg, cat:ha.shots[i].cat, nl: holed ? 'holed' : more ? 'putts' : nx ? nx.lie : '', nd: holed || !nx ? 0 : more ? more + 1 : +nx.d });
    });
  });
  return out;
}
const bestOf = (list, n) => list.slice().sort((p, q) => q.sg - p.sg || (p.date < q.date ? -1 : p.date > q.date ? 1 : p.hi - q.hi || p.i - q.i)).slice(0, n);
function shotRows(list, withRound) {
  return `<ol class="best">${list.map((x, i) => { const c = courseById(x.cid);
    return `<li><button type="button" data-act="openShot" data-r="${esc(x.rid)}" data-h="${x.hi}"><span class="sn num">${i + 1}</span>
      <span class="bl"><b>${esc(clubName(x.c) || 'Shot')}</b><span>${posText(x.lie, x.d)} → ${x.nl === 'holed' ? 'holed' : x.nl === 'putts' ? `holed in ${x.nd} putts` : x.nl ? posText(x.nl, x.nd) : ''}</span>
      <small>${withRound ? `${dateLabel(x.date)} · ${esc(c ? c.name : 'Round')}, hole ${x.hn}` : `Hole ${x.hi + 1}`} · par ${x.par} · ${CATN[x.cat]}</small></span>${sgChip(x.sg)}</button></li>`; }).join('')}</ol>`;
}
function vBest() {
  const rs = statRounds(), b = base(), o = opts(), bn = E.BASES[b]; let all = [], nShot = 0, nCard = 0;
  rs.forEach(r => { if (isCardRound(r)) { nCard++; return; } const list = shotsOf(r, E.analyzeRound(r, b, o)); if (list.length) { nShot++; all = all.concat(list); } });
  const top = bestOf(all, 10), onlyEx = all.length && all.every(x => S.rounds[x.rid] && S.rounds[x.rid].example);
  const cardNote = nCard ? ` Your ${nCard} imported scorecard round${nCard > 1 ? 's have' : ' has'} no shot distances, so ${nCard > 1 ? 'they' : 'it'} cannot appear here.` : '';
  let h = `<section class="card"><h2 class="h2">Top 10 shots</h2><p class="sub">Your ten best shots ever by strokes gained, measured against the ${esc(bn)} benchmark. Tap one to open its hole. Change the benchmark in the header and the list is ranked again.</p>`;
  if (!top.length) return h + `<p class="empty">No shots to rank yet. Log a round shot by shot and its best shots land here.${cardNote}</p></section>`;
  h += shotRows(top, true) + `<p class="sub">From ${all.length} shot${all.length > 1 ? 's' : ''} in ${nShot} round${nShot > 1 ? 's' : ''} logged shot by shot.${cardNote}</p>`;
  if (onlyEx) h += `<p class="note">These shots come from the example round. It drops out when you log or import your first round.</p>`;
  return h + `</section>`;
}

/* ---------- TheGrint scorecard rounds ---------- */
const TEE_TXT = ['–','Left','Right','Fairway','Short','Missed','Long','Far left','Far right'];
const PEN_TXT = { O:'OB', W:'Water', D:'Drop', S:'Greenside bunker', F:'Fairway bunker' };
const penText = pen => { const s = String(pen || ''), n = (s.match(/P/g) || []).length; return [n ? `${n} penalty stroke${n > 1 ? 's' : ''}` : ''].concat(s.replace(/P/g, '').split('').map(p => PEN_TXT[p] || '')).filter(Boolean).join(', ') || '–'; };
function vCardRound(r) {
  const a = E.analyzeRound(r, base(), opts());
  let out = `<div class="rhead"><button class="btn ghost sm" data-act="closeRound">‹ Rounds</button>
    <div class="rtitle"><b>${esc(roundName(r))}</b><span>${dateLabel(r.date)} · <em class="tag">${r.src === 'card' ? 'Scorecard' : 'TheGrint'}</em></span></div>
    <div class="rsum"><span class="big num">${a.done ? a.score : '–'}</span><span class="sub">${a.done ? `${toPar(a.score - a.par)} thru ${a.done}` : ''}</span>${sgChip(a.all.n ? a.all.sg : null)}</div></div>`;
  out += `<section class="card">${tbl(['Hole','Par','Yards','Score','Putts','Tee shot','Trouble','SG'], r.holes.map((h, i) => {
    const x = a.holes[i], c = h.card || {};
    return [i + 1, h.par, h.yards || '–', `<b class="num">${x.score == null ? '–' : x.score}</b>`, c.p == null ? '–' : c.p,
      h.par === 3 ? (c.t === 3 ? 'Green' : TEE_TXT[c.t] || '–') : (TEE_TXT[c.t] || '–'), penText(c.pen), x.sgTot == null ? '–' : sgChip(x.sgTot)];
  }))}
    <p class="sub">${r.src === 'card' ? 'Imported from a scorecard' : 'Imported from TheGrint'}. It has no shot distances, so it counts toward total strokes gained, greens, fairways, putts, penalties and hole history, but not the split by part of the game. SG is the ${esc(E.BASES[base()])} benchmark's expected score from the tee minus your score.</p></section>`;
  out += `<section class="card"><div class="btnrow">${S.ui.confirm === 'delRound' ? `<span>Delete this round for good?</span><button class="btn sm danger ghost" data-act="delRound">Delete</button><button class="btn sm ghost" data-act="cancel">Keep</button>` : `<button class="btn sm ghost danger" data-act="ask" data-v="delRound">Delete round</button>`}</div></section>`;
  return out;
}
let xlsxLoading = null;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxLoading) xlsxLoading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/xlsx.full.min.js';
    s.onload = () => window.XLSX ? res(window.XLSX) : rej(new Error('load'));
    s.onerror = () => { xlsxLoading = null; rej(new Error('load')); };
    document.head.appendChild(s);
  });
  return xlsxLoading;
}
const nk = s => String(s).toLowerCase().replace(/[^a-z0-9%]/g, '');
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const p2 = n => String(n).padStart(2, '0');
function rowsOf(X, wb, name) {
  const sn = wb.SheetNames.find(n => nk(n) === nk(name)); if (!sn) return null;
  return X.utils.sheet_to_json(wb.Sheets[sn], { raw:true, defval:null }).map(r => { const o = {}; for (const k in r) o[nk(k)] = r[k]; return o; });
}
function xlDate(X, v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') { const d = X.SSF.parse_date_code(v); return d && d.y > 1990 ? `${d.y}-${p2(d.m)}-${p2(d.d)}` : ''; }
  if (v instanceof Date) return `${v.getFullYear()}-${p2(v.getMonth() + 1)}-${p2(v.getDate())}`;
  let m = String(v).match(/(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${p2(m[2])}-${p2(m[3])}`;
  m = String(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${p2(m[1])}-${p2(m[2])}` : '';
}
function buildImport(X, wb) {
  const H = rowsOf(X, wb, 'Holes'), R = rowsOf(X, wb, 'Rounds') || [];
  if (!H || !H.length) throw new Error('This workbook has no "Holes" sheet with rows in it. Choose the TheGrint stats workbook.');
  const miss = ['roundid','hole','par','score'].filter(k => !(k in H[0]));
  if (miss.length) throw new Error(`The Holes sheet is missing these columns: ${miss.join(', ')}.`);
  const meta = {}, by = {};
  R.forEach(r => { if (r.roundid != null) meta[String(r.roundid)] = r; });
  H.forEach(h => { if (h.roundid == null || !(+h.score > 0) || !(+h.hole > 0) || !(+h.par > 0)) return; (by[String(h.roundid)] = by[String(h.roundid)] || []).push(h); });
  const out = { rounds:[], courses:[], holes:0, skipped: R.filter(r => r.roundid != null && !by[String(r.roundid)]).length, fresh:0, changed:0, same:0, noYards:0 };
  const best = {};
  const shortName = c => { const p = c.split('|').map(s => s.trim()); return p[1] && p[0].length < 12 ? `${p[0]}, ${p[1]}` : p[0]; };
  Object.keys(by).forEach(rid => {
    const hs = by[rid].sort((a, b) => a.hole - b.hole), m = meta[rid] || {};
    const date = xlDate(X, m.date) || xlDate(X, hs[0].date) || today();
    const cname = String(m.course || 'TheGrint round').trim(), teeName = m.tee == null ? '' : String(m.tee).trim();
    const parts = cname.split('|')[0].split('/').map(s => s.trim().toLowerCase()).filter(Boolean);
    const nines = parts.map(p => S.courses.list.find(c => c.holes.length === 9 && c.name.toLowerCase().includes(p)));
    const nineOf = h => nines[+h.hole > 9 ? 1 : 0];
    const linked = parts.length <= 2 && hs.every(h => { const c = +h.hole <= 18 && nineOf(h), x = c && c.holes[(+h.hole - 1) % 9]; return x && +x.par === +h.par; });
    const key = 'tg-' + slug(cname), segs = [];
    const holes = hs.map(h => {
      const c = linked ? nineOf(h) : null, cid = c ? c.id : key, nm = c ? c.name : shortName(cname);
      if (!segs.some(s => s.courseId === cid)) segs.push({ courseId:cid, name:nm, tee:teeName });
      if (!(+h.yards > 0)) out.noYards++;
      const putts = (h.putts == null || h.putts === '' || isNaN(+h.putts)) ? null : +h.putts;
      return { cid, n: c ? ((+h.hole - 1) % 9) + 1 : +h.hole, par:+h.par, yards:+h.yards || 0, shots:[], done:true,
        card:{ s:+h.score, p:putts, t:+h.teeshotcode || 0, pen:String(h.penaltycodes || '').toUpperCase().replace(/[^OWDSF]/g, '') } };
    });
    const id = 'tg-' + slug(rid), r = { id, src:'grint', date, createdAt: Date.parse(date) || 0, updatedAt:0, notes:'', segs, holes };
    const old = S.rounds[id], canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => { o[k] = canon(v[k]); return o; }, {}) : v, sig = x => JSON.stringify(canon([x.date, x.segs, x.holes]));   // saved rounds can come back with their fields in another order
    r.state = !old ? 'fresh' : sig(old) === sig(r) ? 'same' : 'changed'; out[r.state]++;
    out.rounds.push(r); out.holes += holes.length;
    if (!linked && (!best[key] || hs.length > best[key].hs.length || (hs.length === best[key].hs.length && date > best[key].date))) best[key] = { cname, teeName, hs, date };
  });
  Object.keys(best).forEach(key => {
    if (courseById(key)) return;
    const b = best[key], n = Math.max(...b.hs.map(h => +h.hole)) > 9 ? 18 : 9, at = i => b.hs.find(x => +x.hole === i + 1);
    out.courses.push({ id:key, name:shortName(b.cname), defaultTee:b.teeName || 'Played', tees:[{ name:b.teeName || 'Played', yards:Array.from({ length:n }, (_, i) => { const h = at(i); return h ? +h.yards || 0 : 0; }) }],
      holes:Array.from({ length:n }, (_, i) => { const h = at(i); return { par: h ? +h.par : 4, hcp: h && +h.strokeindex > 0 ? +h.strokeindex : null, plan:{ club:'', aim:'', avoid:'', notes:'' } }; }) });
  });
  out.rounds.sort((a, b) => a.date < b.date ? -1 : 1);
  return out;
}
/* ---------- scorecard template: one row per hole, typed by hand or copied out of any scorecard app ---------- */
const IMPORT_MODE = 'card';            // 'card' in the copy made for sharing, where the import card is built around the template
const TEMPLATE_B64 = '';                // the blank template workbook, filled in when that copy is built
const CARD = IMPORT_MODE === 'card';
const isCardRound = r => r.src === 'grint' || r.src === 'card';
const CARD_COLS = { date:['date','fecha','day'], course:['course','coursename','campo','club'], tee:['tee','tees','teebox','salida'], hole:['hole','holeno','holenumber','hoyo'], par:['par'],
  yards:['yards','yardage','yds','distance','length','yardas'], score:['score','strokes','gross','golpes'], putts:['putts','putt','puts'],
  fairway:['fairway','fw','fir','fairwayhit','teeshot','calle'], pen:['penalties','penalty','penaltystrokes','pen','castigos'] };
const CARD_FW = { hit:3, h:3, y:3, yes:3, si:3, f:3, fw:3, fairway:3, c:3, center:3, centre:3, '1':3, 'true':3, left:1, l:1, izq:1, izquierda:1, right:2, r:2, der:2, derecha:2,
  short:4, corto:4, long:6, largo:6, over:6, miss:5, missed:5, m:5, no:5, n:5, x:5, '0':5, 'false':5 };
const canonV = v => Array.isArray(v) ? v.map(canonV) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => { o[k] = canonV(v[k]); return o; }, {}) : v;
const cardSig = x => JSON.stringify(canonV([x.date, x.segs, x.holes]));
function cardDate(X, v) {
  const ok = (y, m, d) => (y > 1990 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) ? `${y}-${p2(m)}-${p2(d)}` : '';
  if (v == null || v === '') return '';
  if (typeof v === 'number') { const d = X.SSF.parse_date_code(v); return d ? ok(d.y, d.m, d.d) : ''; }
  if (v instanceof Date) return ok(v.getFullYear(), v.getMonth() + 1, v.getDate());
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/); if (m) return ok(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/); if (m) { const a = +m[1], b = +m[2]; return a > 12 ? ok(+m[3], b, a) : ok(+m[3], a, b); }   // day first when it cannot be a month
  return '';
}
/** The sheet holding one row per hole, or null when the file is the TheGrint stats workbook or has no such sheet. */
function findCardSheet(X, wb) {
  const hn = wb.SheetNames.find(n => nk(n) === 'holes');
  if (hn) { const first = X.utils.sheet_to_json(wb.Sheets[hn], { header:1, raw:true, defval:null })[0] || []; if (first.some(c => c != null && nk(c) === 'roundid')) return null; }
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]; if (!ws || !ws['!ref']) continue;
    const rows = X.utils.sheet_to_json(ws, { header:1, raw:true, defval:null, blankrows:true }), off = X.utils.decode_range(ws['!ref']).s.r;
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const cols = {};
      (rows[i] || []).forEach((c, j) => { if (c == null) return; const k = nk(c); for (const f in CARD_COLS) if (cols[f] == null && CARD_COLS[f].includes(k)) cols[f] = j; });
      if (cols.hole != null && cols.score != null) return { name, rows, cols, hdr:i, off };
    }
  }
  return null;
}
function buildCardImport(X, cs) {
  const { rows, cols, hdr, off } = cs;
  const out = { kind:'card', rounds:[], courses:[], holes:0, skipped:0, fresh:0, changed:0, same:0, noYards:0, problems:[], example:0 };
  const blank = v => v == null || String(v).trim() === '';
  const numOf = v => blank(v) ? null : Number(String(v).trim().replace(',', '.'));
  const txt = v => blank(v) ? '' : String(v).trim().replace(/\s+/g, ' ');
  const say = (rn, msg) => out.problems.push(`Row ${rn}: ${msg}`);
  const teeOf = (c, name) => name ? c.tees.find(t => t.name.trim().toLowerCase() === name.toLowerCase()) : (c.tees.find(t => t.name === c.defaultTee) || c.tees[0]);
  const groups = {}, order = []; let last = { date:'', course:'' };
  for (let i = hdr + 1; i < rows.length; i++) {
    const row = rows[i] || [], rn = off + i + 1, at = k => cols[k] == null ? null : row[cols[k]];
    if (['date','course','hole','par','score','putts'].every(k => blank(at(k)))) continue;
    if (/^example/i.test(txt(at('course')))) { out.example++; continue; }
    let date = last.date, course = last.course;                       // a blank Date or Course takes the value from the row above
    if (!blank(at('date'))) { date = cardDate(X, at('date')); if (!date) { say(rn, `left out. The date "${txt(at('date'))}" was not understood. Type it like 2026-11-25.`); continue; } }
    if (!blank(at('course'))) course = txt(at('course'));
    if (!date) { say(rn, 'left out. The date is missing.'); continue; }
    if (!course) { say(rn, 'left out. The course is missing.'); continue; }
    last = { date, course };
    const hole = numOf(at('hole')), score = numOf(at('score'));
    if (!(Number.isInteger(hole) && hole >= 1 && hole <= 18)) { say(rn, blank(at('hole')) ? 'left out. The hole number is missing.' : `left out. "${txt(at('hole'))}" is not a hole number from 1 to 18.`); continue; }
    if (!(Number.isInteger(score) && score >= 1 && score <= 30)) { say(rn, blank(at('score')) ? 'left out. The score is missing.' : `left out. "${txt(at('score'))}" is not a score.`); continue; }
    const par = numOf(at('par'));
    if (par != null && !(Number.isInteger(par) && par >= 3 && par <= 6)) { say(rn, `left out. "${txt(at('par'))}" is not a par from 3 to 6.`); continue; }
    let yards = numOf(at('yards'));
    if (yards != null && !(yards >= 30 && yards <= 900)) { if (yards !== 0) say(rn, `the yardage "${txt(at('yards'))}" was ignored.`); yards = null; }
    let putts = numOf(at('putts'));
    if (putts != null && !(Number.isInteger(putts) && putts >= 0 && putts <= Math.max(0, score - 1))) { say(rn, `${txt(at('putts'))} putts does not fit a score of ${score}, so putts were left blank.`); putts = null; }
    let t = 0;
    if (!blank(at('fairway'))) {
      const k = String(at('fairway')).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (Object.prototype.hasOwnProperty.call(CARD_FW, k)) t = CARD_FW[k]; else say(rn, `the fairway entry "${txt(at('fairway'))}" was ignored. Use Hit, Left, Right, Short, Long or Missed.`);
    }
    let pen = '';
    if (!blank(at('pen'))) {
      const n = numOf(at('pen')), s = String(at('pen')).toUpperCase().replace(/\s+/g, '');
      if (Number.isInteger(n) && n >= 0 && n <= 9) pen = 'P'.repeat(n); else if (/^[OWD]+$/.test(s)) pen = s; else say(rn, `the penalties entry "${txt(at('pen'))}" was ignored. Type the number of penalty strokes.`);
    }
    const key = date + '|' + course.toLowerCase();
    let g = groups[key]; if (!g) { g = groups[key] = { date, course, list:[[]] }; order.push(key); }
    let cur = g.list[g.list.length - 1];
    if (cur.some(h => h.hole === hole)) {
      if (cur[cur.length - 1].hole === hole) { say(rn, `left out. Hole ${hole} is already on the row above.`); continue; }
      cur = []; g.list.push(cur);                                     // the hole numbers start again: another round that day
    }
    cur.push({ rn, hole, score, par, yards, putts, t, pen, tee: txt(at('tee')) });
  }
  // Where each round's course comes from: two nines in the app ("Caobas / Pinos"), a course in the app by name, or a course this file introduces.
  const plans = {}, seenPar = {}, maxHole = {}, cand = {}, pending = {};
  order.forEach(key => {
    const g = groups[key], cname = g.course, parts = cname.split('/').map(s => s.trim().toLowerCase()).filter(Boolean), all = g.list.reduce((a, b) => a.concat(b), []);
    const nines = parts.map(p => S.courses.list.find(c => c.holes.length === 9 && c.name.toLowerCase().includes(p)));
    const viaNines = parts.length >= 1 && parts.length <= 2 && nines.every(Boolean) && all.every(h => nines[h.hole > 9 ? 1 : 0]);
    const ckey = 'sc-' + slug(cname);
    let known = viaNines ? null : (S.courses.list.find(c => c.name.trim().toLowerCase() === cname.toLowerCase()) || courseById(ckey) || null);
    if (known && !all.every(h => known.holes[h.hole - 1])) known = null;
    plans[key] = { cname, ckey, viaNines, nines, known };
    if (!viaNines && !known) all.forEach(h => { maxHole[ckey] = Math.max(maxHole[ckey] || 0, h.hole); if (h.par != null) { const m = seenPar[ckey] || (seenPar[ckey] = {}); if (m[h.hole] == null) m[h.hole] = h.par; } });
  });
  // A course the file introduces is described by its fullest round (the latest one on a tie), so a second import of the same file reads the same.
  order.forEach(key => {
    const g = groups[key], p = plans[key]; if (p.viaNines || p.known) return; const sp = seenPar[p.ckey] || {};
    g.list.forEach(raw => {
      const hs = raw.filter(h => h.par != null || sp[h.hole] != null); if (!hs.length) return; const b = cand[p.ckey];
      if (!b || hs.length > b.hs.length || (hs.length === b.hs.length && g.date > b.date)) cand[p.ckey] = { cname:p.cname, teeName:(raw.find(h => h.tee) || {}).tee || '', hs, date:g.date };
    });
  });
  Object.keys(cand).forEach(ckey => {
    if (courseById(ckey)) return;
    const b = cand[ckey], sp = seenPar[ckey] || {}, n = maxHole[ckey] > 9 ? 18 : 9, at = i => b.hs.find(x => x.hole === i + 1);
    pending[ckey] = { id:ckey, name:b.cname, defaultTee:b.teeName || 'Played', tees:[{ name:b.teeName || 'Played', yards:Array.from({ length:n }, (_, i) => { const h = at(i); return h && h.yards ? h.yards : 0; }) }],
      holes:Array.from({ length:n }, (_, i) => ({ par: sp[i + 1] || 4, hcp:null, plan:{ club:'', aim:'', avoid:'', notes:'' } })) };
  });
  order.forEach(key => {
    const g = groups[key], p = plans[key], pend = pending[p.ckey] || null, sp = seenPar[p.ckey] || {};
    g.list.forEach((raw, k) => {
      const teeName = (raw.find(h => h.tee) || {}).tee || '', hs = [];
      raw.slice().sort((a, b) => a.hole - b.hole).forEach(h => {
        const c = p.viaNines ? p.nines[h.hole > 9 ? 1 : 0] : (p.known || pend), n = p.viaNines ? ((h.hole - 1) % 9) + 1 : h.hole;
        const par = h.par != null ? h.par : !c ? null : c === pend ? (sp[h.hole] || null) : (+c.holes[n - 1].par || null);
        if (par == null) { say(h.rn, `left out. Par is missing, and "${p.cname}" is not a course in the app yet.`); return; }
        let yards = h.yards; if (yards == null && c) { const tt = teeOf(c, teeName); yards = tt ? +tt.yards[n - 1] || 0 : 0; }
        hs.push(Object.assign({}, h, { c, n, par, yards: yards || 0 }));
      });
      if (!hs.length) return;
      const segs = [], holes = hs.map(h => {
        const cid = h.c ? h.c.id : p.ckey;
        if (!segs.some(s => s.courseId === cid)) segs.push({ courseId:cid, name: h.c ? h.c.name : p.cname, tee: teeName || (h.c ? (teeOf(h.c, '') || {}).name || '' : '') });
        if (!(h.yards > 0)) out.noYards++;
        return { cid, n:h.n, par:h.par, yards:h.yards, shots:[], done:true, card:{ s:h.score, p:h.putts, t:h.t, pen:h.pen } };
      });
      const id = 'sc-' + slug(`${g.date} ${p.cname}`) + (k ? '-' + (k + 1) : '');
      const r = { id, src:'card', date:g.date, createdAt: Date.parse(g.date) || 0, updatedAt:0, notes:'', segs, holes };
      const old = S.rounds[id]; r.state = !old ? 'fresh' : cardSig(old) === cardSig(r) ? 'same' : 'changed'; out[r.state]++;
      out.rounds.push(r); out.holes += holes.length;
    });
  });
  out.courses = Object.keys(pending).filter(ckey => out.rounds.some(r => r.holes.some(h => h.cid === ckey))).map(ckey => pending[ckey]);
  out.rounds.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  if (!out.rounds.length && !out.problems.length) throw new Error(out.example ? 'Only the example row is filled in. Add your own holes under it, one row per hole.' : `The "${cs.name}" sheet has no holes filled in yet.`);
  return out;
}
const problemsHtml = o => (o.problems && o.problems.length) ? `<div class="note"><b>${o.problems.length} thing${o.problems.length > 1 ? 's' : ''} to check in the file</b><ul class="how">${o.problems.slice(0, 8).map(p => `<li>${esc(p)}</li>`).join('')}</ul>${o.problems.length > 8 ? `<p>And ${o.problems.length - 8} more. Fix these and choose the file again to see the rest.</p>` : ''}</div>` : '';
function vImport() {
  const im = S.ui.imp || { status:'idle' };
  let h = CARD ? `<section class="card"><h2 class="h2">Import scorecards</h2><p class="sub">Have rounds in another scorecard app or on paper? Save the template, fill in one row per hole, then choose the file here. Each round is added as a scorecard round: score, putts, fairway and penalties for each hole. Choosing the file again later only adds new rounds and updates changed ones.</p>
    <div class="btnrow"><a class="btn ghost sm" href="scorecard-template.xlsx" download="Stroke Ledger scorecards.xlsx">Save the template</a><span class="sub" id="tplMsg"></span></div>
    <label class="f">Filled-in template<input type="file" id="tg-file" accept=".xlsx,.xlsm,.xls" data-ch="grintFile"></label>`
    : `<section class="card"><h2 class="h2">TheGrint rounds</h2><p class="sub">Choose your TheGrint stats workbook (.xlsx). Every round with a hole-by-hole card is added as a scorecard round: score, putts, tee-shot result and penalties for each hole. Importing a newer workbook later only adds what changed.</p>
    <label class="f">Workbook<input type="file" id="tg-file" accept=".xlsx,.xlsm,.xls" data-ch="grintFile"></label>`;
  if (im.status === 'reading') h += `<p class="sub">Reading the workbook.</p>`;
  if (im.status === 'error') h += `<p class="err" role="alert">${esc(im.msg)}</p>`;
  if (im.status === 'done') h += `<p class="note">${esc(im.msg)}</p>`;
  if (im.status === 'ready') {
    const o = im.out, d0 = o.rounds[0], d1 = o.rounds[o.rounds.length - 1];
    h += `<div class="kv"><div><b>${o.rounds.length}</b><span>${CARD ? 'Rounds' : 'Rounds with hole cards'}</span></div><div><b>${o.holes}</b><span>Holes</span></div><div><b>${o.fresh}</b><span>New</span></div><div><b>${o.changed}</b><span>Changed</span></div><div><b>${o.same}</b><span>Already imported</span></div></div>
      <p class="sub">${esc(im.name)}: ${d0 ? `${dateLabel(d0.date)} to ${dateLabel(d1.date)}` : 'no rounds'}.${o.skipped ? ` ${o.skipped} score${o.skipped > 1 ? 's' : ''} without a hole-by-hole card will be skipped.` : ''}${o.noYards ? ` ${o.noYards} hole${o.noYards > 1 ? 's have' : ' has'} no yardage, so no strokes gained there.` : ''}${o.courses.length ? ` Adds ${o.courses.length} course${o.courses.length > 1 ? 's' : ''} to your list: ${esc(o.courses.map(c => c.name).join(', '))}.` : ''}${o.example ? ' The example row was skipped.' : ''}</p>${problemsHtml(o)}
      <div class="btnrow">${o.fresh + o.changed ? `<button class="btn flag" data-act="grintImport">Import ${o.fresh + o.changed} round${o.fresh + o.changed > 1 ? 's' : ''}</button>` : `<span class="sub">Nothing new to import.</span>`}<button class="btn ghost sm" data-act="grintCancel">Cancel</button></div>`;
  }
  return h + `</section>`;
}

/* ---------- Stats ---------- */
const chartW = () => Math.max(280, Math.min(980, (($('#view') || {}).clientWidth || 640) - 30));
function divBarsSvg(items) {
  const W = chartW(), H = 190, L = 34, R = 8, T = 10, B = 24, iw = W - L - R, ih = H - T - B;
  const mx = Math.max(0.5, ...items.map(d => Math.abs(d.v)));
  const step = mx <= 1 ? 0.5 : mx <= 2.5 ? 1 : mx <= 5 ? 2 : mx <= 10 ? 4 : mx <= 20 ? 8 : 16, top = Math.ceil(mx / step) * step;
  const y = v => T + ih / 2 - (v / top) * (ih / 2), slot = iw / items.length, bw = Math.min(30, Math.max(3, slot - 3));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Strokes gained per 18 holes by round">`;
  for (let t = -top; t <= top + 1e-9; t += step) s += `<line class="${Math.abs(t) < 1e-9 ? 'zero-l' : 'grid-l'}" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${t > 0 ? '+' : t < 0 ? '−' : ''}${Math.abs(t)}</text>`;
  const every = Math.ceil(items.length / Math.max(2, Math.floor(iw / 70)));
  items.forEach((d, i) => {
    const x0 = L + i * slot + (slot - bw) / 2, y0 = y(0), y1 = y(d.v), r = Math.min(4, bw / 2, Math.abs(y1 - y0)), sgn = d.v >= 0 ? 1 : -1;
    if (Math.abs(d.v) > 0.004) s += `<path class="${d.v >= 0 ? 'f-gain' : 'f-loss'}" d="M${x0} ${y0}V${y1 + sgn * r}Q${x0} ${y1} ${x0 + r} ${y1}H${x0 + bw - r}Q${x0 + bw} ${y1} ${x0 + bw} ${y1 + sgn * r}V${y0}Z"><title>${esc(d.tip)}</title></path>`;
    if (i % every === 0) s += `<text x="${x0 + bw / 2}" y="${H - 7}" text-anchor="middle">${esc(d.x)}</text>`;
  });
  return s + `</svg>`;
}
function vStats() {
  let rs = statRounds();
  const played = rs.filter(hasPlay), onlyEx = played.length && played.every(r => r.example);
  if (S.ui.statCourse !== 'all') rs = rs.filter(r => (r.segs || []).some(s => s.courseId === S.ui.statCourse));
  if (S.ui.statRange !== 'all') rs = rs.slice(-(+S.ui.statRange));
  const o = opts(), G = E.aggregate(rs, base(), o), bn = E.BASES[base()];
  let h = `<div class="btnrow"><select id="st-course" data-ch="statCourse" aria-label="Course">${opt('all', 'All courses', S.ui.statCourse)}${S.courses.list.map(c => opt(c.id, c.name, S.ui.statCourse)).join('')}</select>
    ${seg('statRange', S.ui.statRange, [['5','Last 5'],['10','Last 10'],['20','Last 20'],['all','All']])}</div>`;
  if (!G.holes) return h + `<p class="empty">No finished holes for this filter yet. Log a round, or ${CARD ? 'import scorecards' : 'import your TheGrint rounds'} from Setup.</p>`;
  if (onlyEx) h += `<p class="note">These numbers come from the example round. It drops out of your stats when you log or import your first round.</p>`;
  const k = 18 / G.holes, ks = G.shot ? 18 / G.shot : 0, bk = E.buckets(G.recs, G.shot, o), nCard = G.rounds.filter(x => x.src === 'grint' || x.src === 'card').length, anySc = G.rounds.some(x => x.src === 'card');
  const pc = (a, b) => b ? num(100 * a / b, 0) + '%' : '–';
  h += `<section class="card"><h2 class="h2">Strokes gained per 18 holes</h2><p class="sub">Against the ${esc(bn)} benchmark, over ${G.n} round${G.n > 1 ? 's' : ''} and ${G.holes} holes${nCard ? `. ${nCard} of the rounds ${anySc ? 'are imported scorecards' : 'came from TheGrint'}` : ''}.</p>
    <div class="kv"><div><b>${G.all.n ? fmt(G.all.sg / G.all.n * 18) : '–'}</b><span>Total strokes gained per 18</span></div><div><b>${fmt((G.score - G.par) * k, 1)}</b><span>To par per 18</span></div><div><b>${pc(G.gir, G.girN)}</b><span>Greens in regulation</span></div><div><b>${pc(G.fir, G.firN)}</b><span>Fairways</span></div>
    <div><b>${G.puttN ? num(G.putts / G.puttN * 18, 1) : '–'}</b><span>Putts per 18</span></div><div><b>${num(G.pens * k, 1)}</b><span>Penalty strokes per 18</span></div></div></section>`;
  h += `<section class="card"><h2 class="h2">By part of the game</h2>${G.shot ? `<p class="sub">From the ${G.shotRounds} round${G.shotRounds > 1 ? 's' : ''} logged shot by shot (${G.shot} hole${G.shot > 1 ? 's' : ''}). Bars to the right are strokes gained, bars to the left are strokes lost.</p>${sgBars(G.sg, ks, 'per 18 holes')}` : `<p class="empty">Log a round shot by shot to see where the strokes go. ${CARD ? 'Imported scorecards' : 'Rounds imported from TheGrint'} carry a total only, because they have no shot distances.</p>`}</section>`;
  const all = [];
  bk.ott.forEach(r => all.push({ t:`Tee shots with ${clubName(r.club) || 'no club recorded'}`, r }));
  bk.app.forEach(r => all.push({ t:`Approach from ${r.label} yds`, r }));
  bk.arg.forEach(r => all.push({ t:`Around the green from ${r.label.toLowerCase()}`, r }));
  bk.putt.forEach(r => all.push({ t:`Putts from ${r.label} ft`, r }));
  const ok = all.filter(x => x.r.n >= 2).sort((a, b) => a.r.per18 - b.r.per18);
  const leaks = ok.filter(x => x.r.per18 < -0.05).slice(0, 3), strong = ok.filter(x => x.r.per18 > 0.05).slice(-2).reverse();
  if (leaks.length || strong.length) h += `<section class="card"><h2 class="h2">Where the strokes go</h2><div class="leaks">${leaks.map(x => `<div class="leak l"><b>${esc(x.t)}</b><span>${fmt(x.r.per18)} per 18 holes. ${fmt(x.r.per)} per shot over ${x.r.n} shots.</span></div>`).join('')}${strong.map(x => `<div class="leak g"><b>${esc(x.t)}</b><span>${fmt(x.r.per18)} per 18 holes. ${fmt(x.r.per)} per shot over ${x.r.n} shots.</span></div>`).join('')}</div><p class="sub">From shot-logged rounds. Red-edged cards cost the most strokes per round; blue-edged cards gain the most. Buckets with fewer than 2 shots are left out.</p></section>`;
  const tk = S.ui.trend;
  const items = G.rounds.filter(x => tk === 'tot' ? x.a.all.n : x.a.shot).map(x => {
    const v = tk === 'tot' ? x.a.all.sg / x.a.all.n * 18 : x.a.sg[tk] / x.a.shot * 18;
    return { x: dateLabel(x.date).replace(/, \d+$/, ''), v, tip:`${dateLabel(x.date)}: ${fmt(v)} per 18 holes (${x.a.done} holes${x.src === 'grint' ? ', TheGrint' : x.src === 'card' ? ', scorecard' : ''})` };
  });
  h += `<section class="card"><div class="btnrow"><h2 class="h2">Round by round</h2><span class="grow"></span>${seg('trend', tk, [['tot','Total'],['ott','Tee'],['app','Approach'],['arg','Short'],['putt','Putting']])}</div>
    ${items.length ? `<div class="chartbox">${divBarsSvg(items)}</div><p class="sub">Each bar is one round, scaled to 18 holes, oldest on the left.${tk === 'tot' ? '' : ' Only shot-logged rounds have this split.'}</p>` : `<p class="empty">No shot-logged rounds in this filter yet.</p>`}</section>`;
  const mk = E.MAKE[base()], sgc = r => sgChip(r.per), T = G.tee;
  h += `<div class="cols">${T.n ? `<section class="card"><h3 class="h3">Tee shots on par 4s and 5s, all rounds</h3><div class="kv"><div><b>${pc(T.F, T.n)}</b><span>Fairway</span></div><div><b>${pc(T.L, T.n)}</b><span>Missed left</span></div><div><b>${pc(T.R, T.n)}</b><span>Missed right</span></div><div><b>${T.n}</b><span>Tee shots</span></div></div></section>` : ''}
    ${bk.ott.length ? `<section class="card"><h3 class="h3">Off the tee by club</h3>${tbl(['Club','Shots','SG / shot','Fairway','Penalty','Miss L','Miss R'], bk.ott.map(r => [esc(clubName(r.club) || '–'), r.n, sgc(r), num(r.fw, 0) + '%', num(r.pen, 0) + '%', num(r.left, 0) + '%', num(r.right, 0) + '%']))}</section>` : ''}
    ${bk.app.some(r => r.n) ? `<section class="card"><h3 class="h3">Approach by distance</h3>${tbl(['Yards','Shots','SG / shot','On green','Avg leave'], bk.app.filter(r => r.n).map(r => [r.label, r.n, sgc(r), num(r.green, 0) + '%', num(r.prox, 0) + ' ft']))}</section>` : ''}
    ${bk.arg.length ? `<section class="card"><h3 class="h3">Around the green, inside ${o.argYards} yds</h3>${tbl(['Lie','Shots','SG / shot','Up-and-down','Avg leave'], bk.arg.map(r => [r.label, r.n, sgc(r), num(r.ud, 0) + '%', num(r.prox, 0) + ' ft']))}</section>` : ''}
    ${bk.putt.some(r => r.n) ? `<section class="card"><h3 class="h3">Putting by length</h3>${tbl(['Feet','Putts','SG / putt','Made', bn + ' makes'], bk.putt.filter(r => r.n).map(r => [r.label, r.n, sgc(r), num(r.made, 0) + '%', mk[r.band] + '%']))}</section>` : ''}</div>`;
  const t5 = T5(o), ty = E.TYPICAL, t5v = i => i < 3 ? G.t5[i] * k : (G.shot ? G.t5[i] * ks : null);
  h += `<div class="cols"><section class="card"><h3 class="h3">Tiger 5 mistakes per 18</h3><div class="t5">${t5.map((l, i) => `<div><span>${l}</span><b class="num">${num(t5v(i), 1)}</b></div>`).join('')}</div>${nCard ? `<p class="sub">The first three count every round. The last two need shot distances, so they count shot-logged rounds only.</p>` : ''}</section>
    <section class="card"><h3 class="h3">You vs a typical round</h3>${tbl(['','You'].concat(HK.map(b => HS[b])), [
      ['Score, par 72', num(72 + (G.score - G.par) * k, 1)].concat(HK.map(b => ty[b].score.toFixed(1))),
      ['Greens in reg.', pc(G.gir, G.girN)].concat(HK.map(b => ty[b].gir + '%')),
      ['Fairways', pc(G.fir, G.firN)].concat(HK.map(b => ty[b].fir + '%')),
      ['Putts per 18', G.puttN ? num(G.putts / G.puttN * 18, 1) : '–'].concat(HK.map(b => ty[b].putts.toFixed(1))),
      ['Up-and-down', pc(G.ud, G.udN)].concat(HK.map(b => ty[b].ud + '%')),
      ['Penalties per 18', num(G.pens * k, 1)].concat(HK.map(b => ty[b].pens.toFixed(1)))])}<p class="src">Columns are a scratch golfer and 5, 10, 15 and 20 handicaps. Typical figures: Shot Scope data published by Golf Monthly and MyGolfSpy, 2025 and 2026. Up-and-down uses shot-logged rounds.</p></section></div>`;
  return h;
}

/* ---------- Courses and hole plans ---------- */
function holeHistory(cid) {
  const m = {};
  statRounds().forEach(r => {
    const a = E.analyzeRound(r, base(), opts());
    r.holes.forEach((h, i) => {
      const ha = a.holes[i]; if (h.cid !== cid || !ha.done) return;
      const x = m[h.n] || (m[h.n] = { n:0, over:0, sg:0, sgN:0, pens:0, t5:0, dbl:0, tee:{ n:0, F:0, L:0, R:0, X:0 }, clubs:{} });
      x.n++; x.over += ha.score - h.par; x.pens += ha.pens; x.t5 += ha.t5.filter(Boolean).length; if (ha.score >= h.par + 2) x.dbl++;
      if (!ha.card || ha.sgTot != null) { x.sg += ha.sg.tot; x.sgN++; }
      if (ha.teeDir) { x.tee.n++; x.tee[ha.teeDir]++; }
      if (h.par >= 4 && h.shots[0]) { const c = h.shots[0].c || ''; const k = x.clubs[c] || (x.clubs[c] = { n:0, sg:0, fw:0, pen:0, over:0 }); k.n++; k.sg += ha.shots[0].sg; if (ha.fir) k.fw++; if (h.shots[0].p) k.pen++; k.over += ha.score - h.par; }
    });
  });
  return m;
}
function vCourses() {
  if (MAPS && S.ui.mapEd) return vMapEd();
  const cs = S.courses.list, cur = courseById(S.ui.courseId) || cs[0];
  let h = `<div class="chips">${cs.map(c => `<button class="chip" data-act="course" data-id="${esc(c.id)}" aria-pressed="${cur && c.id === cur.id}">${esc(c.name)}</button>`).join('')}</div>`;
  if (!cur) h += `<p class="empty">${S.sync.state === 'loading' || S.sync.state === 'starting' ? 'Loading your courses.' : 'No courses yet. Add your first one below, then fill in its scorecard.'}</p>`;
  else {
    const tee = cur.tees.find(t => t.name === cur.defaultTee) || cur.tees[0] || { name:'', yards:[] };
    const hist = holeHistory(cur.id), par = cur.holes.reduce((t, x) => t + (+x.par || 0), 0);
    h += `<section class="card"><div class="btnrow"><h2 class="h2">${esc(cur.name)}</h2><span class="sub">Par ${par} · ${tee.yards.reduce((a, b) => a + (+b || 0), 0)} yds from ${esc(tee.name)}</span><span class="grow"></span>
      <button class="btn ghost sm" data-act="editCard">${S.ui.editCard ? 'Done editing' : 'Edit scorecard'}</button></div>`;
    if (S.ui.editCard) {
      h += `<div class="frow"><label class="f">Course name<input id="c-name" type="text" data-ch="cName" value="${esc(cur.name)}"></label>
        <label class="f">Default tees<select id="c-def" data-ch="cDef">${cur.tees.map(t => opt(t.name, t.name, cur.defaultTee)).join('')}</select></label></div>
        ${tbl(['Hole','Par','Hcp', ...cur.tees.map((t, ti) => `<input class="wide" id="tee-n-${ti}" type="text" data-ch="teeName" data-t="${ti}" value="${esc(t.name)}" aria-label="Tee name">`)],
          cur.holes.map((x, i) => [i + 1, `<input id="h-par-${i}" type="text" inputmode="numeric" data-ch="hPar" data-i="${i}" value="${esc(x.par)}" aria-label="Par, hole ${i + 1}">`, `<input id="h-hcp-${i}" type="text" inputmode="numeric" data-ch="hHcp" data-i="${i}" value="${esc(x.hcp == null ? '' : x.hcp)}" aria-label="Handicap, hole ${i + 1}">`,
            ...cur.tees.map((t, ti) => `<input id="h-y-${ti}-${i}" type="text" inputmode="numeric" data-ch="hYds" data-t="${ti}" data-i="${i}" value="${esc(t.yards[i] == null ? '' : t.yards[i])}" aria-label="${esc(t.name)} yards, hole ${i + 1}">`)]))}
        <div class="btnrow"><button class="btn ghost sm" data-act="addTee">Add a tee</button>${cur.tees.length > 1 ? `<button class="btn ghost sm" data-act="delTee">Remove last tee</button>` : ''}<span class="grow"></span>
        ${S.ui.confirm === 'delCourse' ? `<span>Delete this course and its hole plans?</span><button class="btn sm ghost danger" data-act="delCourse">Delete</button><button class="btn sm ghost" data-act="cancel">Keep</button>` : `<button class="btn sm ghost danger" data-act="ask" data-v="delCourse">Delete course</button>`}</div>`;
    } else {
      h += courseMapRow(cur) + `<p class="sub">Tap a hole for its game plan and your history on it. History is measured against the ${esc(E.BASES[base()])} benchmark.</p><div>` + cur.holes.map((x, i) => {
        const n = i + 1, hs = hist[n], open = S.ui.openHole === n, p = x.plan;
        const snip = [p.club && clubName(p.club), p.aim, p.avoid && 'avoid ' + p.avoid].filter(Boolean).join(' · ');
        let row = `<div class="holerow"><button data-act="openHole" data-n="${n}" aria-expanded="${open}"><span class="hn num">${n}</span><span>Par ${x.par}</span><span class="num">${tee.yards[i] == null ? '–' : tee.yards[i]}</span>
          <span class="pl">${snip ? esc(snip) : '<span class="sub">No plan yet</span>'}</span>${hs && hs.sgN ? sgChip(hs.sg / hs.sgN) : '<span class="sub">–</span>'}</button>`;
        if (open) {
          row += `<div class="detail"><div class="frow"><label class="f">Tee club<select id="pl-club" data-ch="plan" data-n="${n}" data-k="club">${opt('', 'Not set', p.club)}${S.settings.bag.map(c => opt(c.id, c.name, p.club)).join('')}</select></label>
            <label class="f">Aim<input id="pl-aim" type="text" data-ch="plan" data-n="${n}" data-k="aim" value="${esc(p.aim)}" placeholder="Left edge of the right bunker"></label>
            <label class="f">Avoid<input id="pl-avoid" type="text" data-ch="plan" data-n="${n}" data-k="avoid" value="${esc(p.avoid)}" placeholder="OB right"></label></div>
            <label class="f">Notes<textarea id="pl-notes" data-ch="plan" data-n="${n}" data-k="notes">${esc(p.notes)}</textarea></label>`;
          if (hs) {
            const cl = Object.entries(hs.clubs);
            row += `<div class="kv"><div><b>${hs.n}</b><span>Times played</span></div><div><b>${fmt(hs.over / hs.n, 1)}</b><span>Avg to par</span></div><div><b>${hs.sgN ? fmt(hs.sg / hs.sgN) : '–'}</b><span>SG per play</span></div><div><b>${hs.dbl}</b><span>Doubles or worse</span></div><div><b>${hs.pens}</b><span>Penalty strokes</span></div>${hs.tee.n ? `<div><b>${num(100 * hs.tee.F / hs.tee.n, 0)}%</b><span>Fairway</span></div><div><b>${num(100 * hs.tee.L / hs.tee.n, 0)}%</b><span>Missed left</span></div><div><b>${num(100 * hs.tee.R / hs.tee.n, 0)}%</b><span>Missed right</span></div>` : ''}</div>`;
            if (cl.length) row += tbl(['Tee club','Plays','Tee shot SG','Fairway','Penalty','Avg to par'], cl.sort((a, b) => b[1].n - a[1].n).map(([c, k]) => [esc(clubName(c) || '–'), k.n, sgChip(k.sg / k.n), num(100 * k.fw / k.n, 0) + '%', num(100 * k.pen / k.n, 0) + '%', fmt(k.over / k.n, 1)]));
          } else row += `<p class="sub">No rounds logged on this hole yet.</p>`;
          row += `<div class="btnrow"><button class="btn ghost sm" data-act="planHole" data-n="${n}">Work out the aim point</button>${MAPS ? `<button class="btn ghost sm" data-act="mapEd" data-cid="${esc(cur.id)}" data-n="${n}">${geoOf(x) ? 'Edit on the map' : 'Put on the map'}</button>` : ''}</div></div>`;
        }
        return row + `</div>`;
      }).join('') + `</div>`;
    }
    h += `</section>`;
  }
  h += `<form class="card" data-sub="addCourse"><h3 class="h3">Add a course</h3><div class="frow"><label class="f">Name<input id="ac-name" type="text" placeholder="Course or nine" required></label>
    <label class="f">Holes<select id="ac-holes"><option value="9">9</option><option value="18">18</option></select></label><label class="f">Tee name<input id="ac-tee" type="text" value="White"></label></div>
    <div class="btnrow"><button class="btn" type="submit">Add course</button></div></form>`;
  return h;
}

/* ---------- Aim-point planner ---------- */
let lastTee = null, lastTeeW = 640;
const aimText = a => a === 0 ? 'the centre of the fairway' : `${Math.abs(a)} yds ${a < 0 ? 'left' : 'right'} of the fairway centre`;
function teeClubs() {
  const t = S.ui.tee, bag = S.settings.bag.filter(c => (+c.total || +c.carry) >= 140);
  if (!t.clubs || !t.clubs.some(id => bag.some(c => c.id === id))) t.clubs = bag.slice().sort((a, b) => (+b.total || +b.carry) - (+a.total || +a.carry)).slice(0, 3).map(c => c.id);
  return bag;
}
function teeSvg(res, p) {
  const W = lastTeeW = chartW(), H = 250, L = 40, R = 10, T = 10, B = 58, iw = W - L - R, ih = H - T - B;
  const lim = Math.max(...res.map(r => r.plan.lim)), mn = Math.min(...res.map(r => r.plan.best.v)), y0 = Math.floor(mn * 10) / 10, y1 = y0 + 0.8;
  const X = a => L + (a + lim) / (2 * lim) * iw, Y = v => T + (1 - (Math.min(v, y1) - y0) / (y1 - y0)) * ih;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Expected score by aim point for each club">`;
  for (let v = y0; v <= y1 + 1e-9; v += 0.2) s += `<line class="grid-l" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${v.toFixed(1)}</text>`;
  const half = p.fw / 2, zs = [[-lim, -(half + p.l1), p.lType], [-(half + p.l1), -half, 'rgh'], [-half, half, 'fwy'], [half, half + p.r1, 'rgh'], [half + p.r1, lim, p.rType]];
  zs.forEach(([a, b, t]) => { if (b > a) s += `<rect class="f-${t}" x="${X(a)}" y="${H - B + 8}" width="${X(b) - X(a)}" height="16"/>`; });
  s += `<text class="halo" x="${X(-lim) + 4}" y="${H - B + 20}">${ZT[p.lType]}</text><text class="halo" x="${X(lim) - 4}" y="${H - B + 20}" text-anchor="end">${ZT[p.rType]}</text><text class="halo" x="${X(0)}" y="${H - B + 20}" text-anchor="middle">Fairway</text>`;
  for (let a = -Math.floor(lim / 10) * 10; a <= lim; a += 10) s += `<text x="${X(a)}" y="${H - B + 38}" text-anchor="middle">${a === 0 ? '0' : Math.abs(a) + (a < 0 ? 'L' : 'R')}</text>`;
  s += `<text x="${X(0)}" y="${H - 4}" text-anchor="middle">Aim point: yards left or right of centre</text>`;
  res.forEach((r, i) => {
    let d = '', pen = false;                                   // leave a gap where the curve runs off the top of the scale
    r.plan.curve.forEach(c => { if (c.v > y1) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(c.a).toFixed(1)} ${Y(c.v).toFixed(1)}`; pen = true; });
    s += `<path class="ln s${i + 1}" d="${d}"/>`;
    s += `<circle class="mk m${i + 1}" cx="${X(r.plan.best.a)}" cy="${Y(r.plan.best.v)}" r="5"/>`;
  });
  return s + `</svg>`;
}
function greenSvg(p, res) {
  const m = 14, k = 8, W = (p.gw + 2 * m) * k, H = (p.gd + 2 * m) * k, X = x => (x + m) * k, Y = y => (p.gd + m - y) * k;
  const gx0 = X(0), gx1 = X(p.gw), gy0 = Y(p.gd), gy1 = Y(0), b = res.best, q = 3 * k;   // q: run each band in under the green's rounded corners
  let s = `<svg class="gsvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Green with the flag, the suggested aim point and your shot pattern">
    <polygon class="f-${p.left}" points="0,0 ${gx0 + q},${gy0 + q} ${gx0 + q},${gy1 - q} 0,${H}"/><polygon class="f-${p.right}" points="${W},0 ${gx1 - q},${gy0 + q} ${gx1 - q},${gy1 - q} ${W},${H}"/>
    <polygon class="f-${p.long}" points="0,0 ${W},0 ${gx1 - q},${gy0 + q} ${gx0 + q},${gy0 + q}"/><polygon class="f-${p.short}" points="0,${H} ${W},${H} ${gx1 - q},${gy1 - q} ${gx0 + q},${gy1 - q}"/>
    <rect class="f-grn" x="${gx0}" y="${gy0}" width="${p.gw * k}" height="${p.gd * k}" rx="${3 * k}" stroke="var(--surface)" stroke-width="2"/>
    <text class="halo" x="${W / 2}" y="16" text-anchor="middle">Long: ${ZT[p.long]}</text><text class="halo" x="${W / 2}" y="${H - 7}" text-anchor="middle">Short: ${ZT[p.short]}</text>
    <text class="halo" x="6" y="${H / 2}">${ZT[p.left]}</text><text class="halo" x="${W - 6}" y="${H / 2}" text-anchor="end">${ZT[p.right]}</text>`;
  [2, 1].forEach(z => { s += `<ellipse cx="${X(b.ax)}" cy="${Y(b.ay)}" rx="${p.sx * z * k}" ry="${p.sy * z * k}" fill="none" stroke="var(--ink)" stroke-width="${z === 1 ? 1.5 : 1}" stroke-dasharray="${z === 1 ? '' : '5 4'}" opacity="${z === 1 ? .9 : .6}"/>`; });
  s += `<g stroke="var(--ink)" stroke-width="2" fill="none"><circle cx="${X(b.ax)}" cy="${Y(b.ay)}" r="7"/><path d="M${X(b.ax) - 12} ${Y(b.ay)}h24M${X(b.ax)} ${Y(b.ay) - 12}v24"/></g>
    <g><path d="M${X(p.px)} ${Y(p.py)}v-26" stroke="var(--ink)" stroke-width="2"/><path d="M${X(p.px) + 1} ${Y(p.py) - 26}l15 5-15 6z" fill="var(--flag)" stroke="var(--ink)" stroke-width="1"/><circle cx="${X(p.px)}" cy="${Y(p.py)}" r="3" fill="var(--ink)"/></g>`;
  return s + `</svg>`;
}
function vAim() {
  const cs = S.courses.list, ac = courseById(S.ui.aimCourse), mode = S.ui.aimMode, b = base();
  let h = `<section class="card"><div class="btnrow"><h2 class="h2">Aim point</h2><span class="grow"></span>${seg('aimMode', mode, [['tee','Tee shot'],['ap','Approach']])}</div>
    <p class="sub">Finds the aim that costs the fewest strokes across your whole shot pattern, not just your best shot.</p>
    <ol class="how">${mode === 'tee' ? '<li>Pick a hole below, or type its length.</li><li>Describe the landing area: how wide the fairway is, how much rough sits on each side, and what lies beyond it.</li><li>Read the answer: the club and aim line with the lowest expected score.</li>' : '<li>Enter the distance, then the size of the green.</li><li>Place the flag by its distance from the left and front edges, and say what surrounds the green.</li><li>Aim at the cross in the picture. It is often not the flag.</li>'}</ol>
    ${cs.length ? `<div class="frow"><label class="f">Fill from a hole<select id="aim-c" data-ch="aimCourse">${opt('', 'Choose a course', S.ui.aimCourse)}${cs.map(c => opt(c.id, c.name, S.ui.aimCourse)).join('')}</select></label>
      ${ac ? `<label class="f">Hole<select id="aim-h" data-ch="aimHole">${opt('', 'Choose a hole', S.ui.aimHole)}${ac.holes.map((x, i) => opt(i + 1, `${i + 1} · par ${x.par}`, S.ui.aimHole)).join('')}</select></label>` : ''}</div>` : ''}</section>`;
  const ztOpts = (cur, keys) => keys.map(k => opt(k, ZT[k], cur)).join('');
  if (mode === 'tee') {
    const t = S.ui.tee, bag = teeClubs(), chosen = bag.filter(c => t.clubs.includes(c.id)).slice(0, 3);
    const p = { len:+t.len || 0, fw:Math.max(5, +t.fw || 0), l1:Math.max(0, +t.l1 || 0), lType:t.lType, r1:Math.max(0, +t.r1 || 0), rType:t.rType };
    h += `<section class="card"><div class="frow"><label class="f">Hole length, yds<input id="t-len" type="text" inputmode="numeric" data-ch="tee" data-k="len" value="${esc(t.len)}"></label>
      <label class="f">Fairway width, yds<input id="t-fw" type="text" inputmode="numeric" data-ch="tee" data-k="fw" value="${esc(t.fw)}"></label></div>
      <div class="frow"><label class="f">Rough on the left, yds<input id="t-l1" type="text" inputmode="numeric" data-ch="tee" data-k="l1" value="${esc(t.l1)}"></label>
      <label class="f">Then, further left<select id="t-lt" data-ch="tee" data-k="lType">${ztOpts(t.lType, ['rgh','rec','snd','pen','ob'])}</select></label>
      <label class="f">Rough on the right, yds<input id="t-r1" type="text" inputmode="numeric" data-ch="tee" data-k="r1" value="${esc(t.r1)}"></label>
      <label class="f">Then, further right<select id="t-rt" data-ch="tee" data-k="rType">${ztOpts(t.rType, ['rgh','rec','snd','pen','ob'])}</select></label></div>
      <div class="chips"><span class="lbl">Compare up to 3 clubs</span>${bag.map(c => `<button class="chip" data-act="teeClub" data-v="${esc(c.id)}" aria-pressed="${t.clubs.includes(c.id)}">${esc(c.name)}</button>`).join('')}</div></section>`;
    if (p.len < 150 || !chosen.length) { lastTee = null; return h + `<p class="empty">Enter a hole of 150 yards or more and pick at least one club. For a par 3, use Approach.</p>`; }
    const res = chosen.map(c => ({ c, plan: E.teePlan(Object.assign({ total:+c.total || +c.carry, sigma:+c.lat || 15 }, p), b) })).sort((x, y) => x.plan.best.v - y.plan.best.v);
    lastTee = res;
    const w = res[0], nxt = res[1];
    h += `<section class="card"><p class="reco"><b>${esc(w.c.name)}, aimed at ${aimText(w.plan.best.a)}.</b> Expected score ${w.plan.best.v.toFixed(2)}, leaving about ${Math.round(w.plan.rem)} yds.${w.plan.best.a !== 0 ? ` Aiming at the centre instead costs ${(w.plan.center.v - w.plan.best.v).toFixed(2)} strokes.` : ''}${nxt ? ` ${esc(nxt.c.name)} at its best aim is ${(nxt.plan.best.v - w.plan.best.v).toFixed(2)} strokes worse.` : ''}</p>
      <div class="chartbox" id="teeBox">${teeSvg(res, p)}<div class="tip" id="teeTip" hidden></div></div>
      <div class="legend">${res.map((r, i) => `<span><i style="background:var(--c${i + 1})"></i>${esc(r.c.name)}</span>`).join('')}<span>Dot marks each club's best aim. Lower is better.</span></div>
      ${tbl(['Club','Best aim','Expected score','Fairway','Penalty or OB','Leaves','If aimed at centre'], res.map(r => [esc(r.c.name), r.plan.best.a === 0 ? 'Centre' : `${Math.abs(r.plan.best.a)} ${r.plan.best.a < 0 ? 'left' : 'right'}`, r.plan.best.v.toFixed(2), num(100 * r.plan.best.fw, 0) + '%', num(100 * r.plan.best.bad, 0) + '%', Math.round(r.plan.rem) + ' yds', r.plan.center.v.toFixed(2)]))}
      <div class="btnrow">${ac && S.ui.aimHole ? `<button class="btn sm" data-act="savePlan" data-club="${esc(w.c.id)}" data-aim="${esc('Aim ' + aimText(w.plan.best.a))}">Save to hole ${esc(S.ui.aimHole)} plan</button>` : ''}</div>
      <p class="sub">Model: a straight hole, a left-right pattern of ± ${w.c.lat} yds for ${esc(w.c.name)} (about 2 shots in 3 inside it), water costs one stroke and a drop in the rough 15 yds back, out of bounds is replayed from the tee.</p></section>`;
    return h;
  }
  const a = S.ui.ap, d = +a.dist || 0;
  const bag = S.settings.bag.filter(c => +c.carry > 0);
  const auto = bag.slice().sort((x, y) => Math.abs(x.carry - d) - Math.abs(y.carry - d))[0];
  const c = club(a.club) || auto, mult = a.lie === 'rgh' ? 1.25 : a.lie === 'snd' ? 1.4 : 1;
  const scale = c && c.carry ? Math.max(0.6, d / c.carry) : 1;
  const p = { gw:Math.max(8, +a.gw || 0), gd:Math.max(8, +a.gd || 0), px:+a.px || 0, py:+a.py || 0, left:a.left, right:a.right, short:a.short, long:a.long,
    sx: Math.max(2, (c ? +c.lat || 10 : 10) * mult * scale), sy: Math.max(2, (c ? +c.depth || 9 : 9) * mult * scale) };
  p.px = Math.min(p.gw, Math.max(0, p.px)); p.py = Math.min(p.gd, Math.max(0, p.py));
  h += `<section class="card"><div class="frow"><label class="f">Distance to the flag, yds<input id="a-dist" type="text" inputmode="numeric" data-ch="ap" data-k="dist" value="${esc(a.dist)}"></label>
    <label class="f">Lie<select id="a-lie" data-ch="ap" data-k="lie">${['tee','fwy','rgh','snd'].map(l => opt(l, E.LIES[l], a.lie)).join('')}</select></label>
    <label class="f">Club<select id="a-club" data-ch="ap" data-k="club">${opt('', auto ? `Auto: ${auto.name}` : 'Auto', a.club)}${bag.map(x => opt(x.id, x.name, a.club)).join('')}</select></label></div>
    <div class="frow"><label class="f">Green width, yds<input id="a-gw" type="text" inputmode="numeric" data-ch="ap" data-k="gw" value="${esc(a.gw)}"></label>
    <label class="f">Green depth, yds<input id="a-gd" type="text" inputmode="numeric" data-ch="ap" data-k="gd" value="${esc(a.gd)}"></label>
    <label class="f">Flag from left edge, yds<input id="a-px" type="text" inputmode="numeric" data-ch="ap" data-k="px" value="${esc(a.px)}"></label>
    <label class="f">Flag from front edge, yds<input id="a-py" type="text" inputmode="numeric" data-ch="ap" data-k="py" value="${esc(a.py)}"></label></div>
    <div class="frow">${[['left','Left of the green'],['right','Right'],['short','Short'],['long','Long']].map(([k, l]) => `<label class="f">${l}<select id="a-${k}" data-ch="ap" data-k="${k}">${ztOpts(a[k], ['fwy','rgh','snd','pen','ob'])}</select></label>`).join('')}</div></section>`;
  if (d < 20) return h + `<p class="empty">Enter the distance to the flag.</p>`;
  const res = E.approachPlan(p, b), bst = res.best, dx = bst.ax - p.px, dy = bst.ay - p.py;
  const where = (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) ? 'straight at the flag' : [Math.abs(dx) >= 0.5 && `${Math.abs(dx)} yds ${dx < 0 ? 'left' : 'right'} of the flag`, Math.abs(dy) >= 0.5 && `${Math.abs(dy)} yds ${dy < 0 ? 'short of' : 'past'} it`].filter(Boolean).join(' and ');
  const start = E.expected(a.lie, d, b);
  h += `<div class="cols"><section class="card"><p class="reco"><b>Aim ${where}.</b> Expected ${bst.v.toFixed(2)} strokes to hole out, against ${res.pin.v.toFixed(2)} when you aim at the flag${res.pin.v - bst.v > 0.004 ? `. That saves ${(res.pin.v - bst.v).toFixed(2)} strokes per shot` : ''}.</p>
    ${tbl(['','Suggested aim','At the flag'], [['Expected strokes', bst.v.toFixed(2), res.pin.v.toFixed(2)], ['On the green', num(100 * bst.green, 0) + '%', num(100 * res.pin.green, 0) + '%'], ['In sand', num(100 * bst.sand, 0) + '%', num(100 * res.pin.sand, 0) + '%'], ['Water or OB', num(100 * bst.bad, 0) + '%', num(100 * res.pin.bad, 0) + '%']])}
    <p class="sub">Pattern used: ± ${num(p.sx, 0)} yds left-right and ± ${num(p.sy, 0)} yds long-short with ${c ? esc(c.name) : 'this club'}${mult > 1 ? `, widened ${Math.round((mult - 1) * 100)}% for the ${E.LIES[a.lie].toLowerCase()}` : ''}. The benchmark expects ${start.toFixed(2)} strokes from here.</p>
    <div class="btnrow">${ac && S.ui.aimHole ? `<button class="btn sm" data-act="savePlan" data-club="${esc(c ? c.id : '')}" data-aim="${esc(`Flag ${a.px} from left, ${a.py} on: aim ${where}`)}">Save to hole ${esc(S.ui.aimHole)} plan</button>` : ''}</div></section>
    <section class="card"><div class="chartbox">${greenSvg(p, res)}</div><p class="sub">You are hitting from the bottom of the picture. Cross: suggested aim. Solid ring: about 2 shots in 3 finish inside it. Dashed ring: nearly all of them.</p></section></div>`;
  return h;
}

/* ---------- Expectations ---------- */
function vExpect() {
  const b = base(), bn = E.BASES[b], c = S.ui.calc, lie = S.ui.expLie;
  const e0 = E.expected(c.l0, +c.d0 || 0, b), e1 = c.holed ? 0 : E.expected(c.l1, +c.d1 || 0, b), sg = e0 - e1 - 1 - (+c.pen || 0);
  let h = `<section class="card"><h2 class="h2">Shot calculator</h2><p class="sub">Strokes gained for one shot against the ${esc(bn)} benchmark: expected strokes before, minus expected strokes after, minus the stroke you played.</p>
    <div class="frow"><label class="f">From<select id="k-l0" data-ch="calc" data-k="l0">${Object.keys(E.LIES).map(l => opt(l, E.LIES[l], c.l0)).join('')}</select></label>
    <label class="f">${c.l0 === 'grn' ? 'Feet' : 'Yards'} to the hole<input id="k-d0" type="text" inputmode="decimal" data-ch="calc" data-k="d0" value="${esc(c.d0)}"></label>
    <label class="f">Finished<select id="k-l1" data-ch="calc" data-k="l1">${opt('holed', 'In the hole', c.holed ? 'holed' : c.l1)}${Object.keys(E.LIES).filter(l => l !== 'tee').map(l => opt(l, E.LIES[l], c.holed ? '' : c.l1)).join('')}</select></label>
    ${c.holed ? '' : `<label class="f">${c.l1 === 'grn' ? 'Feet' : 'Yards'} to the hole<input id="k-d1" type="text" inputmode="decimal" data-ch="calc" data-k="d1" value="${esc(c.d1)}"></label>`}
    <label class="f">Penalty strokes<select id="k-pen" data-ch="calc" data-k="pen">${[0, 1, 2].map(x => opt(x, x, c.pen)).join('')}</select></label></div>
    <div class="kv"><div><b>${e0.toFixed(2)}</b><span>Expected before</span></div><div><b>${e1.toFixed(2)}</b><span>Expected after</span></div><div><b>${fmt(sg)}</b><span>Strokes gained</span></div></div></section>`;
  const pr = [3, 4, 5, 6, 8, 10, 15, 20, 30, 40, 60];
  h += `<div class="cols"><section class="card"><h3 class="h3">Putting: average putts to hole out</h3>${tbl(['Feet'].concat(BK.map(b => HL[b])), pr.map(f => [f, ...BK.map(k => E.expected('grn', f, k).toFixed(2))]))}</section>
    <section class="card"><h3 class="h3">Putting: share of putts made</h3>${tbl(['Feet'].concat(BK.map(b => HL[b])), E.BANDS.map(([lo, hi], i) => [hi > 900 ? `${lo}+` : `${lo}–${hi}`, ...BK.map(k => E.MAKE[k][i] + '%')]))}<p class="src">Amateur columns: Shot Scope. Tour column is approximate.</p></section></div>`;
  const ds = lie === 'tee' ? [120, 140, 160, 180, 200, 220, 320, 360, 400, 440, 480, 520, 560] : [10, 20, 30, 50, 75, 100, 125, 150, 175, 200, 225, 250];
  h += `<section class="card"><div class="btnrow"><h3 class="h3">Expected strokes to hole out</h3><span class="grow"></span>${seg('expLie', lie, [['tee','Tee'],['fwy','Fairway'],['rgh','Rough'],['snd','Sand'],['rec','Recovery']])}</div>
    ${tbl(['Yards'].concat(BK.map(b => HL[b]), [`Break-even vs ${bn}`]), ds.map(d => { const be = E.breakEven(lie, d, b); return [d, ...BK.map(k => E.expected(lie, d, k).toFixed(2)), be.any ? 'Anywhere on the green' : be.ft < 1 ? 'Hole it' : `Inside ${num(be.ft, 0)} ft`]; }))}
    <p class="sub">Break-even is the result that gains exactly zero strokes. Leave it closer than that and the shot beat the benchmark. From long range the answer is often anywhere on the green, which is why the middle of the green is a good target.</p></section>`;
  h += `<section class="card"><h3 class="h3">Where these numbers come from</h3><p class="sub">Tour column: Mark Broadie's published PGA Tour baseline (Every Shot Counts, 2004 to 2012 ShotLink data). The handicap columns are estimates: the Tour value plus an offset by lie and distance, fitted to Shot Scope's published amateur data (make percentage by putt length, strokes to finish from 100 yards, up-and-down rate and average score by par). The 5 and 20 handicap columns are built from the scratch, 10 and 15 ones and checked against Shot Scope's 2026 average scores on par 3s, 4s and 5s. Treat amateur values as good to about a tenth of a stroke. Comparing two of your own options on the same hole is less sensitive to the benchmark than the totals are.</p></section>`;
  return h;
}

/* ---------- Guide: sandboxes and practice mode ---------- */
const LAB_FIN = ['fwy','rgh','snd','rec','grn'];
const CATN = { ott:'Off the tee', app:'Approach', arg:'Around green', putt:'Putting' };
const labRange = l => l === 'grn' ? { min:1, max:90, unit:'ft' } : l === 'tee' ? { min:100, max:600, unit:'yds' } : { min:1, max:350, unit:'yds' };
const labFit = (lie, d, was) => { const r = labRange(lie); if ((lie === 'grn') !== (was === 'grn')) return lie === 'grn' ? 30 : lie === 'tee' ? 400 : 20; return Math.max(r.min, Math.min(r.max, +d || r.min)); };
const AB = [
  { t:'Driver in the rough or 3-wood in the fairway', par:4, yards:391, an:'Driver into the rough', bn:'3-wood into the fairway',
    A:[['rgh',121],['grn',35],['grn',4],['holed']], B:[['fwy',148],['grn',35],['grn',4],['holed']] },
  { t:'Out of bounds or a safe miss', par:4, yards:409, an:'Tee shot out of bounds', bn:'Tee shot into the trees',
    A:[['ob'],['fwy',150],['grn',25],['grn',2],['holed']], B:[['rec',170],['fwy',60],['grn',12],['grn',2],['holed']] },
  { t:'At the flag or the middle of the green', par:4, yards:366, an:'At the flag, into the bunker', bn:'Middle of the green',
    A:[['fwy',128],['snd',12],['grn',15],['grn',2],['holed']], B:[['fwy',128],['grn',35],['grn',3],['holed']] },
  { t:'Two putts or three', par:3, yards:155, an:'Lag to 3 feet', bn:'Lag to 9 feet',
    A:[['grn',40],['grn',3],['holed']], B:[['grn',40],['grn',9],['grn',2],['holed']] },
  { t:'Lay up or go for it', par:5, yards:500, an:'Lay up to 85 yards', bn:'Go for it, miss the green',
    A:[['fwy',240],['fwy',85],['grn',18],['grn',2],['holed']], B:[['fwy',240],['rgh',25],['grn',10],['holed']] }
];
function loadAb(i) {
  const p = AB[i] || AB[0], rows = xs => xs.map(([l, d]) => ({ l, d: d || 0, p: l === 'ob' ? 1 : 0 }));
  S.ui.lab.ab = { i, par:p.par, yards:p.yards, A:rows(p.A), B:rows(p.B) };
}
S.ui.lab = { one:{ l0:'fwy', d0:141, l1:'grn', d1:42, pen:0 }, aim:{ sigma:22, fw:30, rough:8, lType:'rec', rType:'ob', len:400, total:270 }, ab:null };
loadAb(0);

function practiceOn() {
  if (practice) return;
  practice = JSON.stringify({ settings:S.settings, courses:S.courses, rounds:S.rounds });
  S.ui.confirm = null; render();
}
function practiceOff() {
  if (!practice) return;
  const j = JSON.parse(practice); practice = null;
  S.settings = j.settings; S.courses = j.courses; S.rounds = j.rounds;
  Object.assign(S.ui, { roundId:null, pad:null, editShot:null, confirm:null, imp:null, backup:'', openHole:null, editCard:false, nr:{} });
  if (!courseById(S.ui.statCourse)) S.ui.statCourse = 'all';
  if (!courseById(S.ui.courseId)) S.ui.courseId = null;
  if (!courseById(S.ui.aimCourse)) { S.ui.aimCourse = ''; S.ui.aimHole = ''; }
  ['s','c','r'].forEach(k => { const sn = held[k]; delete held[k]; if (sn) { try { if (k === 'r') mergeRounds(sn); else mergeDoc(k, sn); } catch (e) { /* the next account update brings this in line */ } } });
  saveLocal();
  if (S.dirty.s) pushSettings();
  if (S.dirty.c) pushCourses();
  Object.keys(S.dirty.r).forEach(pushRound);
  render();
}

function lab1Svg() {
  const o = S.ui.lab.one, b = base(), holed = o.l1 === 'holed', fl = holed ? 'grn' : o.l1, r = labRange(fl);
  const e0 = E.expected(o.l0, o.d0, b), f = d => e0 - E.expected(fl, d, b) - 1 - o.pen, top = e0 - 1 - o.pen;
  const W = chartW(), H = 220, L = 46, R = 14, T = 14, B = 42, iw = W - L - R, ih = H - T - B, N = 90, pts = [];
  for (let i = 0; i <= N; i++) { const d = r.min + (r.max - r.min) * i / N; pts.push([d, f(d)]); }
  let lo = Math.min(0, ...pts.map(p => p[1])), hi = Math.max(0, top, ...pts.map(p => p[1]));
  const step = hi - lo <= 1.3 ? 0.25 : hi - lo <= 2.6 ? 0.5 : 1;
  lo = Math.floor(lo / step - 1e-9) * step; hi = Math.ceil(hi / step + 1e-9) * step;
  const X = d => L + (d - r.min) / (r.max - r.min) * iw, Y = v => T + (hi - v) / (hi - lo) * ih;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Strokes gained by how far the shot finishes from the hole">`;
  for (let v = lo; v <= hi + 1e-9; v += step) s += `<line class="${Math.abs(v) < 1e-9 ? 'zero-l' : 'grid-l'}" x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text x="${L - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${fmt(v, step < 0.5 ? 2 : 1)}</text>`;
  (fl === 'grn' ? [1, 15, 30, 45, 60, 75, 90] : [1, 50, 100, 150, 200, 250, 300, 350]).forEach(d => { s += `<text x="${X(d).toFixed(1)}" y="${H - B + 16}" text-anchor="middle">${d}</text>`; });
  s += `<text x="${L + iw / 2}" y="${H - 6}" text-anchor="middle">${fl === 'grn' ? 'Feet' : 'Yards'} left to the hole, finishing ${fl === 'grn' ? 'on the green' : 'in ' + FROM[fl]}</text>`;
  s += `<path class="ln sn-line" d="${pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join('')}"/>`;
  const cx = holed ? X(r.min) : X(Math.max(r.min, Math.min(r.max, o.d1))), v = holed ? top : f(o.d1), right = cx > W - 110;
  s += `<circle class="mk ${v >= 0 ? 'f-gain' : 'f-loss'}" cx="${cx.toFixed(1)}" cy="${Y(v).toFixed(1)}" r="6"/><text class="halo" x="${(right ? cx - 11 : cx + 11).toFixed(1)}" y="${(Y(v) + (Y(v) < T + 16 ? 16 : -9)).toFixed(1)}" text-anchor="${right ? 'end' : 'start'}">${holed ? 'Holed ' : ''}${fmt(v)}</text>`;
  return s + `</svg>`;
}
function lab1Out() {
  const o = S.ui.lab.one, b = base(), holed = o.l1 === 'holed';
  const row = k => { const e0 = E.expected(o.l0, o.d0, k), e1 = holed ? 0 : E.expected(o.l1, o.d1, k); return { e0, e1, sg: e0 - e1 - 1 - o.pen }; };
  const me = row(b), fl = holed ? 'grn' : o.l1;
  return `<p class="eq"><b>${me.e0.toFixed(2)}</b> expected before <span>−</span> <b>${me.e1.toFixed(2)}</b> expected after <span>−</span> <b>1</b> stroke played${o.pen ? ` <span>−</span> <b>${o.pen}</b> penalty` : ''} <span>=</span> ${sgChip(me.sg)}</p>
    ${tbl(['Benchmark','Before','After','Gained'], Object.keys(E.BASES).map(k => { const x = row(k); return [k === b ? `<b>${E.BASES[k]}</b>` : E.BASES[k], x.e0.toFixed(2), x.e1.toFixed(2), sgChip(x.sg)]; }))}
    <div class="chartbox">${lab1Svg()}</div>
    <p class="sub">The line is this shot's strokes gained for every distance it could finish at ${fl === 'grn' ? 'on the green' : 'in ' + FROM[fl]}. The dot is the result you set. Where the line crosses zero is the break-even result. The table scores the same shot against each benchmark, with yours in bold: expected strokes before, expected strokes after, and strokes gained.</p>`;
}
function lab3Out() {
  const a = S.ui.lab.aim, p = { fw:a.fw, l1:a.rough, r1:a.rough, lType:a.lType, rType:a.rType };
  const plan = E.teePlan(Object.assign({ len:a.len, total:a.total, sigma:a.sigma }, p), base()), b = plan.best;
  return `<p class="reco"><b>Aim at ${aimText(b.a)}.</b> Expected score ${b.v.toFixed(2)}. ${b.a !== 0 ? `Aiming at the centre instead costs ${(plan.center.v - b.v).toFixed(2)} strokes.` : 'Nothing is gained by aiming away from the centre.'}</p>
    <div class="kv"><div><b>${num(100 * b.fw, 0)}%</b><span>Fairways hit</span></div><div><b>${num(100 * b.bad, 0)}%</b><span>Water or out of bounds</span></div><div><b>${Math.round(plan.rem)}</b><span>Yards left</span></div><div><b>${num(100 * plan.center.bad, 0)}%</b><span>Water or OB if aimed at centre</span></div></div>
    <div class="chartbox">${teeSvg([{ c:{ name:'Tee shot', lat:a.sigma }, plan }], p)}</div>
    <p class="sub">The line is the expected score for each aim point, and the dot is the lowest. The strip under it shows what lies across the hole.</p>`;
}
function labHole(par, yards, rows) {
  const shots = []; let cur = { lie:'tee', d:yards }, done = false;
  for (const r of rows) {
    if (done) break;
    const s = { lie:cur.lie, d:cur.d }, p = r.l === 'ob' ? Math.max(1, +r.p || 0) : (+r.p || 0);
    if (p) s.p = p;
    shots.push(s);
    if (r.l === 'holed') done = true; else if (r.l !== 'ob') cur = { lie:r.l, d: +r.d > 0 ? +r.d : 1 };
  }
  const h = { par, yards, shots, done };
  if (!done) h.next = { lie:cur.lie, d:cur.d };
  return h;
}
function abSide(key, name) {
  const a = S.ui.lab.ab, rows = a[key], h = labHole(a.par, a.yards, rows), x = E.analyzeHole(h, base(), opts());
  const body = h.shots.map((s, i) => {
    const r = rows[i], sx = x.shots[i], at = `data-ch="abRow" data-s="${key}" data-i="${i}"`, off = r.l === 'holed' || r.l === 'ob', e1 = sx.e1 == null ? '–' : sx.e1.toFixed(2);
    return `<div class="abrow"><span class="ab-n num">${i + 1}</span><span class="ab-from">${posText(s.lie, s.d)}</span>
      <div class="ab-fin"><span class="cap">Finished</span><select id="ab-${key}-l-${i}" ${at} data-k="l" aria-label="Where shot ${i + 1} finished">${LAB_FIN.map(l => opt(l, E.LIES[l], r.l)).join('')}${opt('holed', 'In the hole', r.l)}${opt('ob', 'Out of bounds, replay', r.l)}</select></div>
      <div class="ab-left"><span class="cap">Left</span>${off ? '<span class="ab-na">–</span>' : `<span class="ab-in"><input id="ab-${key}-d-${i}" type="text" inputmode="decimal" ${at} data-k="d" value="${esc(r.d)}" aria-label="Distance left after shot ${i + 1}"><i>${r.l === 'grn' ? 'ft' : 'yd'}</i></span>`}</div>
      <div class="ab-pen"><span class="cap">Penalty</span>${r.l === 'holed' ? '<span class="ab-na">–</span>' : `<select id="ab-${key}-p-${i}" ${at} data-k="p" aria-label="Penalty strokes on shot ${i + 1}">${[0, 1, 2].map(n => opt(n, n ? '+' + n : 'None', s.p || 0)).join('')}</select>`}</div>
      <span class="ab-exp num">${e1}</span><span class="ab-cat">${CATN[sx.cat]}</span><span class="ab-sg">${sgChip(sx.sg)}</span>
      <span class="ab-meta">${CATN[sx.cat]}${sx.e1 == null ? '' : ` · benchmark needs ${e1} from there`}</span></div>`;
  }).join('');
  const flags = [];
  if (x.done) {
    if (a.par >= 4) flags.push(x.fir ? 'Fairway hit' : 'Fairway missed');
    flags.push(x.gir ? 'Green in regulation' : 'Green missed');
    const t5 = T5(opts()).filter((_, i) => x.t5[i]);
    flags.push(t5.length ? 'Tiger 5 mistake: ' + t5.join(', ').toLowerCase() : 'No Tiger 5 mistake');
  }
  const html = `<h3 class="h3">Plan ${key}: ${esc(name)}</h3>
    <div class="ablist"><div class="abhead"><span>Shot</span><span>Hit from</span><span>Finished</span><span>Left</span><span>Penalty</span><span class="r">Expected from there</span><span>Counts as</span><span class="r">Strokes gained</span></div>${body}</div>
    <div class="kv"><div><b>${x.done ? x.score : '–'}</b><span>Score</span></div><div><b>${fmt(x.sg.tot)}</b><span>Strokes gained</span></div><div><b>${fmt(x.sg.ott)}</b><span>Off the tee</span></div><div><b>${fmt(x.sg.app)}</b><span>Approach</span></div><div><b>${fmt(x.sg.arg)}</b><span>Around green</span></div><div><b>${fmt(x.sg.putt)}</b><span>Putting</span></div></div>
    ${x.done ? `<p class="sub">${flags.join(' · ')}</p>` : `<p class="note">This plan isn't finished. Set its last shot to In the hole, or add the shot that goes in.</p>`}
    <div class="btnrow"><button class="btn ghost sm" data-act="abAdd" data-s="${key}">Add a shot</button><button class="btn ghost sm" data-act="abDel" data-s="${key}">Remove a shot</button>${x.done ? '' : `<button class="btn sm" data-act="abHole" data-s="${key}">Add the shot that goes in</button>`}</div>`;
  return { html, x };
}
function abDiff(A, B) {
  if (!A.done || !B.done) return '';
  const ds = B.score - A.score, n = Math.abs(ds);
  const parts = [['ott','off the tee'],['app','approach'],['arg','around the green'],['putt','putting']].map(([k, t]) => ({ t, v: B.sg[k] - A.sg[k] })).filter(p => Math.abs(p.v) > 0.004).sort((p, q) => Math.abs(q.v) - Math.abs(p.v));
  return `<p class="reco"><b>${ds === 0 ? 'Both plans make the same score, so the totals match.' : `Plan ${ds < 0 ? 'B' : 'A'} is ${n} stroke${n > 1 ? 's' : ''} better, and gains exactly ${n}.00 more.`}</b> ${parts.length ? `Plan B minus Plan A by part of the game: ${parts.map(p => `${p.t} ${fmt(p.v)}`).join(', ')}.` : ''}</p>
    <p class="sub">A hole's total is always the benchmark's expected score from the tee minus your score. What differs between two plans is which shots take the credit or the blame, and that is what the stats tables add up.</p>`;
}
function vGuide() {
  const L = S.ui.lab, o = L.one, a = L.aim, ab = L.ab, bn = E.BASES[base()], holed = o.l1 === 'holed', r0 = labRange(o.l0), r1 = labRange(holed ? 'grn' : o.l1);
  const rng = (lab, k, label, v, r, unit) => `<label class="rng"><span>${label}</span><input type="range" id="${lab}-${k}" min="${r.min}" max="${r.max}" step="1" value="${v}" data-in="${lab}" data-k="${k}"><output id="${lab}-${k}v">${v} ${unit}</output></label>`;
  const zt = cur => ['rgh','rec','snd','pen','ob'].map(k => opt(k, ZT[k], cur)).join('');
  const preset = AB[ab.i] || AB[0], A = abSide('A', preset.an), B = abSide('B', preset.bn);
  let h = `<section class="card"><h2 class="h2">Guide</h2><p class="sub">Three sandboxes for seeing how each input moves the numbers, then a practice mode for trying things in the rest of the app. Nothing on this page touches your rounds. Everything here is measured against the ${esc(bn)} benchmark: change it in the header and every number moves with it.</p></section>`;

  h += mapGuide();
  h += `<section class="card"><h2 class="h2">One shot</h2>
    <p class="sub">A shot's strokes gained is what the benchmark expected before it, minus what it expects after, minus the stroke you played. Set a shot and drag the sliders.</p>
    <div class="chips"><span class="lbl">Hit from</span>${lieChips('lab1L0', o.l0)}</div>
    ${rng('lab1', 'd0', 'Distance to the hole', o.d0, r0, r0.unit)}
    <div class="chips"><span class="lbl">Finished</span><button type="button" class="chip" data-act="lab1L1" data-v="holed" aria-pressed="${holed}"><span class="liedot z-hole"></span>In the hole</button>${lieChips('lab1L1', o.l1, '', LAB_FIN)}</div>
    ${holed ? '' : rng('lab1', 'd1', 'Distance left', o.d1, r1, r1.unit)}
    <div class="chips"><span class="lbl">Penalty strokes</span>${seg('lab1Pen', String(o.pen), [['0','None'],['1','+1'],['2','+2']])}</div>
    <div id="lab1-out">${lab1Out()}</div>
    <ul class="how"><li>Keep the same result and switch Hit from between Fairway and Rough. The shot is worth more from the rough, because less was expected of it.</li>
    <li>Switch Finished from Green to Sand at a short distance. The gap is what the bunker costs.</li>
    <li>Add a penalty stroke. The result drops by exactly 1.</li></ul></section>`;

  h += `<section class="card"><h2 class="h2">Two ways to play a hole</h2>
    <p class="sub">Each row is one shot: where it finished and how far it had left, the same things you enter in a round. Pick a starting pair, then change anything. Expected from there is how many strokes the benchmark needs from that spot, which is the fair way to compare two positions.</p>
    <div class="chips">${AB.map((p, i) => `<button type="button" class="chip" data-act="abPreset" data-i="${i}" aria-pressed="${ab.i === i}">${esc(p.t)}</button>`).join('')}</div>
    <div class="frow"><label class="f">Par<select id="ab-par" data-ch="abHole" data-k="par">${[3, 4, 5].map(n => opt(n, n, ab.par)).join('')}</select></label>
    <label class="f">Hole length, yds<input id="ab-yards" type="text" inputmode="numeric" data-ch="abHole" data-k="yards" value="${esc(ab.yards)}"></label></div>
    ${A.html}${B.html}${abDiff(A.x, B.x)}</section>`;

  h += `<section class="card"><h2 class="h2">Your pattern and the aim</h2>
    <p class="sub">The wider your shots scatter, the further from trouble the best aim sits. Drag the first slider and watch the aim move. The hole has ${a.rough} yards of rough on each side of the fairway.</p>
    ${rng('lab3', 'sigma', 'Left-right pattern, ±', a.sigma, { min:8, max:40 }, 'yds')}
    ${rng('lab3', 'fw', 'Fairway width', a.fw, { min:15, max:60 }, 'yds')}
    ${rng('lab3', 'total', 'Tee shot distance', a.total, { min:150, max:320 }, 'yds')}
    ${rng('lab3', 'len', 'Hole length', a.len, { min:340, max:600 }, 'yds')}
    <div class="frow"><label class="f">Beyond the rough on the left<select id="lab3-lt" data-ch="lab3Sel" data-k="lType">${zt(a.lType)}</select></label>
    <label class="f">Beyond the rough on the right<select id="lab3-rt" data-ch="lab3Sel" data-k="rType">${zt(a.rType)}</select></label></div>
    <div id="lab3-out">${lab3Out()}</div>
    <ul class="how"><li>Widen the pattern from 15 to 35 yards. The aim moves away from the out of bounds and the expected score climbs.</li>
    <li>Change the right side from Out of bounds to Trees. The aim comes back toward the centre, because a miss there costs less.</li>
    <li>Shorten the tee shot to 3-wood distance. Compare the expected score with the driver's before you decide a shorter club is safer.</li></ul></section>`;

  h += `<section class="card"><h2 class="h2">Practice mode</h2>
    <p class="sub">For trying things in the rest of the app with your real data. While it is on, nothing you change is saved: log shots, edit old rounds, delete rounds, change your bag, import a workbook. Turn it off, or close the app, and your data is exactly as you left it.</p>
    <div class="btnrow">${practice ? `<button class="btn" data-act="practiceOff">Leave practice mode</button><span class="sub">Practice mode is on. Your changes will be discarded.</span>` : `<button class="btn flag" data-act="practiceOn">Start practice mode</button>`}</div>
    <h3 class="h3">Things to try while it is on</h3>
    <ul class="how"><li>In Rounds, open a round you logged shot by shot, tap a shot and change where it finished. That shot's number and the next shot's move in opposite directions.</li>
    <li>Add a penalty to any shot. Its number drops by exactly 1.00, and so does the round total.</li>
    <li>Switch the benchmark in the header from 10 handicap to PGA Tour. Every strokes-gained number gets lower. Your score, greens, fairways and putts stay the same.</li>
    <li>In Setup, raise "Around the green starts inside" from 50 to 80. In Stats, shots from 50 to 80 yards move from Approach to Around green.</li>
    <li>In Setup, widen the Driver's ± left-right. In Aim, the suggested aim moves further from the trouble.</li>
    <li>Delete a round, then look at Stats and at that course's holes in Courses. Leave practice mode and the round is back.</li></ul></section>`;

  const ref = [
    ['Where the shot finished', 'Shot pad', 'Strokes gained for that shot and the next one, the fairway and green counts, and which part of the game the next shot belongs to.'],
    ['Distance left', 'Shot pad', 'Strokes gained for that shot and the next one. Yards off the green, feet on it.'],
    ['Club', 'Shot pad', 'Which row the shot lands in on the by-club tables in Stats, the From your rounds column and the Measured on the course table in Setup. It never changes strokes gained. The pad starts on a suggested club (the hole plan, else the distance), so change it whenever you hit something else.'],
    ['Missed left, right, short, long', 'Shot pad', "The miss percentages for tee shots. It never changes strokes gained."],
    ['Penalty', 'Shot pad', "One stroke off that shot's strokes gained for each penalty stroke, plus your score and the penalty count."],
    ['Holed it', 'Shot pad', 'Ends the hole. Sets the score and scores the last shot against zero strokes left.'],
    ['2 putts, 3 putts', 'Shot pad, on the green', "Ends the hole with that many putts from here. If the next putt's length is typed it is used; a putt with no length counts in the score and the putts, and its strokes gained is added to the putt before it. It has no row in Putting by length."],
    ['Hole plays X yards today', 'First shot of a hole', "The tee shot's strokes gained and the hole's total."],
    ['OB or lost: re-hit', 'Shot pad', 'Adds a penalty stroke and puts the ball back where it was, so that shot scores −2.00.'],
    ['Benchmark', 'Header', 'Every strokes-gained number. Scores, greens, fairways and putts do not change.'],
    ['Around the green starts inside', 'Setup', 'Which shots count as Approach and which as Around green.'],
    ['Tiger 5 scoring-club distance', 'Setup', 'Which bogeys count as a mistake with a scoring club in hand.'],
    ['Bag distances and ± pattern', 'Setup', 'The club the shot pad suggests (carry) and the Aim tools (carry, total and ±). Strokes gained and the stats do not use them. Saved on this device until you change them.'],
    ['What counts as a putt', 'Shot pad', 'Only a stroke played from the green. A stroke with the putter from the fringe or anywhere else off the green is logged from Fairway or Rough: it counts as around the green, not in your putts.'],
    [CARD ? 'Imported scorecards' : 'TheGrint rounds', 'Setup', 'Totals, greens, fairways, putts, penalties and hole history. They carry no split by part of the game, because they have no shot distances.']
  ];
  h += `<section class="card"><h2 class="h2">What each input changes</h2><div class="reflist">${ref.map(r => `<div class="refrow"><b>${r[0]}</b><span>${r[1]}</span><p>${r[2]}</p></div>`).join('')}</div></section>`;
  if (S.sync.state === 'local') h += `<section class="card"><h2 class="h2">Where your data lives</h2><p class="sub">Everything you enter stays on this device, inside this app. Nothing is sent anywhere and nothing syncs between devices. In Setup, save a backup file now and then: it is the only copy outside this device, and loading it on another device is how you move your rounds. Rounds shows a reminder whenever something has changed since the last backup file.</p></section>`;
  return h;
}

/* ---------- Setup ---------- */
function vSetup() {
  const st = S.settings, o = opts(), G = E.aggregate(statRounds(), base(), o), px = E.clubProx(G.recs, o);
  let h = vImport() + mapSetup() + `<section class="card" id="bagCard"><h2 class="h2">Your bag</h2><p class="sub">Your clubs and how far you hit them, in yards. Carry picks the club the shot pad suggests. The ± columns describe your shot pattern: about 2 shots in 3 finish within that many yards left or right, and long or short, of where you aimed. The aim tools use them.</p>
    <p class="sub" id="bagSaved">Each change is saved on this device as soon as you leave the box, and stays for every round until you change it again.</p>
    ${st.bagEstimated ? `<p class="note">These distances are estimates worked out from a 105 mph driver swing. Replace them with your simulator carries.</p>` : ''}
    ${tbl(['Club','Carry','Total','± left-right','± long-short','From your rounds',''], st.bag.map((c, i) => [`<input class="wide" id="bag-name-${i}" type="text" data-ch="bag" data-i="${i}" data-k="name" value="${esc(c.name)}" aria-label="Club name">`,
      ...['carry','total','lat','depth'].map(k => `<input id="bag-${k}-${i}" type="text" inputmode="numeric" data-ch="bag" data-i="${i}" data-k="${k}" value="${esc(c[k])}" aria-label="${k}, ${esc(c.name)}">`),
      px[c.id] && px[c.id].n >= 3 ? `± ${num(px[c.id].avg / 1.25, 0)} (${px[c.id].n} shots)` : '–',
      st.bag.length > 1 ? `<button type="button" class="btn ghost sm" data-act="delClub" data-i="${i}" aria-label="Remove ${esc(c.name)} from the bag">Remove</button>` : '']))}
    <div class="chips"><span class="lbl">Add a club</span>${CLUBS.filter(c => !st.bag.some(b => b.id === c.id)).map(c => `<button type="button" class="chip" data-act="addClub" data-v="${c.id}">+ ${esc(c.name)}</button>`).join('')}<button type="button" class="chip" data-act="addClub" data-v="">+ Custom club</button></div>
    <p class="sub">The shot pad shows the clubs in your bag, so keep it to the ones you carry. A club from this list comes with starting distances for you to replace.</p>
    <p class="sub">"From your rounds" turns the average distance your logged approach shots finish from the hole into a ± figure, once a club has 3 or more shots.</p></section>${gpsClubCard()}
    <section class="card"><h2 class="h2">Rules</h2><div class="frow"><label class="f">Around the green starts inside, yds<input id="set-arg" type="text" inputmode="numeric" data-ch="setNum" data-k="argYards" value="${esc(st.argYards)}"></label>
    <label class="f">Tiger 5 scoring-club distance, yds<input id="set-wedge" type="text" inputmode="numeric" data-ch="setNum" data-k="wedgeYards" value="${esc(st.wedgeYards)}"></label></div>
    <p class="sub">Shots from the tee on par 4s and 5s count as off the tee. Shots inside the first distance that are not on the green count as around the green. Everything else off the green, par-3 tee shots included, is approach.</p></section>
    <section class="card"><h2 class="h2">Backup</h2><p class="sub">Copy everything as text and keep it somewhere safe. To restore, paste a backup into the box and replace your data.</p>${backupFacts()}
    <textarea id="backup" data-in="backup" placeholder="Paste a backup here to restore it">${esc(S.ui.backup)}</textarea>
    <div class="btnrow"><button class="btn sm" data-act="copyBackup">Copy my data</button>${S.ui.confirm === 'restore' ? `<span>Replace all courses, rounds and settings with this backup?</span><button class="btn sm ghost danger" data-act="restore">Replace</button><button class="btn sm ghost" data-act="cancel">Keep mine</button>` : `<button class="btn sm ghost" data-act="ask" data-v="restore">Restore from pasted text</button>`}<span class="sub" id="backupMsg"></span></div>
    ${S.sync.state === 'local' && !(window.claude && typeof window.claude.use === 'function') ? `<div class="btnrow"><button class="btn sm ghost" data-act="saveBackupFile">Save a backup file</button><label class="f inline">Load a backup file<input type="file" id="bk-file" accept=".json,.txt,application/json,text/plain" data-ch="backupFile"></label></div>` : ''}</section>`;
  return h;
}

/* ---------- map, GPS and hole mapping ---------- */
const MAPS = typeof SLMap !== 'undefined';
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const STANDALONE = navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
const yds = n => String(Math.round(n));
const holeDef = h => { const c = courseById(h.cid); return c && c.holes[h.n - 1]; };
const geoOf = x => (MAPS && x && x.geo && SLMap.okPoly(x.geo.g)) ? x.geo : null;          // a hole is on the map once its green is outlined
const teeOf = (h, geo) => (h.tg && SLMap.ok(h.tg)) ? h.tg : (geo && SLMap.ok(geo.t) ? geo.t : null);
const pinOf = (h, geo) => (h.pin && SLMap.ok(h.pin)) ? h.pin : SLMap.centroid(geo.g);
const backTo = s => Object.assign({ lie:s.lie, d:s.d }, s.g ? { g:s.g } : {});          // the ball goes back to where a removed shot was hit from
/** Where the ball lies now, if the map knows: the last pin dropped, or the tee before the first shot. */
function spotOf(h, geo) { if (!h.shots.length) return teeOf(h, geo); const st = startPos(h); return st.g && SLMap.ok(st.g) ? st.g : null; }
const say = t => { const m = $('#markMsg') || $('#mapNote'); if (m) m.textContent = t; };
/** Courses that come with the app can bring their tee and green pins. A hole the golfer mapped is never overwritten. */
function mergeGeo() {
  const G = window.SL_GEO; if (!MAPS || !G || !G.courses) return;
  let ch = false;
  S.courses.list.forEach(c => {
    const b = G.courses[c.id]; if (!b) return;
    if (SLMap.ok(b.loc) && !SLMap.ok(c.loc)) { c.loc = b.loc; ch = true; }
    (b.holes || []).forEach((bg, i) => {
      const x = c.holes[i]; if (!x || !bg || !SLMap.okPoly(bg.g) || (x.geo && x.geo.u)) return;
      if (JSON.stringify(x.geo ? [x.geo.t, x.geo.g] : null) !== JSON.stringify([bg.t || null, bg.g])) { x.geo = { t:bg.t || null, g:bg.g }; ch = true; }
    });
  });
  if (ch) saveLocal();
}
/** The aim point and shot pattern for the shot about to be played. */
function aimState(r, hi, geo) {
  const a = S.ui.aim, h = r.holes[hi];
  if (!a || !a.on || a.key !== `${r.id}:${hi}:${h.shots.length}` || h.done || !SLMap.ok(a.from)) return null;
  const x = holeDef(h), plan = (x && x.plan) || {}, pin = pinOf(h, geo), c = SLMap.centroid(geo.g), from = a.from, toPin = SLMap.dist(from, pin);
  const lie = h.shots.length ? startPos(h).lie : 'tee', teeShot = lie === 'tee' && h.par >= 4;
  const bag = S.settings.bag.filter(k => +k.carry > 0); if (!bag.length) return null;
  const reach = k => +k.total || +k.carry;
  const auto = teeShot ? (bag.find(k => k.id === plan.club) || bag.slice().sort((p, q) => reach(q) - reach(p))[0]) : bag.slice().sort((p, q) => Math.abs(p.carry - toPin) - Math.abs(q.carry - toPin))[0];
  const k = bag.find(q => q.id === a.club) || auto, mult = lie === 'rgh' ? 1.25 : lie === 'snd' ? 1.4 : lie === 'rec' ? 1.5 : 1;
  const inReach = reach(k) >= toPin - 12, b = base();
  const cost = (on, d) => on ? E.expected('grn', Math.max(1, d * 3), b) : E.expected('rgh', Math.max(1, d), b);
  const size = pt => { const s = Math.max(0.6, SLMap.dist(from, pt) / (+k.carry || 1)); return [Math.max(2, (+k.lat || 10) * mult * s), Math.max(2, (+k.depth || 9) * mult * s)]; };
  let pt = SLMap.ok(a.pt) ? a.pt : null, res = null;
  if (inReach) {
    const [sx, sy] = size(pin);
    res = SLMap.bestAim({ from, green:geo.g, pin, sx, sy, cost });
    if (!pt) pt = res.pt;
  } else if (!pt) pt = (teeShot && SLMap.ok(plan.ag)) ? plan.ag : SLMap.r6(SLMap.dest(from, SLMap.bearing(from, c), Math.min(reach(k), Math.max(20, toPin - 20))));
  const [sx, sy] = size(pt), at = res ? res.score(pt) : null;
  return { from, pt, sx, sy, club:k, auto, lie, teeShot, inReach, d:SLMap.dist(from, pt), left:SLMap.dist(pt, pin), toPin, res, at, isBest: !!res && SLMap.dist(pt, res.pt) < 1.5, moved: SLMap.ok(a.pt) };
}
function aimBar(a) {
  const bag = S.settings.bag.filter(k => +k.carry > 0);
  let t = `<b>${esc(a.club.name)}</b> aimed ${yds(a.d)} yds away, leaving ${yds(a.left)} to the flag.`;
  if (a.res && a.at) t += ` ${num(100 * a.at.green, 0)}% of your shots finish on the green from this aim${a.isBest ? '' : `, against ${num(100 * a.res.green, 0)}% at the best spot`}.${a.isBest && a.res.pin.v - a.res.v > 0.004 ? ` It saves ${(a.res.pin.v - a.res.v).toFixed(2)} strokes a shot over aiming at the flag.` : ''}`;
  else t += ` Pattern: ± ${num(a.sx, 0)} yds left-right, ± ${num(a.sy, 0)} long-short.`;
  return `<div class="aimbar"><p class="reco">${t}</p>
    <div class="btnrow"><label class="f inline">Club<select id="aim-club" data-ch="aimClub">${bag.map(k => opt(k.id, k.name + (k.id === a.auto.id ? ' (suggested)' : ''), a.club.id)).join('')}</select></label>
    ${a.moved ? `<button type="button" class="btn ghost sm" data-act="aimBest">${a.inReach ? 'Best spot' : 'Reset aim'}</button>` : ''}${a.teeShot ? `<button type="button" class="btn ghost sm" data-act="aimSave">Save as this hole's plan</button>` : ''}</div>
    <p class="sub" id="mapNote">Drag the cross, or tap the photo, to move the aim. Solid ring: about 2 shots in 3 finish inside it. Dashed ring: nearly all of them. Turn Aim off to mark the ball.</p></div>`;
}
function playModel(r, hi) {
  const h = r.holes[hi], x = holeDef(h), geo = geoOf(x); if (!geo) return null;
  const tee = teeOf(h, geo), pin = pinOf(h, geo), p = S.ui.pad, a = aimState(r, hi, geo), good = q => q && SLMap.ok(q) ? q : null;
  // The ball's journey: tee, then where each shot finished. A putt nobody marked is skipped, so the line still runs to the flag.
  const pts = [tee], lab = [0], add = (q, lie, n) => { q = good(q); if (q || lie !== 'grn') { pts.push(q); lab.push(n); } };
  h.shots.forEach((s, i) => { if (i) add(s.g, s.lie, i); });
  if (h.done) { pts.push(pin); lab.push(0); } else if (h.shots.length && h.next) add(h.next.g, h.next.lie, h.shots.length);
  const dots = pts.map((q, k) => q && lab[k] > 0 ? [q, lab[k]] : null).filter(Boolean);
  return { key:`play:${r.id}:${hi}:${h.shots.length}:${h.done ? 1 : 0}`, mode:'play', fit: h.shots.length && !h.done ? 'shot' : 'hole', tee, teeDrag:!h.done, green:geo.g, flag:pin, flagDrag:!h.done, path:pts, dots,
    ball: !h.done && p && good(p.g), from: h.done ? null : spotOf(h, geo), aim: a ? { from:a.from, pt:a.pt, sx:a.sx, sy:a.sy } : null, planAim: !h.shots.length && x.plan ? good(x.plan.ag) : null, center: tee || pin };
}
function mapPanel(r, hi) {
  if (!MAPS) return '';
  const h = r.holes[hi], geo = geoOf(holeDef(h));
  if (!geo) return `<div class="note maphint"><span>Hole ${h.n} is not on the map yet. Mark its tee and green once to get distances and shot pins.</span><button type="button" class="btn ghost sm" data-act="mapEd" data-cid="${esc(h.cid)}" data-n="${h.n}" data-back="1">Map this hole</button></div>`;
  const a = aimState(r, hi, geo);
  return `<div class="fcb" id="fcb"></div><div class="mapwrap"><div class="mapslot" id="mapSlot"></div>
    <div class="maptools"><button type="button" data-act="mapView" data-v="hole">Hole</button><button type="button" data-act="mapView" data-v="green">Green</button><button type="button" data-act="mapView" data-v="me">Me</button>${h.done ? '' : `<button type="button" class="aimb" data-act="aimToggle" aria-pressed="${!!a}">Aim</button>`}<div class="gpsbar" id="gpsBar"></div></div></div>${a ? aimBar(a) : ''}`;
}
/** The numbers that move as you walk: written straight into the page on every GPS fix, without redrawing the screen. */
function liveMap() {
  const bar = $('#gpsBar'), g = MAPS && SLMap.gps; if (!bar || !g) return;
  const fx = SLMap.fresh();
  const tap = g.mode === 'tap', acc = fx ? `GPS<b>± ${yds(fx.acc * SLMap.YD)} yd</b>` : '';
  bar.innerHTML = !g.want ? `<button type="button" class="off" data-act="gpsOn">GPS off</button>` : g.err && !fx ? `<button type="button" class="bad" data-act="${tap ? 'gpsFix' : 'gpsOn'}" title="${esc(g.err)}">No GPS</button>`
    : tap ? `<button type="button" data-act="gpsFix" title="Battery saver: tap for a GPS position">${fx ? acc : 'Get GPS'}</button>` : fx ? `<span>${acc}</span>` : `<span>GPS<b>…</b></span>`;
  const box = $('#fcb'), r = curRound(), h = curHole(), geo = h && geoOf(holeDef(h)); if (!box || !geo) return;
  const c = SLMap.centroid(geo.g), near = fx && SLMap.dist(fx.ll, c) < 900, p = S.ui.pad;
  const from = near ? fx.ll : (!h.done && p && p.g) || (h.done ? null : spotOf(h, geo));
  if (!from) { box.innerHTML = ''; return; }
  const d = SLMap.fcb(from, geo.g), src = near ? 'from you' : (!h.done && p && p.g) ? 'from the pin' : h.shots.length ? 'from the ball' : 'from the tee';
  const cell = (l, v, cls) => `<span class="${cls || ''}"><i>${l}</i><b class="num">${v == null ? '–' : yds(v)}</b></span>`;
  box.innerHTML = `<div class="nums">${d.inside ? `<span class="on"><b>On the green</b></span>` : cell('Front', d.f) + cell('Centre', d.c, 'c') + cell('Back', d.b)}${h.pin && !d.inside ? cell('Flag', SLMap.dist(from, pinOf(h, geo)), 'fl') : ''}</div><em>${src}</em>`;
}
/** Drop the pin for where the ball finished and fill in what the map can tell: the distance left, and whether it is on the green. */
function setBall(ll) {
  const r = curRound(), h = curHole(); if (!r || !h || h.done) return;
  const geo = geoOf(holeDef(h)), p = padFor(r, S.ui.hole); if (!geo) return;
  p.g = ll; p.err = '';
  const d = SLMap.dist(ll, pinOf(h, geo));
  if (SLMap.inPoly(ll, geo.g)) { p.lie = 'grn'; p.d = ''; p.gft = Math.max(1, Math.round(d * 3)); }
  else { if (p.lie === 'grn') p.lie = 'fwy'; p.d = String(Math.max(1, Math.round(d))); p.gft = 0; }
  render();
}
/** Today's tee for this hole, in this round only: where the drive is measured from. On a par 3 it also sets what the hole plays. */
function setTee(r, h, geo, ll) {
  h.tg = ll;
  const a = S.ui.aim; if (a && a.on && a.src === 'spot' && !h.shots.length) { a.from = ll; a.pt = null; }
  if (h.shots.length) return 'Tee moved for this round.';
  if (h.par === 3) { const y = yds(SLMap.dist(ll, pinOf(h, geo))), p = padFor(r, S.ui.hole); p.d0 = y; resuggest(h, p); return `Tee moved for this round. The hole now plays ${y} yards.`; }
  return 'Tee moved for this round. If the hole plays longer or shorter today, change Hole plays below.';
}
const PLAY_H = {
  teeMove: ll => {
    const r = curRound(), h = curHole(), geo = h && geoOf(holeDef(h)); if (!geo || h.done) { render(); return; }
    const d = SLMap.dist(ll, SLMap.centroid(geo.g));
    if (d < 40 || d > 800) { render(); say('The tee has to stay on this hole, off the green.'); return; }
    const note = setTee(r, h, geo, ll); touchRound(S.ui.roundId); render(); say(note);
  },
  tap: ll => { const r = curRound(), h = curHole(); if (!r || !h || h.done) return; const a = S.ui.aim; if (a && a.on && a.key === `${r.id}:${S.ui.hole}:${h.shots.length}`) { a.pt = ll; render(); } else setBall(ll); },
  ballMove: ll => setBall(ll),
  aimMove: ll => { if (S.ui.aim) { S.ui.aim.pt = ll; render(); } },
  flagMove: ll => {
    const h = curHole(), geo = h && geoOf(holeDef(h)); if (!geo) return;
    if (SLMap.dist(ll, SLMap.centroid(geo.g)) > 45) { render(); say('The flag has to stay on the green.'); return; }
    h.pin = ll;
    if (!h.shots.length && h.par === 3 && h.tg) { const p = padFor(curRound(), S.ui.hole); p.d0 = yds(SLMap.dist(h.tg, ll)); resuggest(h, p); }          // a par 3 with today's tee marked plays tee to flag
    touchRound(S.ui.roundId);
    const p = S.ui.pad; if (p && p.g) setBall(p.g); else render();
  },
  note: t => say(t)
};
function editHole() { const ed = S.ui.mapEd, c = ed && courseById(ed.cid); return c && c.holes[ed.n - 1] ? { ed, c, x:c.holes[ed.n - 1] } : null; }
function editModel() {
  const e = editHole(); if (!e) return null;
  const { ed, c, x } = e, geo = x.geo || {}, prev = geoOf(c.holes[ed.n - 2]), any = c.holes.map(geoOf).find(Boolean), built = (window.SL_GEO && window.SL_GEO.courses && window.SL_GEO.courses[c.id]) || {};
  const center = (SLMap.ok(geo.t) && geo.t) || (prev && SLMap.centroid(prev.g)) || (any && SLMap.centroid(any.g)) || (SLMap.ok(c.loc) && c.loc) || (SLMap.ok(built.loc) && built.loc) || null;
  return { key:`edit:${c.id}:${ed.n}`, mode:'edit', tee: SLMap.ok(geo.t) ? geo.t : null, green: (geo.g || []).filter(SLMap.ok), center, centerZoom: prev ? 17.4 : 16.2 };
}
function editChange(fn) {
  const e = editHole(); if (!e) return;
  const geo = e.x.geo = Object.assign({ t:null, g:[] }, e.x.geo || {}); geo.g = geo.g || [];
  (e.ed.hist = e.ed.hist || []).push(JSON.stringify([geo.t, geo.g])); if (e.ed.hist.length > 40) e.ed.hist.shift();
  fn(geo, e); geo.u = 1;
  if (!SLMap.ok(e.c.loc)) e.c.loc = geo.t || geo.g[0] || null;
  touchCourses(); render();
}
const EDIT_H = {
  tap: ll => editChange((geo, e) => {
    if (e.ed.tool === 'tee') { geo.t = ll; if (geo.g.length < 3) e.ed.tool = 'green'; }
    else if (geo.g.length < 24) geo.g = SLMap.ringSort(geo.g.concat([ll]));
  }),
  teeMove: ll => editChange(geo => { geo.t = ll; }),
  vertMove: (i, ll) => editChange(geo => { if (geo.g[i]) { geo.g[i] = ll; geo.g = SLMap.ringSort(geo.g); } })
};
function vMapEd() {
  const e = editHole(); if (!e) { S.ui.mapEd = null; return vCourses(); }
  const { ed, c, x } = e, geo = x.geo || {}, g = (geo.g || []).filter(SLMap.ok), tee = SLMap.ok(geo.t) ? geo.t : null, okG = g.length >= 3;
  const card = c.tees.find(t => t.name === c.defaultTee) || c.tees[0] || { yards:[] }, yd0 = +card.yards[ed.n - 1] || 0, done = c.holes.filter(geoOf).length;
  let facts = '';
  if (okG) {
    const P = g.map(q => SLMap.toXY(g[0], q)), th = tee ? SLMap.bearing(tee, SLMap.centroid(g)) * Math.PI / 180 : 0, co = Math.cos(th), si = Math.sin(th);
    const ax = P.map(q => q[0] * co - q[1] * si), ay = P.map(q => q[0] * si + q[1] * co);
    facts = `The green measures about ${yds(Math.max(...ay) - Math.min(...ay))} yds deep and ${yds(Math.max(...ax) - Math.min(...ax))} wide.`;
    if (tee) { const line = SLMap.dist(tee, SLMap.centroid(g)); facts += ` Tee to the middle of the green is ${yds(line)} yds in a straight line${yd0 ? `; the card says ${yd0}` : ''}.${yd0 && (line > yd0 * 1.12 || line < yd0 * 0.7) ? ' That is far from the card: check that both pins are on the right hole.' : ''}`; }
  }
  return `<div class="rhead"><button class="btn ghost sm" data-act="mapEdClose">‹ ${ed.back ? 'Back to the round' : 'Courses'}</button>
    <div class="rtitle"><b>${esc(c.name)}</b><span>${done} of ${c.holes.length} holes on the map</span></div></div>
    <section class="card"><div class="holehead"><h2>Hole ${ed.n}</h2><span class="meta">Par ${x.par}${yd0 ? ` · ${yd0} yds` : ''}</span>
      <span class="nav"><button class="btn ghost sm" data-act="mapEdHole" data-n="${ed.n - 1}" ${ed.n > 1 ? '' : 'disabled'} aria-label="Previous hole">‹</button><button class="btn ghost sm" data-act="mapEdHole" data-n="${ed.n + 1}" ${ed.n < c.holes.length ? '' : 'disabled'} aria-label="Next hole">›</button></span></div>
    <div class="btnrow"><span class="lbl">Tapping the photo sets</span>${seg('mapTool', ed.tool, [['tee', tee ? 'Tee ✓' : 'Tee'], ['green', okG ? `Green edge ✓` : `Green edge${g.length ? ` (${g.length})` : ''}`]])}</div>
    <div class="mapwrap tall"><div class="mapslot" id="mapSlot"></div>
      <div class="maptools"><button type="button" data-act="mapView" data-v="hole">Hole</button><button type="button" data-act="mapView" data-v="me">Me</button><div class="gpsbar" id="gpsBar"></div></div></div>
    <p class="sub" id="mapNote">${ed.tool === 'tee' ? 'Find the hole on the photo, then tap its tee box. Drag the T to adjust.' : okG ? 'Drag any dot to adjust the outline, or tap to add a point.' : 'Zoom in on the green and tap around its edge: 6 to 10 points, in any order.'}</p>
    ${facts ? `<p class="note">${facts}</p>` : ''}
    <div class="btnrow">${(ed.hist || []).length ? `<button class="btn ghost sm" data-act="mapUndo">Undo</button>` : ''}${g.length ? `<button class="btn ghost sm" data-act="mapClearGreen">Clear the green</button>` : ''}
      <button class="btn ghost sm" data-act="mapHere" data-v="tee">Tee is where I stand</button><button class="btn ghost sm" data-act="mapHere" data-v="green">Green is where I stand</button><span class="grow"></span>
      ${ed.n < c.holes.length ? `<button class="btn flag" data-act="mapEdHole" data-n="${ed.n + 1}">Next hole ›</button>` : `<button class="btn flag" data-act="mapEdClose">Done</button>`}</div>
    <p class="sub">On the course, the two "where I stand" buttons use GPS: one on the tee box, one in the middle of the green, which draws a rough circle you can tidy up at home.</p></section>`;
}
function liveEd() { const bar = $('#gpsBar'); if (bar && S.ui.mapEd) liveMap(); }
function mountMap() {
  if (!MAPS) return;
  const slot = $('#mapSlot'); if (!slot) { SLMap.hide(); return; }
  const ed = S.ui.view === 'courses' && S.ui.mapEd, r = curRound();
  const m = ed ? editModel() : (r ? playModel(r, S.ui.hole) : null);
  if (!m) { SLMap.hide(); return; }
  SLMap.show(slot, m, ed ? EDIT_H : PLAY_H); liveMap();
}
if (MAPS) SLMap.onGps(() => liveMap());
const hintSeen = () => { try { return localStorage.getItem('strokeLedger.hint') === '1'; } catch (e) { return true; } };
/** How far a shot went, when the map knows both where it was hit from and where it finished. */
function hitText(h, i) {
  const geo = geoOf(holeDef(h)); if (!geo) return '';
  const s = h.shots[i], nx = h.shots[i + 1] || (!h.done && h.next) || null; if (s.lie === 'grn') return '';
  const a = i === 0 ? teeOf(h, geo) : s.g, b = nx ? nx.g : (h.done ? pinOf(h, geo) : null);
  if (!a || !b || !SLMap.ok(a) || !SLMap.ok(b)) return '';
  const d = SLMap.dist(a, b);
  return d >= 15 ? `${i === 0 && !h.tg ? 'about ' : ''}${yds(d)} yd shot` : '';
}
/** Club distances and shot patterns measured on the map. A shot counts when it was hit from the tee or the fairway, with a club,
    no penalty, from outside the around-the-green distance, and both where it was hit from and where it finished are pinned.
    The drive starts at the tee marked for that round, or at the hole's tee pin when that pin is within 10 yards of what the hole
    played that day (otherwise the pin may sit on another tee box). Off line is measured against the aim saved with the shot,
    else the hole plan's tee aim, else, on a straight hole (tee to green within 10 yards of the yardage), the line to the green.
    A shot from within reach of the green is measured against the flag, which also gives long and short. */
function measuredClubs() {
  if (!MAPS) return {};
  const o = opts(), raw = {}, add = (c, k, v) => { const m = raw[c] || (raw[c] = { d:[], lat:[], dep:[], td:[] }); m[k].push(v); };
  Object.values(S.rounds).forEach(r => {
    if (r.example) return;
    (r.holes || []).forEach(h => {
      const x = holeDef(h), geo = geoOf(x); if (!geo || !(h.shots || []).length) return;
      const pin = pinOf(h, geo), cen = SLMap.centroid(geo.g), plan = (x && x.plan) || {};
      h.shots.forEach((s, i) => {
        if (!s.c || s.u || s.p || (s.lie !== 'tee' && s.lie !== 'fwy') || (s.lie !== 'tee' && +s.d <= o.argYards)) return;
        const k = club(s.c); if (k && !(+k.carry > 0)) return;          // the putter
        const nx = h.shots[i + 1] || (!h.done && h.next) || null; if (!nx || nx.u || !SLMap.ok(nx.g)) return;
        let a = i === 0 ? teeOf(h, geo) : (SLMap.ok(s.g) ? s.g : null); if (!a) return;
        const straight = Math.abs(SLMap.dist(a, cen) - +s.d) <= 10;
        if (i === 0 && !h.tg && !straight) return;
        const b = nx.g, d = SLMap.dist(a, b); if (d < 20) return;
        const teeShot = i === 0 && h.par >= 4;
        add(s.c, 'd', d); if (teeShot) add(s.c, 'td', d);
        let tgt = SLMap.ok(s.a) ? s.a : null, atFlag = false;
        if (!tgt && teeShot && SLMap.ok(plan.ag)) tgt = plan.ag;
        if (!tgt && teeShot && straight) tgt = cen;
        if (!tgt && !teeShot && SLMap.dist(a, pin) <= (k ? (+k.total || +k.carry) : 0) * 1.1 + 10) { tgt = pin; atFlag = true; }
        if (!tgt) return;
        const off = (SLMap.bearing(a, b) - SLMap.bearing(a, tgt)) * Math.PI / 180;
        add(s.c, 'lat', d * Math.sin(off));
        if (atFlag) add(s.c, 'dep', d * Math.cos(off) - SLMap.dist(a, tgt));
      });
    });
  });
  const med = xs => { const v = xs.slice().sort((p, q) => p - q), n = v.length; return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2; };
  const rms = xs => Math.sqrt(xs.reduce((t, v) => t + v * v, 0) / xs.length);
  const out = {};
  for (const c in raw) {
    const m = raw[c], md = med(m.d), full = m.d.filter(v => v >= 0.8 * md);           // a mishit well short of the usual distance does not set it
    const tf = m.td.filter(v => v >= 0.8 * md), tm = tf.length ? med(tf) : 0, dep = m.dep.concat(tf.map(v => v - tm));
    out[c] = { n: m.d.length, nFull: full.length, typ: med(full), lo: Math.min(...m.d), hi: Math.max(...m.d),
      nLat: m.lat.length, lat: m.lat.length ? rms(m.lat) : null, bias: m.lat.length ? m.lat.reduce((t, v) => t + v, 0) / m.lat.length : null,
      nDep: dep.length, dep: dep.length ? rms(dep) : null };
  }
  return out;
}
const GPS_MIN = { d:3, pat:5 };          // shots needed before a measured number can replace the one in the bag
function gpsClubCard() {
  if (!MAPS) return '';
  const M = measuredClubs(), bag = S.settings.bag.filter(c => M[c.id]);
  let h = `<section class="card" id="gpsClubs"><h2 class="h2">Measured on the course</h2><p class="sub">Each club's distance and shot pattern from shots pinned on the map, by GPS or by tapping the photo. Distance is the total, roll included: GPS cannot see carry.</p>`;
  if (!bag.length) return h + `<p class="empty">No measured shots yet. On the course, tap Mark ball here at each ball. A shot from the tee or the fairway counts once both ends of it are pinned.</p></section>`;
  const side = v => v == null ? '–' : Math.abs(v) < 0.5 ? 'on line' : `${yds(Math.abs(v))} ${v > 0 ? 'right' : 'left'}`;
  h += tbl(['Club','Shots','Typical','Shortest–longest','± left-right','Average miss','± long-short'], bag.map(c => { const m = M[c.id];
    return [esc(c.name), m.n, m.nFull >= GPS_MIN.d ? `<b>${yds(m.typ)}</b>` : `${yds(m.typ)}<small> (needs ${GPS_MIN.d})</small>`, `${yds(m.lo)}–${yds(m.hi)}`,
      m.nLat ? `± ${yds(m.lat)}<small> (${m.nLat})</small>` : '–', side(m.bias), m.nDep ? `± ${yds(m.dep)}<small> (${m.nDep})</small>` : '–'];
  }));
  const ready = bag.filter(c => M[c.id].nFull >= GPS_MIN.d);
  if (ready.length) h += `<div class="chips"><span class="lbl">Use in bag</span>${ready.map(c => `<button type="button" class="chip" data-act="useGps" data-c="${esc(c.id)}">${esc(c.name)}</button>`).join('')}</div>`;
  return h + `<p class="sub">Typical is the middle shot once mishits under 80% of it are left out. ± left-right is measured against the aim you set with Aim, the hole plan's tee aim, or on a straight hole the line to the green; shots hit from within reach of the green are measured against the flag, which also gives ± long-short. Shots with a penalty are left out, because where they finished is not on the map.</p>
    <p class="sub">Use in bag sets the club's total to Typical and moves its carry by the same share. The ± figures change only once they rest on ${GPS_MIN.pat} shots or more. Your bag numbers drive the Aim tools only; strokes gained does not use them.</p></section>`;
}
function markRow(h, p, n) {
  if (!geoOf(holeDef(h))) return '';
  return `<div class="markrow"><button class="btn flag" type="button" data-act="markBall">Mark ball here</button>${n ? '' : `<button class="btn ghost sm" type="button" data-act="markTee">Mark the tee here</button>${h.tg ? `<button class="btn ghost sm" type="button" data-act="resetTee">Reset the tee</button>` : ''}`}${p.g ? `<button class="btn ghost sm" type="button" data-act="clearBall">Remove pin</button>` : ''}</div>
    <p class="sub" id="markMsg">${p.g ? (p.lie === 'grn' ? `Pin dropped on the green${p.gft ? `, about ${p.gft} feet from the flag by GPS. Pace it off and type the feet below` : ''}.` : `Pin dropped ${esc(p.d)} yards from the flag. Drag it to adjust, then pick the club and the lie.`) : 'At the ball, tap Mark ball here. Away from the course, tap the photo where the ball finished.'}</p>${n ? '' : `<p class="sub">Tees moved today? Drag the T on the photo, or stand on the tee box and tap Mark the tee here.</p>`}`;
}
function courseMapRow(c) {
  if (!MAPS) return '';
  const n = c.holes.filter(geoOf).length, all = n === c.holes.length;
  return `<div class="btnrow maprow"><span>${n ? `${n} of ${c.holes.length} holes on the map.` : 'Not on the map yet.'}</span><span class="grow"></span><button class="btn sm ${all ? 'ghost' : 'flag'}" data-act="mapEd" data-cid="${esc(c.id)}">${all ? 'Edit the map' : n ? 'Keep mapping' : 'Map the holes'}</button></div>`;
}
function mapSetup() {
  if (!MAPS) return '';
  const g = SLMap.gps, fx = SLMap.fresh(), n = S.courses.list.reduce((t, c) => t + c.holes.filter(geoOf).length, 0);
  return `<section class="card"><h2 class="h2">Map and GPS</h2>
    <p class="sub">${SLMap.hasKey() ? 'Satellite photo: on.' : 'Satellite photo: off until the map key is added to the site. Pins and distances work without it.'} ${n} hole${n === 1 ? ' is' : 's are'} on the map. Add holes from Courses, or from a round.</p>
    <div class="btnrow"><span class="lbl">GPS</span>${seg('gpsSet', g.want ? '1' : '0', [['1','On'],['0','Off']])}<span class="sub">${!g.want ? 'Off. Shots can still be marked by tapping the photo.' : g.err && !fx ? esc(g.err) : fx ? `Working, good to about ${yds(fx.acc * SLMap.YD)} yards.` : g.mode === 'tap' ? 'On, in battery saver.' : 'On. It runs while a map is on screen.'}</span></div>
    <div class="btnrow"><span class="lbl">GPS updates</span>${seg('gpsMode', g.mode, [['live','Live'],['tap','Battery saver']])}<span class="sub" id="gpsModeNote">${g.mode === 'tap' ? 'The GPS wakes only when you tap Mark ball here, Me, or the GPS button on the photo. Distances from where you stand then show for a minute.' : 'The GPS follows you the whole time a map is on screen, so the distances change as you walk. This uses the most battery.'}</span></div>
    <p class="sub">If an iPhone never asks for your location: open Settings, Privacy &amp; Security, Location Services, Safari Websites. Choose While Using the App and turn on Precise Location.</p>
    <div class="btnrow"><button class="btn sm ghost" data-act="saveMapFile">Save the course map file</button><label class="f inline">Load a course map file<input type="file" id="map-file" accept=".json,.txt,application/json,text/plain" data-ch="mapFile"></label><span class="sub" id="mapFileMsg"></span></div>
    <p class="sub">The map file holds the tee and green pins of every hole you have mapped. Send it to a friend and they load it here.</p></section>`;
}
function mapGuide() {
  if (!MAPS) return '';
  return `<section class="card"><h2 class="h2">The map</h2>
    <ol class="how"><li><b>Map a hole once.</b> In Courses, open a course and tap Map the holes. Tap the tee box, then tap 6 to 10 points around the edge of the green. Two minutes a hole.</li>
    <li><b>Read your distance.</b> In a round, the photo shows front, centre and back of the green from where you stand. Drag the flag to today's pin and a fourth number appears. If the tees have moved, drag the T as well. Both changes last for that round only.</li>
    <li><b>Pick an aim.</b> Tap Aim to draw your shot pattern for the club. Drag the cross until the rings sit clear of trouble. Inside reach of the green, the app starts you on the spot with the lowest expected score.</li>
    <li><b>Mark each shot.</b> Walk to the ball and tap Mark ball here. The distance left fills in by itself. Pick the club and the lie, then Save shot. On the green, type the feet.</li>
    <li><b>Entering a round afterwards?</b> Tap the photo where each shot finished instead.</li></ol>
    <p class="sub">GPS on a phone is good to about 5 yards in the open and worse under trees. Putts are too short for it, which is why the green asks for feet.</p>
    <p class="sub">Battery running low? Set GPS updates to Battery saver, at the bottom of the hole screen or in Setup: the GPS then wakes only when you tap Mark ball here, Me or the GPS button on the photo.</p></section>`;
}
/* ---------- files in and out: the share sheet on an iPhone, a download elsewhere ---------- */
async function saveFile(name, text, type) {
  const blob = new Blob([text], { type });
  if (IOS && navigator.canShare) {
    for (const ty of [type, 'text/plain']) {
      try { const f = new File([blob], name, { type:ty }); if (navigator.canShare({ files:[f] })) { await navigator.share({ files:[f] }); return 'shared'; } } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
    }
  }
  const a = document.createElement('a'), url = URL.createObjectURL(blob);
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
  return 'saved';
}
/* ---------- your bag: a new golfer starts with a standard bag and is asked once, before the first round, to make it their own ---------- */
const BAG_HINT = 'strokeLedger.bagHint';
const bagHintSeen = () => { try { return localStorage.getItem(BAG_HINT) === '1'; } catch (e) { return true; } };
/** True while the bag is still exactly the standard one a new golfer starts with. */
const bagIsStandard = () => { const b = S.settings.bag; return b.length === DEF_BAG.length && b.every((c, i) => { const d = DEF_BAG[i]; return c.id === d.id && c.name === d.name && +c.carry === d.carry && +c.total === d.total && +c.lat === d.lat && +c.depth === d.depth; }); };
function bagNudge() {
  if (practice || bagHintSeen() || !(bagIsStandard() || S.settings.bagEstimated)) return '';
  const why = S.settings.bagEstimated ? 'Your bag still holds estimated distances.' : 'The app starts with a standard set of 14 clubs and typical distances.';
  return `<div class="note maphint bknag" id="bagNudge"><span><b>Set up your bag.</b> ${why} Put in the clubs you carry and how far you hit them, so the suggested club and the aim tools fit your game. It is saved on this device for every round, and you can change it whenever you like.</span><span class="btnrow"><button type="button" class="btn sm" data-act="bagSetup">Set up my bag</button><button type="button" class="btn ghost sm" data-act="bagKeep">Keep this bag</button></span></div>`;
}
/* ---------- backup reminders: the rounds live only on this device until a backup file is saved somewhere else ---------- */
const BK_AT = 'strokeLedger.backupAt';
const backupAt = () => { try { return +localStorage.getItem(BK_AT) || 0; } catch (e) { return 0; } };
const markBackedUp = () => { try { localStorage.setItem(BK_AT, String(Date.now())); } catch (e) { /* ignore */ } };
const localOnly = () => S.sync.state === 'local' && !(window.claude && typeof window.claude.use === 'function');
/** What has changed on this device since the last backup file: rounds with play in them, and course changes once a backup exists. */
function unsaved() {
  const t = backupAt(), rs = Object.values(S.rounds).filter(r => !r.example && hasPlay(r) && (r.updatedAt || 0) > t);
  const cs = t > 0 && (S.courses.updatedAt || 0) > t;
  return { t, rs, cs, any: rs.length > 0 || cs };
}
const ymd = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function agoText(t) { const n = Math.floor((Date.now() - t) / 864e5); return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`; }
function backupNag() {
  if (practice || !localOnly()) return '';
  if (S.ui.bkOk) return `<p class="note okn" role="status">${esc(S.ui.bkOk)}</p>`;
  const u = unsaved(); if (!u.any || S.ui.bkLater) return '';
  const what = u.t ? `Last backup file: ${agoText(u.t)}. Since then ${u.rs.length ? `${u.rs.length} round${u.rs.length > 1 ? 's have' : ' has'} changed${u.cs ? ' and so have your courses' : ''}` : 'your courses have changed'}.`
    : 'No backup file has been saved from this device yet, so your rounds exist only here.';
  return `<div class="note maphint bknag" id="bkNag"><span><b>Save a backup.</b> ${what}</span><span class="btnrow"><button type="button" class="btn sm" data-act="nagBackup">Save a backup file</button><button type="button" class="btn ghost sm" data-act="nagLater">Not now</button></span><span class="sub" id="nagMsg"></span></div>`;
}
/** Save the backup file. On an iPhone this opens the share sheet: Save to Files or AirDrop puts the copy somewhere safe. */
async function doBackup(msg) {
  if (practice) { msg.textContent = 'Leave practice mode first, so the backup holds your real data.'; return ''; }
  try {
    const r = await saveFile(`Stroke Ledger backup ${today()}.json`, backupText(), 'application/json');
    if (r === 'saved' || r === 'shared') { markBackedUp(); askPersist(); }
    msg.textContent = r === 'saved' ? 'Backup file saved. Look in your Downloads folder.' : r === 'shared' ? 'Backup saved.' : '';
    return r;
  } catch (e) { msg.textContent = "Couldn't save a file here. Use Copy my data in Setup instead."; return ''; }
}
/** Ask the browser to keep this site's data even when the device runs short of space. Browsers decide by their own rules. */
let persistState = '';
async function askPersist() {
  try {
    const st = navigator.storage; if (!st || !st.persist) { persistState = 'na'; return persistState; }
    persistState = ((await st.persisted()) || (await st.persist())) ? 'yes' : 'no';
  } catch (e) { persistState = 'na'; }
  return persistState;
}
try { if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then(v => { persistState = v ? 'yes' : 'no'; if (!v && STANDALONE) askPersist(); }, () => {}); } catch (e) { /* not offered */ }
function backupFacts() {
  if (!localOnly()) return '';
  const t = backupAt();
  const st = persistState === 'yes' ? "This device has agreed to keep the app's data, so it will not clear it to make room. Deleting the app from the Home Screen still deletes it."
    : persistState === 'no' ? "This device may clear the app's data if it runs short of space. A backup file is the only copy that survives that." : '';
  return `<p class="sub" id="bkFacts">${t ? `Last backup file from this device: ${dateLabel(ymd(t))} (${agoText(t)}).` : 'No backup file saved from this device yet.'} ${st}</p>`;
}
const mapText = () => JSON.stringify({ app:'stroke-ledger-map', v:1, courses: S.courses.list.filter(c => c.holes.some(x => x.geo && (x.geo.t || (x.geo.g || []).length))).map(c => ({ id:c.id, name:c.name, loc:c.loc || null, holes:c.holes.map(x => x.geo ? { t:x.geo.t || null, g:x.geo.g || [] } : null) })) });
function loadMapText(txt) {
  const j = JSON.parse(txt); if (!j || j.app !== 'stroke-ledger-map' || !Array.isArray(j.courses)) throw new Error('x');
  let holes = 0, cs = 0;
  j.courses.forEach(fc => {
    const c = courseById(fc.id) || S.courses.list.find(k => nk(k.name) === nk(fc.name || '')); if (!c) return;
    let n = 0;
    (fc.holes || []).forEach((g, i) => { const x = c.holes[i]; if (!x || !g) return; const t = SLMap.ok(g.t) ? SLMap.r6(g.t) : null, gg = (g.g || []).filter(SLMap.ok).map(SLMap.r6); if (!t && !gg.length) return; x.geo = { t, g:gg, u:1 }; n++; });
    if (n) { cs++; holes += n; if (SLMap.ok(fc.loc) && !SLMap.ok(c.loc)) c.loc = fc.loc; }
  });
  if (holes) touchCourses();
  return { holes, cs };
}

/* ---------- render and events ---------- */
const VIEW = { rounds:vRounds, stats:vStats, best:vBest, courses:vCourses, aim:vAim, expect:vExpect, guide:vGuide, setup:vSetup };
function render() {
  const ae = document.activeElement, aid = ae && ae.id, sel = aid && ae.selectionStart != null ? [ae.selectionStart, ae.selectionEnd] : null;
  $('#tabs').innerHTML = TABS.map(([v, l]) => `<button class="tab" data-act="go" data-view="${v}" ${S.ui.view === v ? 'aria-current="page"' : ''}>${l}</button>`).join('');
  $('#setupBtn').setAttribute('aria-pressed', S.ui.view === 'setup');
  $('#baseSel').innerHTML = Object.keys(E.BASES).map(k => opt(k, E.BASES[k], base())).join('');
  $('#view').innerHTML = (practice ? `<div class="pbanner" role="status"><span><b>Practice mode.</b> Nothing you change is being saved.</span><button class="btn sm" data-act="practiceOff">Leave practice mode</button></div>` : '') + VIEW[S.ui.view]();
  syncUi();
  { const app = $('.app'); if (app) app.classList.toggle('focus', (S.ui.view === 'rounds' && !!curRound()) || (S.ui.view === 'courses' && !!S.ui.mapEd)); }
  mountMap();
  if (aid) { const el = document.getElementById(aid); if (el && el !== document.activeElement) { el.focus({ preventScroll:true }); try { if (sel) el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* not a text field */ } } }
}
const curRound = () => S.rounds[S.ui.roundId];
const curHole = () => { const r = curRound(); return r && r.holes[S.ui.hole]; };
const finishRef = i => { const h = curHole(); return h ? (h.shots[i + 1] || (!h.done && h.next) || null) : null; };
const backupText = () => JSON.stringify({ app:'stroke-ledger', v:1, settings:S.settings, courses:S.courses, rounds:S.rounds });
const curCourse = () => courseById(S.ui.courseId) || S.courses.list[0];
function go(v) { if (!VIEWS.includes(v)) v = 'rounds'; S.ui.view = v; S.ui.confirm = null; S.ui.bkOk = ''; try { if (location.hash.slice(1) !== v) location.hash = v; } catch (e) { /* ignore */ } render(); window.scrollTo(0, 0); }
const ACT = {
  go: el => go(el.dataset.view),
  openRound: el => { S.ui.bkOk = ''; S.ui.roundId = el.dataset.id; const r = curRound(); const i = r.holes.findIndex(h => !h.done); S.ui.hole = i < 0 ? 0 : i; S.ui.pad = null; S.ui.editShot = null; render(); window.scrollTo(0, 0); },
  closeRound: () => { S.ui.roundId = null; S.ui.confirm = null; render(); window.scrollTo(0, 0); },
  hole: el => { const r = curRound(), i = +el.dataset.i; if (!r || i < 0 || i >= r.holes.length) return; S.ui.hole = i; S.ui.pad = null; S.ui.editShot = null; render(); },
  padLie: el => {
    const p = S.ui.pad; if (!p) return; const was = p.lie; p.lie = el.dataset.v; p.err = '';
    if (p.g && (was === 'grn') !== (p.lie === 'grn')) { const h = curHole(), geo = geoOf(holeDef(h)); p.d = p.lie === 'grn' || !geo ? '' : String(Math.max(1, Math.round(SLMap.dist(p.g, pinOf(h, geo))))); }
    render();
  },
  padClub: el => {                        // tapping the suggested club confirms it; tapping a club you picked yourself clears it
    const p = S.ui.pad; if (!p) return; const v = el.dataset.v;
    if (!(p.cAuto && p.c === v)) p.c = p.c === v ? '' : v;
    p.cAuto = false; render();
  },
  putts: el => {                          // finish the hole with 2 or 3 putts from here; a putt without a typed length is kept with no length
    const h = curHole(), p = S.ui.pad, k = +el.dataset.v; if (!h || !p || !(k >= 2) || h.done) return;
    if (startPos(h).lie !== 'grn') return;
    const put = p.c || putterId(), leave = p.lie === 'grn' ? pf(p.d) : NaN;
    const s = mkShot(h, p); s.c = put; h.shots.push(s);
    for (let i = 1; i < k; i++) h.shots.push(i === 1 && leave > 0 ? Object.assign({ lie:'grn', d:leave, c:put }, p.g ? { g:p.g } : {}) : { lie:'grn', d:null, c:put, u:1 });
    h.done = true; delete h.next; S.ui.pad = null; S.ui.editShot = null; touchRound(S.ui.roundId); render();
  },
  padMiss: el => { const p = S.ui.pad; if (!p) return; p.m = toggleMiss(p.m, el.dataset.v); render(); },
  padPen: el => { const p = S.ui.pad; if (!p) return; p.p = +el.dataset.v; render(); },
  holed: () => { const h = curHole(), p = S.ui.pad; if (!h || !p) return; h.shots.push(mkShot(h, p)); h.done = true; delete h.next; S.ui.pad = null; S.ui.editShot = null; touchRound(S.ui.roundId); render(); },
  reopen: () => { const h = curHole(); if (!h || !h.shots.length) return; const s = popShot(h); h.next = backTo(s); h.done = false; S.ui.pad = null; S.ui.editShot = null; touchRound(S.ui.roundId); render(); },
  rehit: () => { const h = curHole(), p = S.ui.pad; if (!h || !p) return; const s = mkShot(h, p); s.p = Math.max(1, s.p || 0); h.shots.push(s); h.next = backTo(s); S.ui.pad = null; touchRound(S.ui.roundId); render(); },
  undoShot: () => { const h = curHole(); if (!h || !h.shots.length) return; const s = popShot(h); h.next = backTo(s); S.ui.pad = null; S.ui.editShot = null; touchRound(S.ui.roundId); render(); },
  editShot: el => { const i = +el.dataset.i; S.ui.editShot = S.ui.editShot === i ? null : i; render(); },
  edLie: el => { const t = finishRef(+el.dataset.i); if (!t) return; t.lie = el.dataset.v; touchRound(S.ui.roundId); render(); },
  edClub: el => { const s = curHole().shots[+el.dataset.i]; s.c = s.c === el.dataset.v ? '' : el.dataset.v; touchRound(S.ui.roundId); render(); },
  edMiss: el => { const s = curHole().shots[+el.dataset.i]; s.m = toggleMiss(s.m, el.dataset.v); touchRound(S.ui.roundId); render(); },
  edPen: el => { const s = curHole().shots[+el.dataset.i]; s.p = +el.dataset.v; touchRound(S.ui.roundId); render(); },
  delShot: el => {
    const h = curHole(), i = +el.dataset.i, s = h.shots[i]; if (!s) return;
    if (s.u) h.shots.splice(i, 1);                     // one putt fewer; the hole stays holed
    else {
      const k = 1 + unloggedAfter(h, i);                // putts with no length go with the putt they followed
      if (i + k === h.shots.length) { h.next = backTo(s); h.done = false; }
      h.shots.splice(i, k);
    }
    S.ui.editShot = null; S.ui.pad = null; touchRound(S.ui.roundId); render();
  },
  ask: el => { S.ui.confirm = el.dataset.v; render(); },
  cancel: () => { S.ui.confirm = null; render(); },
  delRound: () => { const id = S.ui.roundId; S.ui.roundId = null; S.ui.confirm = null; removeRound(id); render(); },
  statRange: el => { S.ui.statRange = el.dataset.v; render(); },
  trend: el => { S.ui.trend = el.dataset.v; render(); },
  course: el => { S.ui.courseId = el.dataset.id; S.ui.openHole = null; S.ui.editCard = false; S.ui.confirm = null; render(); },
  editCard: () => { S.ui.editCard = !S.ui.editCard; S.ui.confirm = null; render(); },
  openHole: el => { const n = +el.dataset.n; S.ui.openHole = S.ui.openHole === n ? null : n; render(); },
  addTee: () => { const c = curCourse(); c.tees.push({ name:'Tee ' + (c.tees.length + 1), yards: c.holes.map(() => 0) }); touchCourses(); render(); },
  delTee: () => { const c = curCourse(); if (c.tees.length > 1) { const t = c.tees.pop(); if (c.defaultTee === t.name) c.defaultTee = c.tees[0].name; touchCourses(); render(); } },
  delCourse: () => { const c = curCourse(); S.courses.list = S.courses.list.filter(x => x !== c); S.ui.courseId = null; S.ui.confirm = null; S.ui.editCard = false; touchCourses(); render(); },
  planHole: el => { const c = curCourse(), n = +el.dataset.n; S.ui.aimCourse = c.id; S.ui.aimHole = String(n); fillAim(); go('aim'); },
  aimMode: el => { S.ui.aimMode = el.dataset.v; render(); },
  teeClub: el => { const t = S.ui.tee, v = el.dataset.v; if (t.clubs.includes(v)) t.clubs = t.clubs.filter(x => x !== v); else { t.clubs.push(v); if (t.clubs.length > 3) t.clubs.shift(); } render(); },
  savePlan: el => { const c = courseById(S.ui.aimCourse), x = c && c.holes[+S.ui.aimHole - 1]; if (!x) return; if (el.dataset.club) x.plan.club = el.dataset.club; x.plan.aim = el.dataset.aim; touchCourses(); el.textContent = 'Saved to the plan'; el.disabled = true; },
  expLie: el => { S.ui.expLie = el.dataset.v; render(); },
  practiceOn: () => practiceOn(),
  practiceOff: () => practiceOff(),
  lab1L0: el => { const o = S.ui.lab.one, was = o.l0; o.l0 = el.dataset.v; o.d0 = labFit(o.l0, o.d0, was); render(); },
  lab1L1: el => { const o = S.ui.lab.one, was = o.l1; o.l1 = el.dataset.v; if (o.l1 !== 'holed') o.d1 = labFit(o.l1, o.d1, was === 'holed' ? o.l1 : was); render(); },
  lab1Pen: el => { S.ui.lab.one.pen = +el.dataset.v; render(); },
  abPreset: el => { loadAb(+el.dataset.i); render(); },
  abAdd: el => { const rows = S.ui.lab.ab[el.dataset.s], n = rows.length, row = { l:'grn', d:10, p:0 }; if (n && rows[n - 1].l === 'holed') rows.splice(n - 1, 0, row); else rows.push(row); render(); },
  abDel: el => { const rows = S.ui.lab.ab[el.dataset.s], n = rows.length; if (n <= 1) return; if (rows[n - 1].l === 'holed') rows.splice(n - 2, 1); else rows.pop(); render(); },
  abHole: el => { S.ui.lab.ab[el.dataset.s].push({ l:'holed', d:0, p:0 }); render(); },
  saveBackupFile: async () => {
    const msg = $('#backupMsg'), r = await doBackup(msg);
    if (r === 'saved' || r === 'shared') { const f = $('#bkFacts'); if (f) f.outerHTML = backupFacts(); }
  },
  nagBackup: async () => {
    const msg = $('#nagMsg'), r = await doBackup(msg);
    if (r === 'saved' || r === 'shared') { S.ui.bkOk = msg.textContent || 'Backup saved.'; render(); }
  },
  nagLater: () => { S.ui.bkLater = true; render(); },
  finishRound: () => { S.ui.roundId = null; S.ui.confirm = null; S.ui.bkLater = false; S.ui.bkOk = ''; render(); window.scrollTo(0, 0); },
  saveTemplate: () => {
    const msg = $('#tplMsg');
    try {
      const bin = atob(TEMPLATE_B64), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const a = document.createElement('a'), url = URL.createObjectURL(new Blob([bytes], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      a.href = url; a.download = 'Stroke Ledger scorecards.xlsx'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      if (msg) msg.textContent = 'Template saved. Look in your Downloads folder.';
    } catch (e) { if (msg) msg.textContent = "Couldn't save the template here."; }
  },
  grintCancel: () => { S.ui.imp = null; render(); },
  grintImport: () => {
    const im = S.ui.imp; if (!im || im.status !== 'ready') return;
    const o = im.out; let n = 0;
    if (o.courses.length) { o.courses.forEach(c => { if (!courseById(c.id)) S.courses.list.push(c); }); touchCourses(); }
    o.rounds.forEach(r => { if (r.state === 'same') return; const x = Object.assign({}, r); delete x.state; S.rounds[x.id] = x; touchRound(x.id); n++; });
    S.ui.imp = { status:'done', msg:`Imported ${n} round${n === 1 ? '' : 's'}${o.kind === 'card' ? '' : ' from TheGrint'}${o.courses.length ? ` and added ${o.courses.length} course${o.courses.length > 1 ? 's' : ''}` : ''}. They are in Rounds, Stats and each hole's history in Courses.` };
    render();
  },
  addClub: el => {
    const bag = S.settings.bag, id = el.dataset.v, src = CLUBS.find(c => c.id === id);
    if (src) {                                   // from the list: placed where it belongs between the clubs already there
      if (bag.some(b => b.id === id)) return;
      const rank = b => CLUBS.findIndex(c => c.id === b.id), at = bag.findIndex(b => rank(b) > rank(src));
      bag.splice(at < 0 ? bag.length : at, 0, Object.assign({}, src));
    } else {                                     // a custom club goes in just ahead of the putter
      const p = bag.findIndex(b => b.id === 'P' || /putt/i.test(b.name));
      bag.splice(p < 0 ? bag.length : p, 0, { id:'c' + uid(), name:'New club', carry:100, total:102, lat:9, depth:7 });
    }
    touchSettings(); render();
  },
  delClub: el => { const bag = S.settings.bag, i = +el.dataset.i; if (bag.length > 1 && bag[i]) { bag.splice(i, 1); touchSettings(); render(); } },
  openShot: el => { const r = S.rounds[el.dataset.r]; if (!r) return; S.ui.roundId = r.id; S.ui.hole = Math.max(0, Math.min(r.holes.length - 1, +el.dataset.h || 0)); S.ui.pad = null; S.ui.editShot = null; go('rounds'); },
  copyBackup: async () => {
    const box = $('#backup'), msg = $('#backupMsg');
    if (practice) { msg.textContent = 'Leave practice mode first, so the backup holds your real data.'; return; }
    const txt = backupText();
    try { await navigator.clipboard.writeText(txt); msg.textContent = 'Copied.'; } catch (e) { S.ui.backup = txt; box.value = txt; box.focus(); box.select(); msg.textContent = 'Select all of the text in the box and copy it.'; }
  },
  restore: () => {
    const msg = () => $('#backupMsg');
    try {
      const j = JSON.parse(S.ui.backup); if (!j || j.app !== 'stroke-ledger') throw new Error('x');
      Object.keys(S.rounds).forEach(id => { if (!(j.rounds || {})[id]) removeRound(id); });
      S.settings = normSettings(j.settings); S.courses = normCourses(j.courses); S.rounds = j.rounds || {}; Object.values(S.rounds).forEach(normRound); mergeGeo();
      S.ui.confirm = null; S.ui.backup = ''; touchSettings(); touchCourses(); Object.keys(S.rounds).forEach(touchRound); if (!practice) markBackedUp(); render(); msg().textContent = 'Restored.';
    } catch (e) { S.ui.confirm = null; render(); msg().textContent = 'That text is not a Stroke Ledger backup.'; }
  }
};
function fillAim() {
  const c = courseById(S.ui.aimCourse), n = +S.ui.aimHole, x = c && c.holes[n - 1]; if (!x) return;
  const tee = c.tees.find(t => t.name === c.defaultTee) || c.tees[0], y = tee ? +tee.yards[n - 1] || 0 : 0;
  if (x.par === 3) { S.ui.aimMode = 'ap'; S.ui.ap.dist = y; S.ui.ap.lie = 'tee'; S.ui.ap.club = ''; } else { S.ui.aimMode = 'tee'; S.ui.tee.len = y; }
}
const CH = {
  baseline: el => { S.settings.baseline = el.value; touchSettings(); render(); },
  abHole: el => { const a = S.ui.lab.ab, k = el.dataset.k, v = Math.round(pf(el.value)); if (k === 'par' ? (v >= 3 && v <= 5) : (v >= 60 && v <= 700)) a[k] = v; render(); },
  abRow: el => {
    const rows = S.ui.lab.ab[el.dataset.s], i = +el.dataset.i, r = rows[i], k = el.dataset.k; if (!r) return;
    if (k === 'l') {
      const was = r.l; r.l = el.value;
      if (r.l === 'holed') { rows.length = i + 1; r.p = Math.min(+r.p || 0, was === 'ob' ? 0 : 2); }
      else if (r.l === 'ob') r.p = Math.max(1, +r.p || 0);
      else { if (was === 'ob') r.p = 0; if (!(r.d > 0) || (r.l === 'grn') !== (was === 'grn')) r.d = r.l === 'grn' ? 20 : 30; }
    } else if (k === 'd') { const v = pf(el.value); if (v > 0) r.d = v; }
    else r.p = r.l === 'ob' ? Math.max(1, +el.value || 0) : (+el.value || 0);
    render();
  },
  lab3Sel: el => { S.ui.lab.aim[el.dataset.k] = el.value; render(); },
  backupFile: async el => {
    const f = el.files && el.files[0]; if (!f) return;
    try { S.ui.backup = await f.text(); S.ui.confirm = 'restore'; } catch (e) { S.ui.backup = ''; }
    render();
  },
  grintFile: async el => {
    const f = el.files && el.files[0]; if (!f) return;
    S.ui.imp = { status:'reading' }; render();
    try {
      const X = await loadXlsx(), wb = X.read(await f.arrayBuffer(), { type:'array' });
      const cs = findCardSheet(X, wb);
      if (!cs && CARD && !wb.SheetNames.some(n => nk(n) === 'holes')) throw new Error('This file has no sheet with Hole and Score columns. Save the template, fill it in and choose it here.');
      S.ui.imp = { status:'ready', out: cs ? buildCardImport(X, cs) : buildImport(X, wb), name:f.name };
    } catch (e) {
      S.ui.imp = { status:'error', msg: e && e.message === 'load' ? "Couldn't load the spreadsheet reader. Check your connection and choose the file again." : (e && e.message) || 'That file could not be read.' };
    }
    render();
  },
  nr: el => { S.ui.nr[el.dataset.k] = el.value; render(); },
  padD0: () => { const h = curHole(), p = S.ui.pad; if (h && p && h.par === 3 && p.cAuto) { resuggest(h, p); render(); } },
  edD: el => { const v = pf(el.value), t = finishRef(+el.dataset.i); if (t && v > 0) { t.d = v; delete t.u; touchRound(S.ui.roundId); } render(); },
  edD0: el => { const v = pf(el.value), s = curHole().shots[0]; if (s && v > 0) { s.d = v; touchRound(S.ui.roundId); } render(); },
  roundNotes: el => { const r = curRound(); if (r) { r.notes = el.value; touchRound(r.id); } },
  statCourse: el => { S.ui.statCourse = el.value; render(); },
  cName: el => { const c = curCourse(); c.name = el.value.trim() || c.name; touchCourses(); render(); },
  cDef: el => { curCourse().defaultTee = el.value; touchCourses(); render(); },
  teeName: el => { const c = curCourse(), t = c.tees[+el.dataset.t], nm = el.value.trim(); if (!nm) return render(); if (c.defaultTee === t.name) c.defaultTee = nm; t.name = nm; touchCourses(); render(); },
  hPar: el => { const v = Math.round(pf(el.value)); if (v >= 3 && v <= 6) { curCourse().holes[+el.dataset.i].par = v; touchCourses(); } render(); },
  hHcp: el => { const v = Math.round(pf(el.value)); curCourse().holes[+el.dataset.i].hcp = v > 0 ? v : null; touchCourses(); },
  hYds: el => { const v = Math.round(pf(el.value)); curCourse().tees[+el.dataset.t].yards[+el.dataset.i] = v > 0 ? v : 0; touchCourses(); },
  plan: el => { const x = curCourse().holes[+el.dataset.n - 1]; x.plan[el.dataset.k] = el.value; touchCourses(); if (el.dataset.k === 'club') render(); },
  aimCourse: el => { S.ui.aimCourse = el.value; S.ui.aimHole = ''; render(); },
  aimHole: el => { S.ui.aimHole = el.value; fillAim(); render(); },
  tee: el => { const k = el.dataset.k; S.ui.tee[k] = (k === 'lType' || k === 'rType') ? el.value : (pf(el.value) >= 0 ? pf(el.value) : S.ui.tee[k]); render(); },
  ap: el => { const k = el.dataset.k; S.ui.ap[k] = ['lie','club','left','right','short','long'].includes(k) ? el.value : (pf(el.value) >= 0 ? pf(el.value) : S.ui.ap[k]); render(); },
  calc: el => { const k = el.dataset.k, c = S.ui.calc; if (k === 'l1') { c.holed = el.value === 'holed'; if (!c.holed) c.l1 = el.value; } else if (k === 'l0') c.l0 = el.value; else { const v = pf(el.value); if (v >= 0) c[k] = v; } render(); },
  bag: el => { const c = S.settings.bag[+el.dataset.i], k = el.dataset.k; if (k === 'name') c.name = el.value.trim() || c.name; else { const v = pf(el.value); if (v >= 0) c[k] = v; } S.settings.bagEstimated = false; touchSettings(); render(); },
  setNum: el => { const v = pf(el.value); if (v > 0) { S.settings[el.dataset.k] = v; touchSettings(); } render(); }
};
const IN = {
  lab1: el => { const o = S.ui.lab.one, k = el.dataset.k; o[k] = +el.value; const out = $('#lab1-' + k + 'v'), box = $('#lab1-out'); if (out) out.textContent = `${o[k]} ${labRange(k === 'd0' ? o.l0 : o.l1).unit}`; if (box) box.innerHTML = lab1Out(); },
  lab3: el => { const a = S.ui.lab.aim, k = el.dataset.k; a[k] = +el.value; const out = $('#lab3-' + k + 'v'), box = $('#lab3-out'); if (out) out.textContent = `${a[k]} yds`; if (box) box.innerHTML = lab3Out(); },
  padD: el => { if (S.ui.pad) S.ui.pad.d = el.value; }, padD0: el => { if (S.ui.pad) S.ui.pad.d0 = el.value; }, backup: el => { S.ui.backup = el.value; } };
const SUB = {
  newRound: () => {
    const nr = S.ui.nr, segs = [[nr.c1, nr.t1], [nr.c2, nr.t2]].filter(x => courseById(x[0]));
    if (!segs.length) return;
    const r = { id:uid(), date:nr.date || today(), createdAt:Date.now(), updatedAt:0, notes:'', segs:[], holes:[] };
    segs.forEach(([cid, tn]) => {
      const c = courseById(cid), tee = c.tees.find(t => t.name === tn) || c.tees[0] || { name:'', yards:[] };
      r.segs.push({ courseId:cid, name:c.name, tee:tee.name });
      c.holes.forEach((x, i) => r.holes.push({ cid, n:i + 1, par:+x.par || 4, yards:+tee.yards[i] || 0, shots:[], done:false }));
    });
    S.rounds[r.id] = r; S.ui.roundId = r.id; S.ui.hole = 0; S.ui.pad = null; S.ui.editShot = null; touchRound(r.id); render(); window.scrollTo(0, 0);
    if (persistState !== 'yes' && !practice) askPersist();
  },
  addShot: () => {
    const h = curHole(), p = S.ui.pad; if (!h || !p) return;
    const d = pf(p.d);
    if (!(d > 0)) { p.err = `Enter how far the ball has left to the hole, in ${p.lie === 'grn' ? 'feet' : 'yards'}. If it went in, tap Holed it.`; render(); return; }
    h.shots.push(mkShot(h, p)); h.next = Object.assign({ lie:p.lie, d }, p.g ? { g:p.g } : {}); S.ui.pad = null; S.ui.editShot = null; touchRound(S.ui.roundId); render();
  },
  addCourse: f => {
    const name = f.querySelector('#ac-name').value.trim(), n = +f.querySelector('#ac-holes').value || 9, tn = f.querySelector('#ac-tee').value.trim() || 'White';
    if (!name) return;
    const c = { id:'c' + uid(), name, defaultTee:tn, tees:[{ name:tn, yards:Array(n).fill(0) }], holes:Array.from({ length:n }, () => ({ par:4, hcp:null, plan:{ club:'', aim:'', avoid:'', notes:'' } })) };
    S.courses.list.push(c); S.ui.courseId = c.id; S.ui.editCard = true; touchCourses(); render();
  }
};
Object.assign(ACT, {
  gpsOn: () => { SLMap.gpsSet(true); if (SLMap.gps.mode === 'tap') { ACT.gpsFix(); return; } liveMap(); if (SLMap.gps.err) say(SLMap.gps.err); },
  gpsSet: el => { SLMap.gpsSet(el.dataset.v === '1'); render(); },
  gpsMode: el => { SLMap.gpsMode(el.dataset.v); render(); },
  /** Battery saver: take one position now. The distances show from where you stand for a minute, then go back to the ball. */
  gpsFix: async () => {
    if (!SLMap.gps.want) SLMap.gpsSet(true);
    const bar = $('#gpsBar'); if (bar) bar.innerHTML = '<span>GPS<b>…</b></span>';
    const fx = await SLMap.locate(8000); liveMap();
    if (!fx) say(SLMap.gps.err || 'No GPS position yet. Step into the open and try again.');
    clearTimeout(timers.fix); timers.fix = setTimeout(liveMap, 61000);
  },
  mapView: async el => {
    const v = el.dataset.v, g = SLMap.gps;
    if (v === 'me' && g.mode === 'tap') {
      if (!g.want) SLMap.gpsSet(true);
      if (!SLMap.fresh()) { say('Getting your position…'); await SLMap.locate(8000); liveMap(); clearTimeout(timers.fix); timers.fix = setTimeout(liveMap, 61000); }
      SLMap.view('me'); return;
    }
    if (v === 'me' && !g.want) { SLMap.gpsSet(true); liveMap(); say('Allow location when the phone asks, then tap Me again.'); return; }
    SLMap.view(v);
  },
  markBall: async () => {
    const h = curHole(), geo = h && geoOf(holeDef(h)); if (!geo || h.done) return;
    if (!SLMap.gps.want) { SLMap.gpsSet(true); liveMap(); }
    say('Getting your position…');
    const fx = await SLMap.locate(8000);
    if (curHole() !== h) return;
    if (!fx) { say(SLMap.gps.err || 'No GPS position yet. Step into the open and try again, or tap the photo where the ball is.'); return; }
    const far = SLMap.dist(fx.ll, SLMap.centroid(geo.g));
    if (far > 900) { say(`GPS puts you ${far > 3000 ? Math.round(far / 1760) + ' miles' : yds(far) + ' yards'} from this green. Tap the photo where the ball finished instead.`); return; }
    setBall(fx.ll);
    if (fx.acc * SLMap.YD > 18) say(`GPS is only good to about ${yds(fx.acc * SLMap.YD)} yards right now. Drag the pin if it looks off.`);
  },
  clearBall: () => { const p = S.ui.pad; if (!p) return; delete p.g; p.gft = 0; p.d = ''; render(); },
  markTee: async () => {
    const h = curHole(), geo = h && geoOf(holeDef(h)); if (!geo || h.shots.length) return;
    if (!SLMap.gps.want) { SLMap.gpsSet(true); liveMap(); }
    say('Getting your position…');
    const fx = await SLMap.locate(8000);
    if (curHole() !== h) return;
    if (!fx) { say(SLMap.gps.err || 'No GPS position yet. Try again in a moment.'); return; }
    if (SLMap.dist(fx.ll, SLMap.centroid(geo.g)) > 900) { say('GPS puts you too far from this hole to be on its tee.'); return; }
    const note = setTee(curRound(), h, geo, fx.ll); touchRound(S.ui.roundId); render(); say(note);
  },
  resetTee: () => {
    const r = curRound(), h = curHole(), geo = h && geoOf(holeDef(h)); if (!geo || !h.tg) return;
    delete h.tg;
    const a = S.ui.aim; if (a && a.on && a.src === 'spot' && !h.shots.length) { a.from = teeOf(h, geo); a.pt = null; }
    if (!h.shots.length && h.par === 3) { const p = padFor(r, S.ui.hole); p.d0 = String(startPos(h).d || ''); resuggest(h, p); }
    touchRound(S.ui.roundId); render();
  },
  aimToggle: () => {
    const r = curRound(), h = curHole(), geo = h && geoOf(holeDef(h)); if (!geo || h.done) return;
    const key = `${r.id}:${S.ui.hole}:${h.shots.length}`, a = S.ui.aim;
    if (a && a.on && a.key === key) { S.ui.aim = null; render(); return; }
    const fx = SLMap.fresh(), near = fx && SLMap.dist(fx.ll, SLMap.centroid(geo.g)) < 900, from = near ? fx.ll : spotOf(h, geo);
    if (!from) { say('The map does not know where the ball is. Turn on GPS, or mark the last shot on the photo first.'); return; }
    S.ui.aim = { on:true, key, from, src: near ? 'gps' : 'spot', club:'', pt:null }; render(); SLMap.view('shot');
  },
  aimBest: () => { if (S.ui.aim) { S.ui.aim.pt = null; render(); } },
  aimSave: el => {
    const r = curRound(), h = curHole(), x = h && holeDef(h), geo = geoOf(x), a = geo && aimState(r, S.ui.hole, geo); if (!a) return;
    x.plan.club = a.club.id; x.plan.ag = a.pt; if (!x.plan.aim) x.plan.aim = 'Aim point saved on the map';
    touchCourses(); el.textContent = 'Saved to the plan'; el.disabled = true;
  },
  mapEd: el => {
    const c = courseById(el.dataset.cid) || curCourse(); if (!c) return;
    const first = c.holes.findIndex(x => !geoOf(x)), n = +el.dataset.n || (first < 0 ? 1 : first + 1), x = c.holes[n - 1];
    S.ui.courseId = c.id; S.ui.mapEd = { cid:c.id, n, tool: x && x.geo && SLMap.ok(x.geo.t) ? 'green' : 'tee', back: el.dataset.back ? 1 : 0, hist:[] };
    go('courses');
  },
  mapEdClose: () => { const ed = S.ui.mapEd; S.ui.mapEd = null; if (ed && ed.back && curRound()) go('rounds'); else { render(); window.scrollTo(0, 0); } },
  mapEdHole: el => { const e = editHole(), n = +el.dataset.n; if (!e || !e.c.holes[n - 1]) return; const x = e.c.holes[n - 1]; e.ed.n = n; e.ed.hist = []; e.ed.tool = x.geo && SLMap.ok(x.geo.t) ? 'green' : 'tee'; render(); },
  mapTool: el => { if (S.ui.mapEd) { S.ui.mapEd.tool = el.dataset.v; render(); } },
  mapUndo: () => { const e = editHole(); if (!e || !(e.ed.hist || []).length) return; const [t, g] = JSON.parse(e.ed.hist.pop()); e.x.geo = Object.assign(e.x.geo || {}, { t, g, u:1 }); touchCourses(); render(); },
  mapClearGreen: () => editChange(geo => { geo.g = []; }),
  mapHere: async el => {
    const e = editHole(); if (!e) return; const n0 = e.ed.n;
    if (!SLMap.gps.want) { SLMap.gpsSet(true); liveMap(); }
    say('Getting your position…');
    const fx = await SLMap.locate(8000);
    if (S.ui.mapEd !== e.ed || e.ed.n !== n0) return;
    if (!fx) { say(SLMap.gps.err || 'No GPS position yet. Try again in a moment.'); return; }
    if (el.dataset.v === 'tee') editChange(geo => { geo.t = fx.ll; }); else editChange(geo => { geo.g = SLMap.circle(fx.ll, 13, 10); });
    SLMap.view('hole');
  },
  saveMapFile: async () => {
    const msg = $('#mapFileMsg');
    try { const r = await saveFile(`Stroke Ledger course map ${today()}.json`, mapText(), 'application/json'); if (msg) msg.textContent = r === 'saved' ? 'Map file saved. Look in your Downloads folder.' : r === 'shared' ? 'Done.' : ''; }
    catch (e) { if (msg) msg.textContent = "Couldn't save a file here."; }
  },
  hintOff: () => { try { localStorage.setItem('strokeLedger.hint', '1'); } catch (e) { /* ignore */ } render(); },
  bagSetup: () => { go('setup'); const el = $('#bagCard'); if (el) el.scrollIntoView({ block:'start' }); },
  bagKeep: () => { try { localStorage.setItem(BAG_HINT, '1'); } catch (e) { /* ignore */ } render(); },
  useGps: el => {
    const m = measuredClubs()[el.dataset.c], k = club(el.dataset.c); if (!m || !k || m.nFull < GPS_MIN.d) return;
    const ratio = +k.total > 0 && +k.carry > 0 ? +k.carry / +k.total : 0.94;
    k.total = Math.round(m.typ); k.carry = Math.round(m.typ * ratio);
    if (m.nLat >= GPS_MIN.pat) k.lat = Math.max(2, Math.round(m.lat));
    if (m.nDep >= GPS_MIN.pat) k.depth = Math.max(2, Math.round(m.dep));
    S.settings.bagEstimated = false; touchSettings(); render();
  }
});
Object.assign(CH, {
  aimClub: el => { if (S.ui.aim) { S.ui.aim.club = el.value; S.ui.aim.pt = null; render(); } },
  mapFile: async el => {
    const f = el.files && el.files[0]; if (!f) return;
    let t = '';
    try { const r = loadMapText(await f.text()); t = r.holes ? `Loaded ${r.holes} hole${r.holes > 1 ? 's' : ''} on ${r.cs} course${r.cs > 1 ? 's' : ''}.` : 'That file has no holes for the courses in this app.'; }
    catch (e) { t = 'That file is not a Stroke Ledger course map.'; }
    render(); const msg = $('#mapFileMsg'); if (msg) msg.textContent = t;
  }
});
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (el && !el.disabled && ACT[el.dataset.act]) ACT[el.dataset.act](el, e); });
document.addEventListener('change', e => { const el = e.target.closest('[data-ch]'); if (el && CH[el.dataset.ch]) CH[el.dataset.ch](el, e); });
document.addEventListener('input', e => { const el = e.target.closest('[data-in]'); if (el && IN[el.dataset.in]) IN[el.dataset.in](el, e); });
document.addEventListener('submit', e => { e.preventDefault(); const f = e.target.closest('[data-sub]'); if (f && SUB[f.dataset.sub]) SUB[f.dataset.sub](f); });
document.addEventListener('pointermove', e => {
  const box = e.target.closest && e.target.closest('#teeBox'), tip = $('#teeTip'); if (!tip) return;
  if (!box || !lastTee) { tip.hidden = true; return; }
  const svg = box.querySelector('svg'), rc = svg.getBoundingClientRect(), lim = Math.max(...lastTee.map(r => r.plan.lim));
  const fx = (e.clientX - rc.left) / rc.width * lastTeeW, a = Math.round((fx - 40) / (lastTeeW - 50) * 2 * lim - lim);
  if (a < -lim || a > lim) { tip.hidden = true; return; }
  tip.hidden = false;
  tip.innerHTML = `<b>Aim ${a === 0 ? 'centre' : Math.abs(a) + (a < 0 ? ' left' : ' right')}</b><br>` + lastTee.map(r => { const c = r.plan.curve.find(x => x.a === a); return c ? `${esc(r.c.name)} ${c.v.toFixed(2)}` : ''; }).filter(Boolean).join('<br>');
});
{ let lastW = window.innerWidth; window.addEventListener('resize', () => { if (window.innerWidth === lastW) return; lastW = window.innerWidth; later('rz', () => { if (S.ui.view === 'stats' || S.ui.view === 'aim' || S.ui.view === 'guide') render(); }, 200); }); }
window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (VIEWS.includes(v) && v !== S.ui.view) { S.ui.view = v; S.ui.confirm = null; render(); } });

loadLocal();
{ const v = location.hash.slice(1); if (VIEWS.includes(v)) S.ui.view = v; }
render();
initCloud();
})();
