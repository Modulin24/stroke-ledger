/* Moving the tee during a round: drag the T, this round only; par 3s take their yardage from it; reset; limits; aim follows. */
const { start, ROOT } = require('./harness');
const fs = require('fs'), path = require('path');
const geo = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'geo.json'), 'utf8')).courses['sdcc-caobas'].holes;
const hole = async (t, i) => Object.values((await t.data()).rounds).find(r => !r.example).holes[i];
(async () => {
  const t = await start({ pins: true }), p = t.page;
  await t.open();
  await p.selectOption('#nr-c1', 'sdcc-caobas'); await p.click('form[data-sub=newRound] button[type=submit]'); await t.mapReady();
  const calc = (tee, g, fwd, side = 0) => p.evaluate(([tee, g, fwd, side]) => { const c = SLMap.centroid(g), b = SLMap.bearing(tee, c), q = SLMap.r6(SLMap.dest(SLMap.dest(tee, b, fwd), b + 90, side)); return { to: q, left: SLMap.dist(q, c), c }; }, [tee, g, fwd, side]);
  // ---- par 4: Caobas 1
  t.ok(await p.inputValue('#pad-d0') === '391' && await p.locator('button[data-act=resetTee]').count() === 0 && /Drag the T/.test(await t.text('form[data-sub=addShot]')), 'par 4 starts on the card yardage, with a hint that the T can be dragged');
  let m = await calc(geo[0].t, geo[0].g, 25, 6);
  await t.dragMarker('.mk-tee', m.to);
  let h = await hole(t, 0);
  t.ok(h.tg && Math.abs(h.tg[0] - m.to[0]) < 4e-5 && Math.abs(h.tg[1] - m.to[1]) < 4e-5, 'dragging the T saves the tee for this round', [h.tg, m.to]);
  t.ok(await p.inputValue('#pad-d0') === '391' && /Tee moved for this round\. If the hole plays longer or shorter/.test(await t.text('#markMsg')), 'par 4: yardage is left for the golfer to change', await t.text('#markMsg'));
  const built = (await t.data()).courses.list[0].holes[0].geo;
  t.ok(built.t[0] === geo[0].t[0] && built.t[1] === geo[0].t[1] && !built.u, "the course's own tee pin is untouched");
  // aim follows the moved tee
  await p.click('button[data-act=aimToggle]');
  let from = await p.evaluate(async () => (await SLMap._map().getSource('sl-aim').getData()).features[0].geometry.coordinates[0]);
  t.ok(Math.abs(from[1] - h.tg[0]) < 1e-6 && Math.abs(from[0] - h.tg[1]) < 1e-6, 'the aim line starts at the moved tee');
  const m2 = await calc(geo[0].t, geo[0].g, 10, -5);
  await p.click('button[data-act=mapView][data-v=hole]');
  await t.dragMarker('.mk-tee', m2.to);
  h = await hole(t, 0);
  from = await p.evaluate(async () => (await SLMap._map().getSource('sl-aim').getData()).features[0].geometry.coordinates[0]);
  t.ok(Math.abs(from[1] - h.tg[0]) < 1e-6 && /Driver aimed 250 yds away/.test(await t.text('.aimbar')), 'moving the tee again moves the aim line with it', await t.text('.aimbar'));
  await p.click('button[data-act=aimToggle]');
  // the drive is measured from the moved tee, without "about"
  const ball = await p.evaluate(([tee, g]) => SLMap.r6(SLMap.dest(tee, SLMap.bearing(tee, SLMap.centroid(g)), 210)), [h.tg, geo[0].g]);
  await p.click('button[data-act=mapView][data-v=hole]');
  await t.tapMap(ball);
  await p.click('button[data-act=padClub][data-v=D]'); await p.click('form[data-sub=addShot] button[type=submit]');
  const row = await t.text('.shots');
  t.ok(/\n(20[89]|21[01]) yd shot/.test(row) && !/about/.test(row), 'the drive is measured from the moved tee', row);
  // after the first shot the T can still be corrected
  await p.click('button[data-act=mapView][data-v=hole]');
  const m3 = await calc(geo[0].t, geo[0].g, 0, 0);
  await t.dragMarker('.mk-tee', m3.to);
  h = await hole(t, 0);
  t.ok(Math.abs(h.tg[0] - geo[0].t[0]) < 4e-5 && /\n(21[6-9]|22[0-2]) yd shot/.test(await t.text('.shots')) && h.shots[0].d === 391, 'the T can be corrected after the shot; the drive distance follows, the saved yardage does not change', await t.text('.shots'));
  // ---- par 3: Caobas 2
  await p.click('button[data-act=hole][data-i="1"]'); await p.waitForTimeout(300);
  t.ok(await p.inputValue('#pad-d0') === '188', 'par 3 starts on the card yardage');
  m = await calc(geo[1].t, geo[1].g, 20);
  await t.dragMarker('.mk-tee', m.to);
  h = await hole(t, 1);
  const want = String(Math.round(await p.evaluate(([a, c]) => SLMap.dist(a, c), [h.tg, m.c])));
  t.ok(await p.inputValue('#pad-d0') === want && new RegExp(`The hole now plays ${want} yards`).test(await t.text('#markMsg')) && Math.abs(+want - 168) <= 2, 'par 3: dragging the T sets what the hole plays', [await p.inputValue('#pad-d0'), want]);
  // move the flag: tee-to-flag becomes the yardage
  await p.click('button[data-act=mapView][data-v=green]');
  const pin = await p.evaluate(([c, tee]) => SLMap.r6(SLMap.dest(c, SLMap.bearing(tee, c), 9)), [m.c, h.tg]);
  await t.dragMarker('.mk-flag', pin);
  h = await hole(t, 1);
  const want2 = String(Math.round(await p.evaluate(([a, b]) => SLMap.dist(a, b), [h.tg, h.pin])));
  t.ok(h.pin && await p.inputValue('#pad-d0') === want2 && +want2 > +want + 5, 'par 3: moving the flag back makes the hole play longer', [want, want2]);
  // limits: the T cannot go on the green
  await p.click('button[data-act=mapView][data-v=hole]');
  const tg0 = h.tg;
  await t.dragMarker('.mk-tee', m.c);
  h = await hole(t, 1);
  t.ok(h.tg[0] === tg0[0] && h.tg[1] === tg0[1] && /has to stay on this hole/.test(await t.text('#markMsg')), 'the T is refused on the green and snaps back', await t.text('#markMsg'));
  const back = await p.evaluate(() => { const q = [...document.querySelectorAll('.mk-tee')][0].getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; });
  const [bx, by] = await t.px(tg0);
  t.ok(Math.abs(back[0] - bx) < 3 && Math.abs(back[1] - by) < 3, 'the T is drawn back at the saved tee');
  // reset
  await p.click('button[data-act=resetTee]');
  h = await hole(t, 1);
  t.ok(!h.tg && await p.inputValue('#pad-d0') === '188' && await p.locator('button[data-act=resetTee]').count() === 0, 'Reset the tee returns to the course tee and the card yardage');
  // play the par 3 with a moved tee: the tee shot is scored from the new yardage
  await p.click('button[data-act=mapView][data-v=hole]');
  m = await calc(geo[1].t, geo[1].g, -12);
  await t.dragMarker('.mk-tee', m.to);
  h = await hole(t, 1);
  const d0 = await p.inputValue('#pad-d0');
  const want3 = Math.round(await p.evaluate(([a, b]) => SLMap.dist(a, b), [h.tg, h.pin]));
  t.ok(h.tg && +d0 === want3 && want3 > 200 && want3 < 215, 'moving the T back 12 yards: the par 3 plays tee to flag (flag is 9 back, so about 209)', [d0, want3]);
  await p.click('button[data-act=mapView][data-v=green]');
  await t.tapMap(m.c);
  await p.fill('#pad-d', '14'); await p.click('button[data-act=padClub][data-v="5i"]'); await p.click('form[data-sub=addShot] button[type=submit]');
  h = await hole(t, 1);
  t.ok(h.shots[0].lie === 'tee' && h.shots[0].d === +d0 && +d0 > 195 && h.next.lie === 'grn' && h.next.d === 14, 'the tee shot is saved with the yardage from the moved tee', [h.shots[0], d0]);
  // with a mouse: letting go outside the photo ends the drag instead of leaving the T stuck to the pointer
  await p.click('button[data-act=hole][data-i="2"]'); await p.waitForTimeout(300);
  await p.click('button[data-act=mapView][data-v=hole]');
  await p.evaluate(() => document.querySelector('#mapSlot').scrollIntoView({ block: 'center' })); await p.waitForTimeout(200);          // clear of the tab bar docked at the bottom
  { const b = await p.locator('.mk-tee').first().boundingBox(), box = await p.locator('#mapSlot').boundingBox(), sx = b.x + b.width / 2, sy = b.y + b.height / 2;
    await p.mouse.move(sx, sy); await p.mouse.down(); for (let i = 1; i <= 5; i++) await p.mouse.move(sx - 6 * i, sy - 5 * i);
    await p.mouse.move(box.x - 12, sy - 40); await p.mouse.up(); await p.waitForTimeout(200);
    h = await hole(t, 2);
    t.ok(!!h.tg, 'mouse released outside the photo: the tee is saved where it was left', h.tg);
    const tg = JSON.stringify(h.tg); await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 30); await p.waitForTimeout(150);
    const q = await p.locator('.mk-tee').first().boundingBox(), [ex, ey] = await t.px(h.tg);
    t.ok(JSON.stringify((await hole(t, 2)).tg) === tg && Math.abs(q.x + q.width / 2 - ex) < 3 && Math.abs(q.y + q.height / 2 - ey) < 3, 'and the T no longer follows the pointer'); }
  // a new round starts from the course tee again
  await p.click('button[data-act=closeRound]');
  await p.selectOption('#nr-c1', 'sdcc-caobas'); await p.click('form[data-sub=newRound] button[type=submit]'); await t.mapReady();
  const rs = Object.values((await t.data()).rounds).filter(r => !r.example);
  t.ok(rs.length === 2 && rs.some(r => !r.holes[0].tg && !r.holes[1].tg) && await p.inputValue('#pad-d0') === '391', 'the next round starts from the course tee again');
  await t.shot('t6-tee');
  await t.end();
})().catch(e => { console.error(e); process.exit(1); });
