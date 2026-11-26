/* On the course: the suggested club, 2 putts / 3 putts, the backup reminder, the battery-saver GPS, and club distances measured on the map. */
const { start, ROOT } = require('./harness');
const fs = require('fs'), path = require('path');
const geo = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'geo.json'), 'utf8')).courses['sdcc-caobas'].holes;
const real = async t => Object.values((await t.data()).rounds).filter(r => !r.example && !/^gps/.test(r.id));
const hole = async (t, i) => (await real(t)).sort((a, b) => b.createdAt - a.createdAt)[0].holes[i];
const O = { argYards: 50, wedgeYards: 150 };
let fails = 0;
(async () => {
  // ---------- 1. the suggested club, and finishing a hole with 2 or 3 putts
  let t = await start({ pins: true }), p = t.page;
  await t.open();
  t.ok(await p.locator('#bkNag').count() === 0, 'a new phone with only the example round shows no backup reminder');
  await p.selectOption('#nr-c1', 'sdcc-caobas'); await p.click('form[data-sub=newRound] button[type=submit]'); await t.mapReady();
  const pressed = () => p.$$eval('button[data-act=padClub][aria-pressed=true]', b => b.map(x => x.dataset.v));
  t.ok(JSON.stringify(await pressed()) === '["D"]' && await p.locator('#clubSugg').count() === 1, 'par 4 tee shot with no plan: the longest club is suggested', await pressed());
  await p.click('button[data-act=padClub][data-v=D]');
  t.ok(JSON.stringify(await pressed()) === '["D"]' && await p.locator('#clubSugg').count() === 0, 'tapping the suggested club confirms it');
  await p.click('button[data-act=padClub][data-v=D]');
  t.ok((await pressed()).length === 0, 'tapping it again clears it, as before');
  await p.click('button[data-act=padClub][data-v=D]');
  await p.click('button[data-act=padLie][data-v=fwy]'); await p.fill('#pad-d', '150'); await p.click('form[data-sub=addShot] button[type=submit]');
  t.ok(JSON.stringify(await pressed()) === '["7i"]', 'from 150 yards the club with the nearest carry is suggested (7-iron, 150)', await pressed());
  await p.click('button[data-act=padLie][data-v=grn]'); await p.fill('#pad-d', '25'); await p.click('form[data-sub=addShot] button[type=submit]');
  let h = await hole(t, 0);
  t.ok(h.shots[1].c === '7i', 'a suggested club left as it is is saved with the shot');
  t.ok(JSON.stringify(await pressed()) === '["P"]' && await p.locator('button[data-act=putts]').count() === 2 && await p.locator('#clubSugg').count() === 0, 'on the green: the putter, plus 2 putts and 3 putts');
  await p.click('button[data-act=putts][data-v="2"]');
  h = await hole(t, 0);
  let a = await p.evaluate(([h, o]) => { const a = SGE.analyzeHole(h, 'h10', o); return { score: a.score, putts: a.putts, putt: a.sg.putt, e25: SGE.expected('grn', 25, 'h10'), sg: a.shots.map(s => s.sg) }; }, [h, O]);
  t.ok(h.done && h.shots.length === 4 && h.shots[2].d === 25 && h.shots[3].u === 1 && h.shots[3].d === null && h.shots[3].c === 'P', '2 putts with no length typed: the second putt is kept without a length', h.shots);
  t.ok(a.score === 4 && a.putts === 2 && Math.abs(a.putt - (a.e25 - 2)) < 1e-9 && a.sg[3] === null, 'score 4, 2 putts, putting strokes gained = expected from 25 ft minus 2', a);
  t.ok(/length not logged/.test(await t.text('.shots')) && /includes the next putt/.test(await t.text('.shots')), 'the shot list says which putt carries the strokes gained');
  await p.click('button[data-act=reopen]');
  h = await hole(t, 0);
  t.ok(!h.done && h.shots.length === 2 && h.next.lie === 'grn' && h.next.d === 25, 'Reopen takes both putts off and puts the ball back 25 feet out', [h.shots.length, h.next]);
  await p.fill('#pad-d', '3'); await p.click('button[data-act=putts][data-v="3"]');
  h = await hole(t, 0);
  a = await p.evaluate(([h, o]) => { const a = SGE.analyzeHole(h, 'h10', o); return { score: a.score, putt: a.sg.putt, t5: a.t5[2], e25: SGE.expected('grn', 25, 'h10') }; }, [h, O]);
  t.ok(h.shots.length === 5 && h.shots[3].d === 3 && !h.shots[3].u && h.shots[4].u === 1, '3 putts with the next length typed: that putt keeps its 3 feet', h.shots.slice(2));
  t.ok(a.score === 5 && a.t5 === true && Math.abs(a.putt - (a.e25 - 3)) < 1e-9, 'score 5, a three-putt in Tiger 5, putting strokes gained = expected from 25 ft minus 3', a);
  await p.click('.shots li:nth-child(5) .shot-main'); await p.click('button[data-act=delShot]');
  h = await hole(t, 0);
  t.ok(h.done && h.shots.length === 4 && !h.shots.some(s => s.u), 'deleting a putt with no length leaves the hole holed with one putt fewer');
  // par 3: the club that fits the yardage
  await p.click('.strip button[data-i="1"]');
  t.ok(JSON.stringify(await pressed()) === '["4H"]', 'par 3 of 188 yards: the 4-hybrid (185 carry) is suggested', await pressed());
  // the hole plan's club wins on the tee
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('strokeLedger.v1')); d.courses.list.find(c => c.id === 'sdcc-caobas').holes[2].plan.club = '3W'; localStorage.setItem('strokeLedger.v1', JSON.stringify(d)); });
  await p.reload(); await p.waitForSelector('#tabs button');
  const rid = (await real(t))[0].id;
  await p.click(`.rcard[data-id="${rid}"]`); await t.mapReady();
  await p.click('.strip button[data-i="2"]');
  t.ok(JSON.stringify(await pressed()) === '["3W"]', "with a plan on the hole, the plan's club is suggested on the tee", await pressed());
  await p.click('button[data-act=padLie][data-v=fwy]'); await p.fill('#pad-d', '40'); await p.click('form[data-sub=addShot] button[type=submit]');
  t.ok(JSON.stringify(await pressed()) === '["LW"]', 'around the green with no history: the shortest club', await pressed());
  await p.click('button[data-act=padClub][data-v=SW]'); await p.click('button[data-act=padLie][data-v=grn]'); await p.fill('#pad-d', '8'); await p.click('form[data-sub=addShot] button[type=submit]');
  await p.click('button[data-act=holed]');
  await p.click('.strip button[data-i="3"]');
  await p.click('button[data-act=padLie][data-v=fwy]'); await p.fill('#pad-d', '30'); await p.click('form[data-sub=addShot] button[type=submit]');
  t.ok(JSON.stringify(await pressed()) === '["SW"]', 'around the green: the club used most often from there before', await pressed());
  await p.click('.strip button[data-i="4"]');
  await p.click('button[data-act=padLie][data-v=rec]'); await p.fill('#pad-d', '120'); await p.click('form[data-sub=addShot] button[type=submit]');
  t.ok((await pressed()).length === 0 && /Pick the club you hit/.test(await t.text('form[data-sub=addShot]')), 'from the trees nothing is suggested');
  for (const v of ['stats', 'best']) { await p.click(`#tabs button[data-view=${v}]`); await p.waitForTimeout(150); }      // both must draw (page errors are checked at the end)

  // ---------- 2. the backup reminder
  await p.click('#tabs button[data-view=rounds]');
  if (await p.locator('button[data-act=closeRound]').count()) await p.click('button[data-act=closeRound]');
  t.ok(/No backup file has been saved from this device yet/.test(await t.text('#bkNag')), 'with a real round on the phone, Rounds asks for a backup', await t.text('#view'));
  await p.click('button[data-act=nagLater]');
  t.ok(await p.locator('#bkNag').count() === 0, 'Not now hides it');
  await p.reload(); await p.waitForSelector('#tabs button');
  t.ok(await p.locator('#bkNag').count() === 1, 'and it is back the next time the app opens');
  await p.click('#setupBtn');
  t.ok(/No backup file saved from this device yet/.test(await t.text('#bkFacts')), 'Setup says no backup file has been saved', await t.text('#bkFacts'));
  t.ok(/No measured shots yet/.test(await t.text('#gpsClubs')), 'Measured on the course is empty when no shot has both ends pinned');
  await p.click('#tabs button[data-view=rounds]');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('button[data-act=nagBackup]')]);
  const file = path.join(__dirname, 'out', 't7-backup.json'); await dl.saveAs(file);
  const bk = JSON.parse(fs.readFileSync(file, 'utf8'));
  t.ok(bk.app === 'stroke-ledger' && bk.rounds[rid] && /Stroke Ledger backup \d{4}-\d\d-\d\d\.json/.test(dl.suggestedFilename()), 'Save a backup file saves the whole backup', dl.suggestedFilename());
  t.ok(await p.locator('#bkNag').count() === 0 && /Backup file saved/.test(await t.text('.okn')) && +(await p.evaluate(() => localStorage.getItem('strokeLedger.backupAt'))) > 0, 'the reminder goes and the save is remembered');
  await p.click('#setupBtn');
  t.ok(/Last backup file from this device: .*\(today\)/.test(await t.text('#bkFacts')), 'Setup shows when the last backup was', await t.text('#bkFacts'));
  await p.click('#tabs button[data-view=rounds]');
  t.ok(await p.locator('#bkNag').count() === 0 && await p.locator('.okn').count() === 0, 'nothing changed since: no reminder');
  await p.click(`.rcard[data-id="${rid}"]`);
  await p.fill('#r-notes', 'windy'); await p.locator('#r-notes').blur();
  await p.click('button[data-act=closeRound]');
  t.ok(/Last backup file: today\. Since then 1 round has changed\./.test(await t.text('#bkNag')), 'a change after the backup brings the reminder back, with what changed', await t.text('#bkNag'));
  await p.click('#tabs button[data-view=guide]'); await p.click('button[data-act=practiceOn]'); await p.click('#tabs button[data-view=rounds]');
  t.ok(await p.locator('#bkNag').count() === 0, 'no reminder in practice mode');
  await p.click('button[data-act=practiceOff]');
  await p.click('#setupBtn'); await p.setInputFiles('#bk-file', file);
  await p.waitForSelector('button[data-act=restore]'); await p.click('button[data-act=restore]');
  await p.waitForFunction(() => /Restored/.test((document.querySelector('#backupMsg') || {}).textContent || ''));
  await p.click('#tabs button[data-view=rounds]');
  t.ok(await p.locator('#bkNag').count() === 0, 'loading a backup file counts as backed up');
  // Finish round brings the reminder back even after Not now
  await p.click('form[data-sub=newRound] button[type=submit]');
  await p.click('button[data-act=holed]');
  await p.click('button[data-act=closeRound]'); await p.click('button[data-act=nagLater]');
  const rid2 = (await real(t)).sort((x, y) => y.createdAt - x.createdAt)[0].id;
  await p.click(`.rcard[data-id="${rid2}"]`);
  for (let i = 1; i < 9; i++) { await p.click(`.strip button[data-i="${i}"]`); await p.click('button[data-act=holed]'); }
  await p.click('button[data-act=finishRound]');
  t.ok(await p.locator('#bkNag').count() === 1 && (await p.locator('.rhead').count()) === 0, 'Finish round goes back to Rounds and shows the reminder again');
  await t.end(); fails += t.fails;

  // ---------- 3. battery saver GPS
  const TEE = geo[0].t;
  t = await start({ pins: true, geo: { latitude: TEE[0], longitude: TEE[1], accuracy: 4 } }); p = t.page;
  await t.open('setup'); await p.click('button[data-act=gpsSet][data-v="1"]');
  await p.click('#tabs button[data-view=rounds]'); await p.selectOption('#nr-c1', 'sdcc-caobas'); await p.click('form[data-sub=newRound] button[type=submit]'); await t.mapReady();
  await p.waitForFunction(() => SLMap.gps.id != null && SLMap.fresh(), null, { timeout: 8000 });
  t.ok(true, 'Live: the GPS watch runs while the map is on screen');
  await p.click('button[data-act=gpsMode][data-v=tap]');
  t.ok(await p.evaluate(() => SLMap.gps.mode === 'tap' && SLMap.gps.id == null && localStorage.getItem('strokeLedger.gpsMode') === 'tap'), 'Battery saver, switched on from the hole screen, stops the watch and is remembered');
  await p.reload(); await p.waitForSelector('#tabs button');
  const rid3 = (await real(t))[0].id;
  await p.click('#tabs button[data-view=rounds]'); await p.click(`.rcard[data-id="${rid3}"]`); await t.mapReady(); await p.waitForTimeout(1500);
  t.ok(await p.evaluate(() => SLMap.gps.id == null && !SLMap.fresh()) && (await t.text('#gpsBar')).trim() === 'Get GPS', 'Battery saver: no GPS running with the map open, and a Get GPS button', await t.text('#gpsBar'));
  await p.click('#gpsBar button[data-act=gpsFix]');
  await p.waitForFunction(() => /± \d+ yd/.test(document.querySelector('#gpsBar').textContent), null, { timeout: 8000 });
  t.ok(/from you/.test(await t.text('#fcb')) && await p.evaluate(() => SLMap.gps.id == null), 'tapping it takes one position: distances from where you stand, still no watch', await t.text('#fcb'));
  await p.click('button[data-act=markBall]');
  await p.waitForFunction(() => /Pin dropped \d+ yards/.test((document.querySelector('#markMsg') || {}).textContent || ''), null, { timeout: 8000 });
  t.ok(await p.evaluate(() => SLMap.gps.id == null), 'Mark ball here works in battery saver');
  await p.click('button[data-act=aimToggle]'); await p.waitForSelector('.aimbar');
  await p.click('button[data-act=padLie][data-v=fwy]'); await p.click('form[data-sub=addShot] button[type=submit]');
  h = await hole(t, 0);
  t.ok(Array.isArray(h.shots[0].a) && h.shots[0].a.length === 2, 'a shot saved with Aim on keeps the aim point', h.shots[0]);
  await p.click('button[data-act=mapView][data-v=me]'); await p.waitForTimeout(300);
  await p.click('button[data-act=closeRound]'); await p.click('#setupBtn');
  t.ok(/wakes only when you tap/.test(await t.text('#gpsModeNote')) && await p.locator('#gpsModeNote').count() === 1, 'Setup shows the same switch, on Battery saver');
  await p.click('button[data-act=gpsMode][data-v=live]');
  await p.click('#tabs button[data-view=rounds]'); await p.click(`.rcard[data-id="${rid3}"]`); await t.mapReady();
  await p.waitForFunction(() => SLMap.gps.id != null, null, { timeout: 8000 });
  t.ok(true, 'back to Live, the watch runs again');
  await t.end(); fails += t.fails;

  // ---------- 4. club distances measured on the map
  t = await start({ pins: true }); p = t.page;
  await t.open();
  await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('strokeLedger.v1')), g = d.courses.list.find(x => x.id === 'sdcc-caobas').holes[0].geo;
    const tee = g.t, cen = SLMap.centroid(g.g), b = SLMap.bearing(tee, cen), d0 = Math.round(SLMap.dist(tee, cen));
    const at = (from, fwd, side) => SLMap.r6(SLMap.dest(SLMap.dest(from, b, fwd), b + 90, side));
    let i = 0;
    const add = shots => { const id = 'gps' + i; d.rounds[id] = { id, date: '2026-10-' + String(10 + i).padStart(2, '0'), createdAt: 1 + i, updatedAt: 1, notes: '', segs: [{ courseId: 'sdcc-caobas', name: 'SDCC Caobas', tee: 'White' }], holes: [{ cid: 'sdcc-caobas', n: 1, par: 4, yards: 391, shots, done: true }] }; i++; };
    [[260, 10], [270, -6], [280, 12], [275, 0], [265, 8], [150, 0]].forEach(([f, s]) => add([{ lie: 'tee', d: d0, c: 'D' }, { lie: 'fwy', d: 100, c: '', g: at(tee, f, s) }]));
    add([{ lie: 'tee', d: d0 + 25, c: 'D' }, { lie: 'fwy', d: 100, c: '', g: at(tee, 300, 40) }]);          // tee pin 25 yds off today's yardage: left out
    const st = SLMap.r6(SLMap.dest(cen, b + 180, 150)), fin = (dy, dx) => SLMap.r6(SLMap.dest(SLMap.dest(cen, b, dy), b + 90, dx));
    [[5, -3], [-4, 2], [8, 6], [-6, -4], [2, 0]].forEach(([dy, dx]) => add([{ lie: 'tee', d: d0, c: 'D', p: 1 }, { lie: 'fwy', d: 150, c: '7i', g: st }, { lie: 'grn', d: 10, c: 'P', g: fin(dy, dx) }]));
    add([{ lie: 'tee', d: d0, c: 'D', p: 1 }, { lie: 'rgh', d: 150, c: '7i', g: st }, { lie: 'grn', d: 10, c: 'P', g: fin(40, 30) }]);   // from the rough: left out
    add([{ lie: 'tee', d: d0, c: 'D', p: 1 }, { lie: 'fwy', d: 140, c: '8i', g: SLMap.r6(SLMap.dest(cen, b + 180, 140)) }, { lie: 'grn', d: 10, c: 'P', g: fin(0, 0) }]);
    localStorage.setItem('strokeLedger.v1', JSON.stringify(d));
  });
  await p.reload(); await p.waitForSelector('#tabs button'); await p.click('#setupBtn');
  const rows = await p.$$eval('#gpsClubs tbody tr', rs => rs.map(r => [...r.querySelectorAll('td')].map(td => td.innerText.trim())));
  const row = name => rows.find(r => r[0] === name) || [];
  const dr = row('Driver'), i7 = row('7-iron'), i8 = row('8-iron');
  t.ok(dr[1] === '6' && dr[2] === '270' && dr[3] === '150–280', 'Driver: 6 drives measured (the off-yardage tee left out), typical 270 once the 150-yard mishit is set aside', dr);
  t.ok(dr[4] === '± 8 (6)' && dr[5] === '4 right' && dr[6] === '± 7 (5)', 'Driver pattern: ± 8 left-right, 4 right on average, ± 7 long-short', dr);
  t.ok(i7[1] === '5' && i7[2] === '152' && i7[4] === '± 4 (5)' && i7[5] === 'on line' && i7[6] === '± 5 (5)', '7-iron at the flag: 5 shots (rough and penalty shots left out), typical 152, ± 4 and ± 5', i7);
  t.ok(i8[1] === '1' && /needs 3/.test(i8[2]) && await p.locator('#gpsClubs button[data-act=useGps][data-c="8i"]').count() === 0, 'one 8-iron shot is shown but cannot replace the bag numbers yet', i8);
  t.ok(!rows.some(r => r[0] === 'Putter'), 'putts are not measured');
  await p.click('#gpsClubs button[data-act=useGps][data-c=D]'); await p.click('#gpsClubs button[data-act=useGps][data-c="7i"]');
  const bag = (await t.data()).settings.bag, D = bag.find(c => c.id === 'D'), S7 = bag.find(c => c.id === '7i');
  t.ok(D.total === 270 && D.carry === 248 && D.lat === 8 && D.depth === 7, 'Use in bag: Driver total 270, carry moved by the same share (248), ± 8 and ± 7', D);
  t.ok(S7.total === 152 && S7.carry === 146 && S7.lat === 4 && S7.depth === 5, 'Use in bag: 7-iron total 152, carry 146, ± 4 and ± 5', S7);
  await t.end(); fails += t.fails;
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
