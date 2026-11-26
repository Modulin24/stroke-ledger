/* Loading a backup file, the photo's failure modes, a Casa de Campo style sharpness limit, and opening with no signal. */
const { start } = require('./harness');
const fs = require('fs'), path = require('path');
const BACKUP = process.env.SL_BACKUP;          // a private backup file, kept outside the repository
const TEE = [18.4370, -69.9905], G = [[18.44000, -69.99000], [18.44010, -69.98985], [18.44025, -69.98990], [18.44028, -69.99008], [18.44012, -69.99015]];
const seedGeo = p => p.evaluate(([tee, g]) => { const d = JSON.parse(localStorage.getItem('strokeLedger.v1')); d.courses.list[0].holes[0].geo = { t: tee, g, u: 1 }; localStorage.setItem('strokeLedger.v1', JSON.stringify(d)); }, [TEE, G]);
(async () => {
  // ---- 1. backup file
  let t = await start({}), p = t.page;
  await t.open('setup');
  if (BACKUP && fs.existsSync(BACKUP)) {
    const want = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    await p.setInputFiles('#bk-file', BACKUP);
    await p.waitForSelector('button[data-act=restore]');
    await p.click('button[data-act=restore]');
    await p.waitForFunction(() => /Restored/.test((document.querySelector('#backupMsg') || {}).textContent || ''));
    const d = await t.data();
    t.ok(Object.keys(d.rounds).length === Object.keys(want.rounds).length && d.courses.list.length === want.courses.list.length, 'backup file restores every round and course', [Object.keys(d.rounds).length, d.courses.list.length]);
    t.ok(JSON.stringify(d.settings.bag.map(c => c.id)) === JSON.stringify(want.settings.bag.map(c => c.id)), 'bag restored');
    t.ok(d.courses.list.every(c => !c.id.startsWith('sdcc') || (c.loc && Math.abs(c.loc[0] - 18.43733) < 1e-6)), 'restored courses pick up the built-in map location');
    const sum = k => Object.values(d.rounds).filter(r => !r.example).reduce((s, r) => s + r.holes.reduce((a, h) => a + (h.card ? +h.card[k] || 0 : 0), 0), 0);
    const wsum = k => Object.values(want.rounds).filter(r => !r.example).reduce((s, r) => s + r.holes.reduce((a, h) => a + (h.card ? +h.card[k] || 0 : 0), 0), 0);
    t.ok(sum('s') === wsum('s') && sum('s') > 1000 && sum('p') === wsum('p'), 'scorecard totals match the backup', [sum('s'), wsum('s'), sum('p')]);
    await p.click('button[data-act=go][data-view=rounds]');
    const n = await p.locator('.rcard').count();
    t.ok(n === Object.keys(want.rounds).length, 'all rounds listed', n);
    await p.click('button[data-act=go][data-view=stats]');
    t.ok((await t.text('#view')).length > 400 && !/NaN|undefined/.test(await t.text('#view')), 'stats render from the restored rounds');
    await t.shot('t3-restored-stats');
    await p.click('button[data-act=go][data-view=courses]');
    t.ok(await p.locator('.chips .chip').count() === want.courses.list.length && (await t.text('.maprow')).includes('Not on the map yet'), 'courses tab shows the restored courses, ready to map');
    await p.reload(); await p.waitForSelector('#tabs button');
    t.ok(Object.keys((await t.data()).rounds).length === Object.keys(want.rounds).length, 'data survives a reload');
  } else console.log('  (no private backup given: restore checks skipped)');
  await t.end();

  // ---- 2. no key: plain background, everything else works
  t = await start({ key: '' }); p = t.page;
  await t.open(); await seedGeo(p); await p.reload(); await p.waitForSelector('#tabs button');
  await p.click('form[data-sub=newRound] button[type=submit]'); await t.mapReady();
  t.ok(await p.evaluate(() => SLMap.photo.state) === 'nokey' && t.state.styles === 0 && t.state.tiles === 0, 'no key: Esri is never contacted');
  t.ok(/map key has not been added/.test(await t.text('.mapmsg')) && await p.locator('.mapattr').isHidden(), 'no key: a note explains, no Esri credit shown');
  t.ok(/Centre\s*387/i.test((await t.text('#fcb')).replace(/\n/g, ' ')), 'no key: distances still work');
  await t.tapMap([18.4392, -69.9902]);
  t.ok(/Pin dropped \d+ yards from the flag/.test(await t.text('#markMsg')), 'no key: marking by tap still works', await t.text('#markMsg'));
  await t.shot('t3-nokey');
  await p.click('#tabs button[data-view=rounds]'); await p.click('button[data-act=closeRound]'); await p.click('#setupBtn');
  t.ok(/Satellite photo: off until the map key is added/.test(await t.text('#view')), 'Setup says the photo is off');
  await t.end();

  // ---- 3. a key Esri rejects
  t = await start({ key: 'WRONG' }); p = t.page;
  await t.open(); await seedGeo(p); await p.reload(); await p.waitForSelector('#tabs button');
  await p.click('form[data-sub=newRound] button[type=submit]'); await t.mapReady();
  t.ok(await p.evaluate(() => SLMap.photo.state) === 'denied' && /map key was not accepted/.test(await t.text('.mapmsg')) && t.state.tiles === 0, 'rejected key: explained, no tiles requested');
  await t.end();

  // ---- 4. a region whose photo stops at level 18 (like Casa de Campo)
  t = await start({ maxPhoto: 18 }); p = t.page;
  await t.open(); await seedGeo(p); await p.reload(); await p.waitForSelector('#tabs button');
  await p.click('form[data-sub=newRound] button[type=submit]'); await t.mapReady();
  await p.click('button[data-act=mapView][data-v=green]'); await p.waitForTimeout(900);
  const z = await p.evaluate(() => [SLMap.photo.max, SLMap._map().getZoom(), SLMap._map().getMaxZoom()]);
  t.ok(z[0] === 18 && z[1] > 18.5 && t.state.badTiles === 0 && t.state.tiles > 0, 'level-18 region: zoomed past 18 on the green without asking for missing tiles', [z, t.state.badTiles]);
  await t.end();

  // ---- 5. opens with no signal after the first visit
  t = await start({}); p = t.page;
  await t.open(); await seedGeo(p);
  await p.waitForFunction(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.active); }, null, { timeout: 15000 });
  await p.reload(); await p.waitForSelector('#tabs button');
  await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  const cached = await p.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); return (await c.keys()).map(r => new URL(r.url).pathname.replace('/stroke-ledger/', '')); });
  t.ok(['index.html', 'vendor/maplibre-gl.js', 'vendor/maplibre-gl.css', 'config.js', 'geo.js'].every(f => cached.includes(f)), 'app files are kept on the device', cached);
  await t.ctx.setOffline(true); t.state.offline = true;
  await p.reload(); await p.waitForSelector('#tabs button');
  t.ok((await t.text('.brand h1')).trim().toUpperCase() === 'STROKE LEDGER' && await p.locator('.rcard').count() >= 1, 'app opens offline with its data');
  await p.click('form[data-sub=newRound] button[type=submit]'); await t.mapReady();
  t.ok(await p.evaluate(() => SLMap.photo.state) === 'offline' && /No connection for the satellite photo/.test(await t.text('.mapmsg')), 'offline: map says the photo needs a connection');
  t.ok(/Centre\s*387/i.test((await t.text('#fcb')).replace(/\n/g, ' ')), 'offline: distances still work');
  await t.tapMap([18.4392, -69.9902]);
  await p.click('button[data-act=padClub][data-v=D]'); await p.click('form[data-sub=addShot] button[type=submit]');
  const d2 = await t.data(), h = Object.values(d2.rounds).find(r => !r.example).holes[0];
  t.ok(h.shots.length === 1 && h.next.g, 'offline: a shot can be marked and saved');
  t.errors.length = 0;          // offline resource errors are expected here
  await t.end();
})().catch(e => { console.error(e); process.exit(1); });
