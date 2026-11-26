/* The tee and green pins that ship with the app (src/geo.json): every built-in hole is usable on a fresh phone,
   agrees with the scorecard, survives a backup restore, and never overwrites a hole the golfer mapped. */
const { start, ROOT } = require('./harness');
const fs = require('fs'), path = require('path');
const BACKUP = process.env.SL_BACKUP;
const geo = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'geo.json'), 'utf8')), seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'seed.json'), 'utf8'));
const mapped = Object.entries(geo.courses).filter(([, c]) => (c.holes || []).some(Boolean));
(async () => {
  const t = await start({ pins: true }), p = t.page;
  await t.open('courses');
  let d = await t.data();
  for (const [id, g] of mapped) {
    const c = d.courses.list.find(x => x.id === id), n = c.holes.filter(x => x.geo && x.geo.g && x.geo.g.length >= 3 && x.geo.t).length, want = g.holes.filter(Boolean).length;
    t.ok(n === want && c.holes.every(x => !x.geo || !x.geo.u), `${c.name}: ${want} holes arrive mapped on a fresh phone`, n);
  }
  t.ok((await t.text('.maprow')).includes('9 of 9 holes on the map') && (await t.text('.maprow')).includes('Edit the map'), 'Courses shows the first course fully mapped', await t.text('.maprow'));
  // every built-in hole: the play screen gives distances that agree with the card
  for (const [id, g] of mapped) {
    const card = seed.courses.list.find(x => x.id === id), tee = card.tees.find(x => x.name === card.defaultTee) || card.tees[0];
    await p.click('#tabs button[data-view=rounds]');
    if (await p.locator('button[data-act=closeRound]').count()) await p.click('button[data-act=closeRound]');
    await p.selectOption('#nr-c1', id); await p.click('form[data-sub=newRound] button[type=submit]');
    await t.mapReady();
    const bad = [];
    for (let i = 0; i < card.holes.length; i++) {
      await p.click(`button[data-act=hole][data-i="${i}"]`); await p.waitForTimeout(60);
      const tx = (await t.text('#fcb')).replace(/\n/g, ' '), m = /Front\s*(\d+)\s*Centre\s*(\d+)\s*Back\s*(\d+)/i.exec(tx);
      const ys = card.tees.map(x => x.yards[i]), lo = Math.min(...ys) * 0.8, hi = Math.max(...ys) * 1.06;
      if (!m || !(+m[1] < +m[2] && +m[2] < +m[3]) || +m[2] < lo || +m[2] > hi || +m[3] - +m[1] < 12 || +m[3] - +m[1] > 60 || !/from the tee/.test(tx)) bad.push([i + 1, tx, ys]);
    }
    t.ok(!bad.length, `${card.name}: all ${card.holes.length} holes show front < centre < back within the card's range`, bad);
    await p.click('button[data-act=hole][data-i="0"]');
  }
  await t.shot('t5-play-builtin');
  // on the course: stand on Caobas 1 tee, walk 240 down the hole, mark the ball
  await p.click('#tabs button[data-view=rounds]'); await p.click('button[data-act=closeRound]');
  await p.selectOption('#nr-c1', 'sdcc-caobas'); await p.click('form[data-sub=newRound] button[type=submit]'); await t.mapReady();
  const h1 = geo.courses['sdcc-caobas'].holes[0];
  await t.geo(h1.t, 4);
  await p.click('#gpsBar button');
  await p.waitForFunction(() => /from you/.test(document.querySelector('#fcb').textContent), null, { timeout: 8000 });
  const spot = await p.evaluate(([tee, g]) => SLMap.r6(SLMap.dest(tee, SLMap.bearing(tee, SLMap.centroid(g)), 240)), [h1.t, h1.g]);
  await t.geo(spot, 4); await p.waitForTimeout(400);
  await p.click('button[data-act=markBall]');
  await p.waitForFunction(() => /Pin dropped \d+ yards/.test(document.querySelector('#markMsg').textContent), null, { timeout: 12000 });
  const left = +/Pin dropped (\d+) yards/.exec(await t.text('#markMsg'))[1];
  t.ok(Math.abs(left - 140) <= 2, 'Caobas 1: 240 yards down the hole leaves about 140 to the middle of the green', left);
  await p.click('button[data-act=padClub][data-v=D]'); await p.click('form[data-sub=addShot] button[type=submit]');
  t.ok(/about 240 yd shot/.test(await t.text('.shots')), 'the drive is measured from the built-in tee pin', await t.text('.shots'));
  // a hole the golfer mapped is kept as it is
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('strokeLedger.v1')); d.courses.list[0].holes[1].geo = { t: [18.4390, -69.9920], g: [[18.4401, -69.9919], [18.4402, -69.9917], [18.4404, -69.9918], [18.4403, -69.9920]], u: 1 }; delete d.courses.list[0].holes[2].geo; localStorage.setItem('strokeLedger.v1', JSON.stringify(d)); });
  await p.reload(); await p.waitForSelector('#tabs button');
  d = await t.data();
  t.ok(d.courses.list[0].holes[1].geo.u === 1 && d.courses.list[0].holes[1].geo.g.length === 4, "a hole the golfer mapped is not overwritten by the built-in pins");
  t.ok(d.courses.list[0].holes[2].geo && d.courses.list[0].holes[2].geo.g.length === geo.courses['sdcc-caobas'].holes[2].g.length, 'a hole with no pins gets the built-in ones back');
  // the owner's backup: pins appear on the restored courses
  if (BACKUP && fs.existsSync(BACKUP)) {
    await p.click('#setupBtn'); await p.setInputFiles('#bk-file', BACKUP);
    await p.waitForSelector('button[data-act=restore]'); await p.click('button[data-act=restore]');
    await p.waitForFunction(() => /Restored/.test((document.querySelector('#backupMsg') || {}).textContent || ''));
    d = await t.data();
    const n = id => d.courses.list.find(x => x.id === id).holes.filter(x => x.geo && x.geo.g && x.geo.g.length >= 3).length;
    t.ok(mapped.every(([id, g]) => n(id) === g.holes.filter(Boolean).length), 'after loading the backup file, the restored courses have their pins', mapped.map(([id]) => [id, n(id)]));
    t.ok(Object.keys(d.rounds).length >= 28 && d.courses.list.filter(c => !c.holes.some(x => x.geo)).length >= 1, 'rounds restored; courses without built-in pins are left unmapped');
    await p.click('#tabs button[data-view=rounds]');
    await p.selectOption('#nr-c1', 'sdcc-pinos'); await p.click('form[data-sub=newRound] button[type=submit]'); await t.mapReady();
    t.ok(/Centre\s*\d+/i.test((await t.text('#fcb')).replace(/\n/g, ' ')), 'a new round on a restored course shows the map');
  } else console.log('  (no private backup given: restore checks skipped)');
  await t.end();
})().catch(e => { console.error(e); process.exit(1); });
