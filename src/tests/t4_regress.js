/* The parts that existed before the map: every tab draws, a round on an unmapped hole works by hand, scorecards import, practice mode saves nothing. */
const { start } = require('./harness');
const path = require('path');
(async () => {
  const t = await start({}), p = t.page;
  await t.open();
  for (const v of ['stats', 'best', 'courses', 'aim', 'expect', 'guide']) {
    await p.click(`#tabs button[data-view=${v}]`);
    const tx = await t.text('#view');
    t.ok(tx.length > 150 && !/NaN|undefined|\[object/.test(tx), `${v} tab draws`, tx.slice(0, 80));
  }
  t.ok(/the map/i.test(await t.text('#view')) && /Mark each shot/i.test(await t.text('#view')), 'Guide explains the map');
  await p.click('#tabs button[data-view=aim]'); await p.click('button[data-act=aimMode][data-v=ap]');
  t.ok(/Aim .*flag/.test(await t.text('.reco')), 'approach planner still answers', await t.text('.reco'));
  // the example round opens and shows strokes gained
  await p.click('#tabs button[data-view=rounds]');
  await p.click('.rcard');
  t.ok(await p.locator('.shots .shot').count() >= 2 && /[+−]\d\.\d\d/.test(await t.text('.rsum')), 'example round opens with its shots');
  t.ok((await t.text('.maphint')).includes('not on the map yet'), 'example round hole offers mapping');
  await p.click('button[data-act=closeRound]');
  // a round by hand on unmapped holes
  await p.click('form[data-sub=newRound] button[type=submit]');
  t.ok(await p.locator('.markrow').count() === 0 && await p.locator('#mapSlot').count() === 0, 'unmapped hole: no GPS buttons, hand entry as before');
  await p.click('button[data-act=padClub][data-v=D]'); await p.fill('#pad-d', '150'); await p.click('form[data-sub=addShot] button[type=submit]');
  await p.click('button[data-act=padLie][data-v=grn]'); await p.fill('#pad-d', '15'); await p.click('form[data-sub=addShot] button[type=submit]');
  await p.fill('#pad-d', '1'); await p.click('form[data-sub=addShot] button[type=submit]'); await p.click('button[data-act=holed]');
  let d = await t.data(), r = Object.values(d.rounds).find(x => !x.example);
  t.ok(r.holes[0].done && r.holes[0].shots.length === 4 && !r.holes[0].shots.some(s => s.g), 'hand-entered hole saved, with no map positions');
  t.ok(/^[+−]?\d\.\d\d$/.test((await p.locator('.holed .sgc').innerText()).trim()), 'strokes gained shown for it');
  await p.click('button[data-act=closeRound]');
  // scorecard import
  await p.click('#setupBtn');
  t.ok(await p.locator('a[href="scorecard-template.xlsx"]').count() === 1, 'template is offered as a file link');
  const res = await p.request.get(t.base + 'scorecard-template.xlsx');
  t.ok(res.ok() && (await res.body()).length > 15000, 'template file is served');
  await p.setInputFiles('#tg-file', path.join(__dirname, 'files', 'filled1.xlsx'));
  await p.waitForFunction(() => { const s = document.querySelector('#tg-file').closest('section'); return /Import \d+ round|Nothing new to import/.test(s.textContent) || s.querySelector('.err'); }, null, { timeout: 20000 });
  const pre = await p.locator('#tg-file').evaluate(el => el.closest('section').textContent);
  t.ok(/Import \d+ rounds?/.test(pre), 'filled-in template is read (spreadsheet reader loads from the site)', pre.slice(0, 200));
  const before = Object.keys((await t.data()).rounds).length;
  await p.click('button[data-act=grintImport]');
  d = await t.data();
  t.ok(Object.keys(d.rounds).length > before && Object.values(d.rounds).some(x => x.src === 'card'), 'scorecard rounds imported', Object.keys(d.rounds).length);
  // practice mode
  await p.click('#tabs button[data-view=guide]');
  await p.click('button[data-act=practiceOn]');
  const snap = JSON.stringify(await t.data());
  await p.click('#tabs button[data-view=rounds]'); await p.click('form[data-sub=newRound] button[type=submit]');
  await p.fill('#pad-d', '99'); await p.click('form[data-sub=addShot] button[type=submit]');
  t.ok(JSON.stringify(await t.data()) === snap, 'practice mode saves nothing');
  await p.click('button[data-act=practiceOff]');
  t.ok(JSON.stringify(await t.data()) === snap && !(await t.text('#view')).includes('Practice mode'), 'leaving practice mode restores the real data');
  await t.end();
})().catch(e => { console.error(e); process.exit(1); });
