/* Saving a CE that somebody else saved after it was opened here asks first, instead of silently replacing their changes.
   Run: node tools/test-save-detects-newer-copy.js */
'use strict';
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const helpers = R('src/helpers.js'), app = R('src/App.js');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const a = helpers.indexOf('function ceChangedSince'), b = helpers.indexOf('/* Anything that is not a finite number is zero.');
ck('the helper is found', a > 0 && b > a);
const chg = new Function(helpers.slice(a, b) + '; return ceChangedSince;')();
const base = { at: '2026-10-07T08:00:00.000Z' };
ck('nobody saved since: no conflict', chg(base, { savedAt: '2026-10-07T08:00:00.000Z', savedBy: 'ana' }, 'ben') === null);
ck('the local copy stamped a moment after the site\'s is not a conflict (clock slack)', chg(base, { savedAt: '2026-10-07T08:00:01.500Z', savedBy: 'ana' }, 'ben') === null);
const c = chg(base, { savedAt: '2026-10-07T09:30:00.000Z', savedBy: 'ana' }, 'ben');
ck('somebody else saved later: reported with who and when', c && c.by === 'ana' && c.at === '2026-10-07T09:30:00.000Z');
ck('my own later save (approval submit, second tab) is not a conflict', chg(base, { savedAt: '2026-10-07T09:30:00.000Z', savedBy: 'ben' }, 'ben') === null);
ck('no stamp to compare with: never blocks', chg(null, { savedAt: '2026-10-07T09:30:00.000Z', savedBy: 'ana' }, 'ben') === null && chg({ at: '' }, { savedAt: 'x' }, 'ben') === null && chg(base, null, 'ben') === null && chg(base, { savedAt: 'not a date' }, 'ben') === null);
ck('an unnamed saver is still reported', chg(base, { savedAt: '2026-10-07T09:30:00.000Z', savedBy: '' }, 'ben').by === 'someone else');

console.log('\nin the app:');
ck('opening a CE records when that copy was saved', app.indexOf("_loadedAt.current = { num: _ownNum.current, at: d.savedAt || '' };") > 0);
ck('a successful save moves the stamp forward, so the next Save is not a false conflict', app.indexOf("_loadedAt.current = { num: ceNum, at: new Date().toISOString() };") > 0);
const s0 = app.indexOf('const _chg = ceChangedSince(');
ck('Save checks only the CE that is open here, and not in bulk mode', s0 > 0 && app.slice(s0 - 260, s0).indexOf("_loadedAt.current.num === ceNum") > 0 && app.slice(s0 - 260, s0).indexOf('bulkMode.on') > 0);
ck('it asks before replacing, naming who and when, and Cancel stops the save', app.slice(s0, s0 + 1400).indexOf('after you opened it.') > 0 && app.slice(s0, s0 + 1400).indexOf('return;') > 0);
ck('the check comes before the save is built', s0 < app.indexOf('const _entry = mkEntry();'));
process.exit(bad ? 1 : 0);
