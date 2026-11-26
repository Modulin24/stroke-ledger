/* Strokes-gained engine: baselines, per-shot SG, round analysis, buckets, aim planners. Pure functions. */
const SGE = (() => {
  // Expected strokes to hole out, PGA Tour (Broadie, Every Shot Counts, 2004-2012 ShotLink data).
  // Rows under 20 yards, tee under 100 and recovery under 100 are extrapolated.
  const D = [5,10,20,40,60,80,100,120,140,160,180,200,220,240,260,280,300,320,340,360,380,400,420,440,460,480,500,520,540,560,580,600];
  const TOUR = {
    tee:[2.20,2.28,2.50,2.70,2.80,2.85,2.92,2.99,2.97,2.99,3.05,3.12,3.17,3.25,3.45,3.65,3.71,3.79,3.86,3.92,3.96,3.99,4.02,4.08,4.17,4.28,4.41,4.54,4.65,4.74,4.79,4.82],
    fwy:[2.10,2.18,2.40,2.60,2.70,2.75,2.80,2.85,2.91,2.98,3.08,3.19,3.32,3.45,3.58,3.69,3.78,3.84,3.88,3.95,4.03,4.11,4.15,4.20,4.29,4.40,4.53,4.66,4.78,4.86,4.91,4.94],
    rgh:[2.24,2.34,2.59,2.78,2.91,2.96,3.02,3.08,3.15,3.23,3.31,3.42,3.53,3.64,3.74,3.83,3.90,3.95,4.02,4.11,4.21,4.30,4.34,4.39,4.48,4.59,4.72,4.85,4.97,5.05,5.10,5.13],
    snd:[2.38,2.43,2.53,2.82,3.15,3.24,3.23,3.21,3.22,3.28,3.40,3.55,3.70,3.84,3.93,4.00,4.04,4.12,4.26,4.41,4.55,4.69,4.73,4.78,4.87,4.98,5.11,5.24,5.36,5.44,5.49,5.52],
    rec:[3.10,3.15,3.25,3.45,3.60,3.72,3.80,3.78,3.80,3.81,3.82,3.87,3.92,3.97,4.03,4.10,4.20,4.31,4.44,4.56,4.66,4.75,4.79,4.84,4.93,5.04,5.17,5.30,5.42,5.50,5.55,5.58]
  };
  // Average putts by distance in feet. Tour = Broadie. Amateur columns are fitted to Shot Scope make
  // percentages by handicap (0, 5, 10, 15, 20) plus an estimated three-putt rate.
  const PFT = [1,2,3,4,5,6,7,8,9,10,12,15,20,25,30,40,50,60,90];
  const PUTT = {
    tour:   [1.00,1.01,1.04,1.13,1.23,1.34,1.42,1.50,1.56,1.61,1.70,1.78,1.87,1.93,1.98,2.06,2.14,2.21,2.40],
    scratch:[1.00,1.02,1.07,1.19,1.30,1.41,1.48,1.55,1.61,1.65,1.74,1.82,1.90,1.96,2.01,2.10,2.19,2.27,2.48],
    h10:    [1.01,1.04,1.14,1.30,1.43,1.53,1.60,1.67,1.72,1.76,1.81,1.86,1.95,2.00,2.06,2.18,2.29,2.39,2.63],
    h15:    [1.02,1.07,1.19,1.37,1.50,1.60,1.65,1.71,1.76,1.81,1.86,1.90,1.98,2.03,2.09,2.24,2.36,2.47,2.73],
    h5:     [1.01,1.04,1.13,1.28,1.40,1.49,1.55,1.60,1.65,1.68,1.76,1.83,1.92,1.98,2.04,2.14,2.25,2.34,2.56],
    h20:    [1.03,1.10,1.24,1.43,1.56,1.66,1.70,1.75,1.80,1.86,1.91,1.94,2.02,2.07,2.13,2.32,2.45,2.57,2.86]
  };
  // Amateur baselines off the green = Tour + an offset by lie and distance. Offsets are calibrated to
  // Shot Scope's strokes-to-finish from 100 yards (3.05 / 3.43 / 3.70 for 0 / 10 / 15 handicap),
  // up-and-down rates and typical scores (75 / 85 / 91).
  const DELTA = {
    scratch:{ sandC:.05,
      fwy:[[5,.03],[10,.05],[20,.08],[40,.11],[60,.14],[80,.16],[100,.18],[120,.20],[140,.22],[160,.24],[180,.26],[200,.27],[250,.28],[300,.29],[400,.31],[500,.33],[600,.35]],
      tee:[[100,.15],[140,.18],[180,.22],[220,.24],[260,.26],[300,.28],[350,.30],[400,.31],[450,.32],[500,.33],[550,.35],[600,.36]] },
    h10:{ sandC:.18,
      fwy:[[5,.10],[10,.15],[20,.22],[40,.33],[60,.42],[80,.48],[100,.53],[120,.61],[140,.69],[160,.76],[180,.81],[200,.85],[250,.88],[300,.91],[400,.98],[500,1.05],[600,1.12]],
      tee:[[100,.47],[140,.59],[160,.65],[180,.69],[200,.72],[240,.76],[280,.82],[320,.88],[360,.94],[400,.98],[440,1.03],[480,1.08],[520,1.12],[560,1.16],[600,1.20]] },
    h15:{ sandC:.26,
      fwy:[[5,.13],[10,.20],[20,.29],[40,.45],[60,.58],[80,.69],[100,.78],[120,.86],[140,.94],[160,1.01],[180,1.07],[200,1.11],[250,1.14],[300,1.17],[400,1.26],[500,1.35],[600,1.44]],
      tee:[[100,.66],[140,.80],[160,.88],[180,.93],[200,.97],[240,1.02],[280,1.12],[320,1.22],[360,1.31],[400,1.37],[440,1.43],[480,1.48],[520,1.53],[560,1.58],[600,1.63]] }
  };
  // 5 and 20 handicap off the green: built from the three fitted benchmarks and checked against Shot Scope's 2026 average scores by par
  // (par 3 / 4 / 5: 3.4 / 4.5 / 5.3 for a 5 handicap, 4.0 / 5.4 / 6.3 for a 20). The 5 sits 52% of the way from scratch to 10;
  // the 20 sits 70% of the 10-to-15 gap beyond the 15.
  const FWY_D = [5,10,20,40,60,80,100,120,140,160,180,200,250,300,400,500,600], TEE_D = [100,140,160,180,200,220,240,260,280,300,320,350,360,400,440,450,480,500,520,550,560,600];
  const blend = (A, B, f) => ({ sandC: +(A.sandC + f * (B.sandC - A.sandC)).toFixed(3),
    fwy: FWY_D.map(d => [d, +(interpPairs(A.fwy, d) + f * (interpPairs(B.fwy, d) - interpPairs(A.fwy, d))).toFixed(3)]),
    tee: TEE_D.map(d => [d, +(interpPairs(A.tee, d) + f * (interpPairs(B.tee, d) - interpPairs(A.tee, d))).toFixed(3)]) });
  DELTA.h5 = blend(DELTA.scratch, DELTA.h10, 0.52);
  DELTA.h20 = blend(DELTA.h10, DELTA.h15, 1.7);
  const BASES = { tour:'PGA Tour', scratch:'Scratch', h5:'5 handicap', h10:'10 handicap', h15:'15 handicap', h20:'20 handicap' };
  const LIES = { tee:'Tee', fwy:'Fairway', rgh:'Rough', snd:'Sand', rec:'Recovery', grn:'Green' };
  // Make percentage by putt length band. Amateur rows: Shot Scope. Tour row: approximate, from the Tour putt table.
  const BANDS = [[0,3],[3,6],[6,9],[9,12],[12,18],[18,24],[24,30],[30,999]];
  const MAKE = { tour:[99,84,56,38,24,14,9,4], scratch:[98,76,49,34,19,12,7,4], h5:[96,67,44,34,19,13,7,3], h10:[96,65,39,26,18,10,7,3], h15:[93,59,36,22,16,9,7,2], h20:[90,55,33,18,14,7,5,2] };
  // Typical round by handicap: Shot Scope data as published by Golf Monthly and MyGolfSpy in 2025 and 2026. Score is for a par 72
  // (four par 3s, ten par 4s, four par 5s) from Shot Scope's average score by par. Fairways and putts for 5 and 15, and penalties
  // for 5 and 20, are interpolated between the published handicaps.
  const TYPICAL = {
    scratch:{ score:74.0, gir:59, fir:50, putts:29.9, ud:54, pens:0.6 },
    h5:{ score:79.8, gir:41, fir:49, putts:30.5, ud:47, pens:1.1 },
    h10:{ score:85.2, gir:32, fir:48, putts:31.2, ud:39, pens:1.6 },
    h15:{ score:90.6, gir:21, fir:47, putts:32.3, ud:34, pens:2.5 },
    h20:{ score:95.2, gir:14, fir:45, putts:33.4, ud:31, pens:3.3 }
  };

  function interp(xs, ys, x) {
    const n = xs.length;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n-1]) return ys[n-1];
    let i = 1; while (xs[i] < x) i++;
    const t = (x - xs[i-1]) / (xs[i] - xs[i-1]);
    return ys[i-1] + t * (ys[i] - ys[i-1]);
  }
  function interpPairs(p, x) {
    const n = p.length;
    if (x <= p[0][0]) return p[0][1];
    if (x >= p[n-1][0]) return p[n-1][1];
    let i = 1; while (p[i][0] < x) i++;
    const t = (x - p[i-1][0]) / (p[i][0] - p[i-1][0]);
    return p[i-1][1] + t * (p[i][1] - p[i-1][1]);
  }
  /** Expected strokes to hole out. d is feet on the green, yards everywhere else. */
  function expected(lie, d, base) {
    d = +d || 0;
    if (lie === 'grn') {
      const ys = PUTT[base] || PUTT.tour;
      if (d > 90) return ys[18] + (d - 90) * (ys[18] - ys[17]) / 30;
      return interp(PFT, ys, d);
    }
    const t = interp(D, TOUR[lie] || TOUR.rgh, d);
    const dl = DELTA[base];
    if (!dl) return t;
    const f = interpPairs(dl.fwy, d);
    let add = f;
    if (lie === 'tee') add = d < 100 ? 0.88 * f : interpPairs(dl.tee, d);
    else if (lie === 'rgh') add = 1.12 * f;
    else if (lie === 'snd') add = 1.2 * f + dl.sandC;
    return t + add;
  }

  /** A hole known only from its scorecard (score, putts, tee result, penalty codes): total strokes gained only. */
  function analyzeCard(h, base) {
    const c = h.card, score = +c.s, pen = String(c.pen || ''), t = +c.t || 0, putts = (c.p == null || c.p === '') ? null : +c.p;
    const sgTot = h.yards > 0 ? expected('tee', h.yards, base) - score : null;
    const res = { card:true, shots:[], left:[], sg:{ ott:0, app:0, arg:0, putt:0, tot: sgTot || 0 }, sgTot, done:true, score, putts,
      pens: (pen.match(/[OWDP]/g) || []).length };
    res.gir = putts == null ? null : (score - putts) <= h.par - 2;
    if (h.par >= 4 && t > 0) { res.fir = t === 3; res.teeDir = t === 3 ? 'F' : (t === 1 || t === 7) ? 'L' : (t === 2 || t === 8) ? 'R' : 'X'; }
    res.t5 = [h.par === 5 && score >= 6, score >= h.par + 2, putts != null && putts >= 3, false, false];
    return res;
  }
  function analyzeHole(h, base, o) {
    if (h.card && !(h.shots && h.shots.length)) return analyzeCard(h, base);
    const sh = h.shots || [], n = sh.length, out = [], sg = { ott:0, app:0, arg:0, putt:0, tot:0 };
    let pens = 0, putts = 0;
    const penBefore = [];
    for (let i = 0; i < n; i++) {
      const s = sh[i], nx = sh[i+1], p = s.p || 0;
      penBefore.push(pens);
      const e0 = expected(s.lie, s.d, base);
      const e1 = nx ? expected(nx.lie, nx.d, base) : h.done ? 0 : (h.next && h.next.d > 0 ? expected(h.next.lie, h.next.d, base) : null);
      const cat = s.lie === 'grn' ? 'putt' : (s.lie === 'tee' && h.par >= 4) ? 'ott' : (s.d <= o.argYards ? 'arg' : 'app');
      const v = e1 == null ? null : e0 - e1 - 1 - p;
      if (v != null) { sg[cat] += v; sg.tot += v; }
      out.push({ e0, e1, sg: v, cat });
      pens += p; if (s.lie === 'grn') putts++;
    }
    const res = { shots: out, sg, pens, putts, done: !!h.done && n > 0, score: null };
    if (!res.done) return res;
    const score = n + pens; res.score = score;
    const left = i => (n - i) + (pens - penBefore[i]);           // strokes from shot i to holing out
    const gi = sh.findIndex(s => s.lie === 'grn');
    res.gir = gi >= 0 ? (gi + penBefore[gi]) <= h.par - 2 : score <= h.par - 2;
    if (h.par >= 4) {
      res.fir = n > 1 ? ((sh[1].lie === 'fwy' || sh[1].lie === 'grn') && !sh[0].p) : true;
      const m = sh[0].m || ''; res.teeDir = res.fir ? 'F' : m.includes('L') ? 'L' : m.includes('R') ? 'R' : 'X';
    }
    if (!res.gir) {
      const k = sh.findIndex(s => s.lie !== 'grn' && s.lie !== 'tee' && s.d <= o.argYards);
      if (k >= 0) res.ud = left(k) <= 2;
    }
    res.t5 = [
      h.par === 5 && score >= 6,
      score >= h.par + 2,
      putts >= 3,
      score >= h.par + 1 && sh.some((s, i) => (s.lie === 'fwy' || (s.lie === 'tee' && h.par === 3)) &&
        s.d <= o.wedgeYards && s.d > o.argYards && (i + 1 + penBefore[i]) <= Math.max(1, h.par - 2)),
      sh.some((s, i) => (s.lie === 'fwy' || s.lie === 'rgh') && s.d <= 30 && left(i) >= 3)
    ];
    res.left = sh.map((_, i) => left(i));
    return res;
  }

  function analyzeRound(r, base, o) {
    const z = () => ({ ott:0, app:0, arg:0, putt:0, tot:0 });
    // sg: shot-logged holes only (has the split). all: every hole with a total, scorecard holes included.
    const A = { holes:[], done:0, shot:0, score:0, par:0, sg:z(), live:z(), all:{ sg:0, n:0 }, pens:0, putts:0, puttN:0, gir:0, girN:0, fir:0, firN:0,
      ud:0, udN:0, t5:[0,0,0,0,0], tee:{ n:0, F:0, L:0, R:0, X:0 }, recs:[] };
    (r.holes || []).forEach((h, hi) => {
      const a = analyzeHole(h, base, o); A.holes.push(a);
      for (const k in a.sg) A.live[k] += a.sg[k];
      if (!a.done) return;
      A.done++; A.score += a.score; A.par += h.par; A.pens += a.pens;
      if (a.putts != null) { A.putts += a.putts; A.puttN++; }
      if (a.gir != null) { A.girN++; if (a.gir) A.gir++; }
      if (a.fir != null) { A.firN++; if (a.fir) A.fir++; }
      if (a.ud != null) { A.udN++; if (a.ud) A.ud++; }
      if (a.teeDir) { A.tee.n++; A.tee[a.teeDir]++; }
      a.t5.forEach((v, i) => { if (v) A.t5[i]++; });
      if (a.card) { if (a.sgTot != null) { A.all.sg += a.sgTot; A.all.n++; } return; }
      A.shot++; A.all.sg += a.sg.tot; A.all.n++;
      for (const k in a.sg) A.sg[k] += a.sg[k];
      h.shots.forEach((s, i) => {
        const nx = h.shots[i+1];
        A.recs.push({ rid:r.id, date:r.date, cid:h.cid, hn:h.n, hi, par:h.par, i, lie:s.lie, d:+s.d, c:s.c || '', m:s.m || '', p:s.p || 0,
          sg:a.shots[i].sg, cat:a.shots[i].cat, nl: nx ? nx.lie : 'holed', nd: nx ? +nx.d : 0, left:a.left[i] });
      });
    });
    return A;
  }

  function aggregate(rounds, base, o) {
    const G = { n:0, holes:0, shot:0, shotRounds:0, score:0, par:0, sg:{ott:0,app:0,arg:0,putt:0,tot:0}, all:{ sg:0, n:0 }, pens:0, putts:0, puttN:0,
      gir:0, girN:0, fir:0, firN:0, ud:0, udN:0, t5:[0,0,0,0,0], tee:{ n:0, F:0, L:0, R:0, X:0 }, recs:[], rounds:[] };
    rounds.forEach(r => {
      const a = analyzeRound(r, base, o);
      if (!a.done) return;
      G.n++; G.holes += a.done; G.shot += a.shot; if (a.shot) G.shotRounds++;
      G.score += a.score; G.par += a.par; G.pens += a.pens; G.putts += a.putts; G.puttN += a.puttN;
      G.gir += a.gir; G.girN += a.girN; G.fir += a.fir; G.firN += a.firN; G.ud += a.ud; G.udN += a.udN;
      G.all.sg += a.all.sg; G.all.n += a.all.n;
      for (const k in a.sg) G.sg[k] += a.sg[k];
      for (const k in a.tee) G.tee[k] += a.tee[k];
      a.t5.forEach((v, i) => G.t5[i] += v);
      for (const x of a.recs) G.recs.push(x);
      G.rounds.push({ id:r.id, date:r.date, src:r.src || '', a });
    });
    return G;
  }

  const proxFt = x => x.nl === 'holed' ? 0 : x.nl === 'grn' ? x.nd : x.nd * 3;
  function buckets(recs, holes, o) {
    const row = (label, xs, extra) => {
      const n = xs.length, s = xs.reduce((t, x) => t + x.sg, 0);
      return Object.assign({ label, n, sg:s, per: n ? s / n : 0, per18: holes ? s / holes * 18 : 0 }, n ? extra(xs) : {});
    };
    const pct = (xs, f) => 100 * xs.filter(f).length / xs.length;
    const mean = (xs, f) => xs.reduce((t, x) => t + f(x), 0) / xs.length;
    const app = recs.filter(x => x.cat === 'app');
    const lo0 = o.argYards;
    const AR = [[lo0,100],[100,125],[125,150],[150,175],[175,200],[200,9999]].filter(b => b[1] > b[0]);
    const appRows = AR.map(([lo, hi]) => row(hi > 9000 ? `${lo}+` : `${lo}–${hi}`, app.filter(x => x.d > lo && x.d <= hi),
      xs => ({ green: pct(xs, x => x.nl === 'grn' || x.nl === 'holed'), prox: mean(xs, proxFt) })));
    const putt = recs.filter(x => x.cat === 'putt');
    const puttRows = BANDS.map(([lo, hi], bi) => Object.assign(row(hi > 900 ? `${lo}+` : `${lo}–${hi}`,
      putt.filter(x => (bi === 0 ? x.d >= lo : x.d > lo) && x.d <= hi),
      xs => ({ made: pct(xs, x => x.nl === 'holed'), three: pct(xs, x => x.left >= 3) })), { band: bi }));
    const ott = recs.filter(x => x.cat === 'ott');
    const clubs = [...new Set(ott.map(x => x.c))];
    const ottRows = clubs.map(c => Object.assign(row(c, ott.filter(x => x.c === c),
      xs => ({ fw: pct(xs, x => !x.p && (x.nl === 'fwy' || x.nl === 'grn' || x.nl === 'holed')), pen: pct(xs, x => x.p > 0),
        left: pct(xs, x => x.m.includes('L')), right: pct(xs, x => x.m.includes('R')) })), { club: c }))
      .sort((a, b) => b.n - a.n);
    const arg = recs.filter(x => x.cat === 'arg');
    const argRows = ['fwy','rgh','snd','rec'].map(l => Object.assign(row(LIES[l], arg.filter(x => x.lie === l),
      xs => ({ ud: pct(xs, x => x.left <= 2), prox: mean(xs, proxFt) })), { lie: l })).filter(r => r.n);
    return { app: appRows, putt: puttRows, ott: ottRows, arg: argRows };
  }

  /** Average finish distance (yards) by club on shots aimed at the hole from tee or fairway. */
  function clubProx(recs, o) {
    const m = {};
    recs.forEach(x => {
      if (!x.c || x.cat !== 'app' || (x.lie !== 'fwy' && x.lie !== 'tee')) return;
      const y = proxFt(x) / 3; (m[x.c] = m[x.c] || { n:0, s:0 }); m[x.c].n++; m[x.c].s += y;
    });
    for (const k in m) m[k].avg = m[k].s / m[k].n;
    return m;
  }

  // ---- Aim planners ----
  function erf(x) {
    const s = x < 0 ? -1 : 1; x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  const cdf = z => 0.5 * (1 + erf(z / Math.SQRT2));

  /** Tee shot: lateral corridor model. Returns expected score by aim offset (yards right of fairway centre). */
  function teePlan(p, base) {
    const rem = Math.max(20, p.len - p.total), half = p.fw / 2, sg = Math.max(1, p.sigma);
    const E = { fwy: expected('fwy', rem, base), rgh: expected('rgh', rem, base), rec: expected('rec', rem, base),
      snd: expected('snd', rem, base), pen: 1 + expected('rgh', rem + 15, base) };
    const zones = [
      { a:-Infinity, b:-(half + p.l1), t:p.lType }, { a:-(half + p.l1), b:-half, t:'rgh' }, { a:-half, b:half, t:'fwy' },
      { a:half, b:half + p.r1, t:'rgh' }, { a:half + p.r1, b:Infinity, t:p.rType }
    ];
    const lim = Math.ceil(half + Math.max(p.l1, p.r1) + 15), curve = [];
    let best = null;
    for (let a = -lim; a <= lim; a++) {
      let sum = 0, pOb = 0, pFw = 0, pPen = 0;
      for (const z of zones) {
        const pr = (z.b === Infinity ? 1 : cdf((z.b - a) / sg)) - (z.a === -Infinity ? 0 : cdf((z.a - a) / sg));
        if (z.t === 'ob') pOb += pr; else sum += pr * E[z.t];
        if (z.t === 'fwy') pFw += pr;
        if (z.t === 'pen') pPen += pr;
      }
      const v = (1 + pOb + sum) / (1 - pOb);
      const pt = { a, v, fw: pFw, bad: pOb + pPen };
      curve.push(pt);
      if (!best || v < best.v - 1e-9) best = pt;
    }
    return { curve, best, center: curve.find(c => c.a === 0), rem, lim };
  }

  /** Approach: 2-D green model. x across the green from its left edge, y from the front edge, yards. */
  function approachPlan(p, base) {
    const zs = [], ws = []; let wt = 0;
    for (let z = -2.5; z <= 2.5001; z += 0.5) { const w = Math.exp(-z * z / 2); zs.push(z); ws.push(w); wt += w; }
    for (let i = 0; i < ws.length; i++) ws[i] /= wt;
    const after = (x, y) => {
      const dist = Math.hypot(x - p.px, y - p.py);
      if (x >= 0 && x <= p.gw && y >= 0 && y <= p.gd) return { t:'grn', e: expected('grn', Math.max(1, dist * 3), base) };
      const dx = x < 0 ? -x : x > p.gw ? x - p.gw : 0, dy = y < 0 ? -y : y > p.gd ? y - p.gd : 0;
      const t = dx >= dy ? (x < 0 ? p.left : p.right) : (y < 0 ? p.short : p.long);
      if (t === 'ob') return { t, e: 0 };
      if (t === 'pen') return { t, e: 1 + expected('rgh', dist + 15, base) };
      return { t, e: expected(t, dist, base) };
    };
    const evalAim = (ax, ay) => {
      let sum = 0, pOb = 0, pGreen = 0, pBad = 0, pSand = 0;
      for (let i = 0; i < zs.length; i++) for (let j = 0; j < zs.length; j++) {
        const w = ws[i] * ws[j], r = after(ax + zs[i] * p.sx, ay + zs[j] * p.sy);
        if (r.t === 'ob') { pOb += w; pBad += w; } else sum += w * r.e;
        if (r.t === 'grn') pGreen += w; else if (r.t === 'pen') pBad += w; else if (r.t === 'snd') pSand += w;
      }
      return { ax, ay, v: (1 + pOb + sum) / (1 - pOb), green: pGreen, bad: pBad, sand: pSand };
    };
    let best = null;
    for (let ax = -4; ax <= p.gw + 4; ax++) for (let ay = -4; ay <= p.gd + 4; ay++) {
      const r = evalAim(ax, ay);
      if (!best || r.v < best.v - 1e-9) best = r;
    }
    return { best, pin: evalAim(p.px, p.py) };
  }

  /** Putt length (feet) that makes a shot from (lie, d) break even, or 'green' if any spot on the green gains. */
  function breakEven(lie, d, base) {
    const target = expected(lie, d, base) - 1;
    if (target >= expected('grn', 90, base)) return { any: true };
    if (target <= 1.0) return { ft: 0 };
    let lo = 1, hi = 90;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (expected('grn', mid, base) < target) lo = mid; else hi = mid; }
    return { ft: lo };
  }

  return { D, TOUR, PFT, PUTT, DELTA, BASES, LIES, BANDS, MAKE, TYPICAL, expected, analyzeHole, analyzeRound, aggregate, buckets,
    clubProx, teePlan, approachPlan, breakEven, cdf };
})();
if (typeof module !== 'undefined') module.exports = SGE;
