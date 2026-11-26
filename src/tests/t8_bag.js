/* Each golfer's own bag: the prompt before the first round, changes remembered on the device, changes between rounds, and what counts as a putt. */
const { start } = require('./harness');
const bag = async t => (await t.data()).settings.bag;
const real = async t => Object.values((await t.data()).rounds).filter(r => !r.example).sort((a, b) => a.createdAt - b.createdAt);
const setNum = async (p, id, v) => { await p.fill('#' + id, String(v)); await p.locator('#' + id).blur(); await p.waitForTimeout(60); };
const chips = p => p.$$eval('button[data-act=padClub]', b => b.map(x => x.textContent));
const pressed = p => p.$$eval('button[data-act=padClub][aria-pressed=true]', b => b.map(x => x.textContent));
const save = async (p, lie, d) => { await p.click(`button[data-act=padLie][data-v=${lie}]`); await p.fill('#pad-d', String(d)); await p.click('form[data-sub=addShot] button[type=submit]'); };
let fails = 0;
(async () => {
  // ---------- 1. a friend opens the link on an iPhone for the first time
  let t = await start({}), p = t.page;
  await t.open();
  t.ok((await t.text('#view')).includes('Put this app on your Home Screen') && await p.locator('#bagNudge').count() === 0, 'iPhone in Safari: the Home Screen step comes first, the bag prompt waits');
  await p.click('button[data-act=hintOff]');
  t.ok(/Set up your bag\. The app starts with a standard set of 14 clubs/.test(await t.text('#bagNudge')), 'a new golfer is asked to set up their bag before the first round', await t.text('#view'));
  await p.click('#tabs button[data-view=guide]'); await p.click('button[data-act=practiceOn]'); await p.click('#tabs button[data-view=rounds]');
  t.ok(await p.locator('#bagNudge').count() === 0, 'no bag prompt in practice mode');
  await p.click('button[data-act=practiceOff]');
  await p.click('button[data-act=bagSetup]');
  const top = await p.evaluate(() => { const r = document.querySelector('#bagCard').getBoundingClientRect(); return [location.hash, Math.round(r.top), innerHeight]; });
  t.ok(top[0] === '#setup' && top[1] > -10 && top[1] < top[2] * 0.5 && /saved on this device/.test(await t.text('#bagSaved')), 'Set up my bag opens Setup at the bag', top);
  // their own yardages and clubs: Driver 245 / 262, 7-iron 165, 8-iron 150, PW renamed, 5-wood out, 7-wood in
  await setNum(p, 'bag-carry-0', 245); await setNum(p, 'bag-total-0', 262); await setNum(p, 'bag-lat-0', 24);
  await setNum(p, 'bag-carry-6', 165); await setNum(p, 'bag-carry-7', 150);
  await p.fill('#bag-name-9', 'Wedge 46'); await p.locator('#bag-name-9').blur();
  await p.click('button[data-act=delClub][data-i="2"]'); await p.click('button[data-act=addClub][data-v="7W"]');
  let b = await bag(t);
  t.ok(b[0].carry === 245 && b[0].total === 262 && b[0].lat === 24 && b[6].carry === 165 && b[7].carry === 150 && b[9].name === 'Wedge 46', 'their yardages and club names are saved on the phone', b.map(c => [c.name, c.carry]));
  t.ok(b.map(c => c.id).join() === 'D,3W,7W,4H,5i,6i,7i,8i,9i,PW,GW,SW,LW,P', 'clubs can be taken out and added: 5-wood out, 7-wood in, in bag order', b.map(c => c.id));
  await p.click('#tabs button[data-view=rounds]');
  t.ok(await p.locator('#bagNudge').count() === 0, 'once the bag is their own, the prompt is gone');
  // close the app and open it again
  await p.reload(); await p.waitForSelector('#tabs button'); await p.click('#setupBtn');
  t.ok(await p.inputValue('#bag-carry-0') === '245' && await p.inputValue('#bag-name-9') === 'Wedge 46' && await p.inputValue('#bag-name-2') === '7-wood', 'the bag is remembered when the app is opened again');
  // first round: the shot pad uses their bag
  await p.click('#tabs button[data-view=rounds]'); await p.selectOption('#nr-c1', 'sdcc-caobas'); await p.click('form[data-sub=newRound] button[type=submit]');
  t.ok((await chips(p)).join() === 'Driver,3-wood,7-wood,4-hybrid,5-iron,6-iron,7-iron,8-iron,9-iron,Wedge 46,GW,SW,LW,Putter' && (await pressed(p)).join() === 'Driver', 'first round: the shot pad shows their clubs', await chips(p));
  await save(p, 'fwy', 150);
  t.ok((await pressed(p)).join() === '8-iron', 'from 150 yards their 8-iron (150 carry) is suggested; the standard bag would say 7-iron', await pressed(p));
  // what counts as a putt: only a stroke from the green. Here the putter is used from the fringe, 4 yards out.
  await save(p, 'fwy', 4);
  await p.click('button[data-act=padClub][data-v=P]'); await save(p, 'grn', 3);
  await p.click('button[data-act=holed]');
  const h = (await real(t))[0].holes[0];
  const a = await p.evaluate(h => { const a = SGE.analyzeHole(h, 'h10', { argYards: 50, wedgeYards: 150 }); return { score: a.score, putts: a.putts, cats: a.shots.map(s => s.cat), clubs: h.shots.map(s => s.c), lies: h.shots.map(s => s.lie) }; }, h);
  t.ok(a.score === 4 && a.putts === 1 && a.clubs.join() === 'D,8i,P,P' && a.lies.join() === 'tee,fwy,fwy,grn', 'putter from the fringe then one putt on the green: 4 strokes, 1 putt', a);
  t.ok(a.cats[2] === 'arg' && a.cats[3] === 'putt', 'the putter stroke from off the green counts as around the green, not putting', a.cats);
  const kv = await p.$$eval('.kv div', ds => ds.map(d => d.innerText.replace(/\s+/g, ' ').trim()));
  t.ok(kv.includes('1 Putts'), 'the round shows 1 putt', kv);
  // between rounds: change the bag, and the next round uses it
  await p.click('button[data-act=closeRound]'); await p.click('#setupBtn');
  await setNum(p, 'bag-carry-7', 135); await setNum(p, 'bag-carry-8', 150);
  await p.click('#tabs button[data-view=rounds]'); await p.selectOption('#nr-c1', 'sdcc-pinos'); await p.click('form[data-sub=newRound] button[type=submit]');
  await save(p, 'fwy', 150);
  t.ok((await pressed(p)).join() === '9-iron', 'bag changed between rounds: the next round suggests the 9-iron from 150', await pressed(p));
  const rs = await real(t);
  t.ok(rs.length === 2 && rs[0].holes[0].shots[1].c === '8i', 'the earlier round keeps the clubs it was logged with');
  await p.reload(); await p.waitForSelector('#tabs button'); await p.click('#setupBtn');
  t.ok(await p.inputValue('#bag-carry-8') === '150' && await p.inputValue('#bag-carry-7') === '135', 'and that change is remembered too');
  await t.end(); fails += t.fails;

  // ---------- 2. on a computer; keeping the standard bag; a bag of estimates
  t = await start({ device: 'Desktop Chrome' }); p = t.page;
  await t.open();
  t.ok(!(await t.text('#view')).includes('Home Screen') && await p.locator('#bagNudge').count() === 1, 'on a computer the bag prompt shows straight away');
  await p.click('button[data-act=bagKeep]');
  t.ok(await p.locator('#bagNudge').count() === 0, 'Keep this bag closes the prompt');
  await p.reload(); await p.waitForSelector('#tabs button');
  b = await p.evaluate(() => JSON.parse(localStorage.getItem('strokeLedger.v1') || 'null'));
  t.ok(await p.locator('#bagNudge').count() === 0 && (b === null || b.settings.bag[0].carry === 230), 'it stays closed, and the standard bag is untouched');
  await p.selectOption('#nr-c1', 'sdcc-caobas'); await p.click('form[data-sub=newRound] button[type=submit]');
  t.ok((await pressed(p)).join() === 'Driver' && (await chips(p)).length === 14, 'a round still starts with the standard 14 clubs');
  await p.click('button[data-act=closeRound]');
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('strokeLedger.v1')); d.settings.bagEstimated = true; d.settings.bag[0].carry = 250; localStorage.setItem('strokeLedger.v1', JSON.stringify(d)); localStorage.removeItem('strokeLedger.bagHint'); });
  await p.reload(); await p.waitForSelector('#tabs button');
  t.ok(/Your bag still holds estimated distances/.test(await t.text('#bagNudge')), 'a bag of estimated distances gets the prompt too');
  await p.click('button[data-act=bagSetup]'); await setNum(p, 'bag-carry-0', 255);
  await p.click('#tabs button[data-view=rounds]');
  t.ok(await p.locator('#bagNudge').count() === 0 && (await bag(t))[0].carry === 255, 'typing a real number ends it');
  await t.end(); fails += t.fails;
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
