/* A new CE's number is claimed when it is handed out, so two people pressing New CE
   at the same time are not given the same one.
   Run: node tools/test-ce-number-reserved.js */
'use strict';
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const db = R('src/db.js'), app = R('src/App.js'), helpers = R('src/helpers.js');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };
const NL = String.fromCharCode(10);
const cut = (s, from, to) => { const a = s.indexOf(from), b = s.indexOf(to, a); if (a < 0 || b < 0) { console.error('anchor missing: ' + from); process.exit(1); } return s.slice(a, b); };

const lib = new Function(cut(helpers, 'function ceSeqOf(', 'const mkMP') + NL + 'return { ceSeqOf, nextCeNum };')();
const src = cut(db, "const CE_RESERVE_KEY='ce_reserved'", 'async function dbSaveShiftRates').replace('CE_RESERVE_RECHECK_MS=2500', 'CE_RESERVE_RECHECK_MS=30');
const yr = new Date().getFullYear();
const N = (p, n) => p + '-CE-' + yr + '-' + String(n).padStart(4, '0');

/* One shared store, as SharePoint is; each user sees it through their own calls. */
const mk = (store, opts) => {
  opts = opts || {};
  return new Function('dbGetCompanyKey', 'dbSaveCompanyKey', 'dbGetCeNumbers', 'dbGetDrafts', 'nextCeNum', 'ceSeqOf', 'logSwallowed',
    src + NL + 'return dbReserveCeNumber;')(
    async () => (store.v ? JSON.parse(store.v) : null),
    async (k, o) => { if (opts.beforeWrite) await opts.beforeWrite(); store.v = JSON.stringify(o); return true; },
    async () => opts.ces || [], async () => opts.drafts || [], lib.nextCeNum, lib.ceSeqOf, () => {});
};

(async () => {
  console.log('claiming:');
  let store = {};
  let a = await mk(store)(null, [], [N('SHIC', 1191)], 'ann');
  ck('the first claim takes the next free number', a === N('SHIC', 1192), a);
  let b = await mk(store)(null, [], [N('SHIC', 1191)], 'bob');
  ck('the second person is given the next one, not the same', b === N('SHIC', 1193), b);
  let c = await mk(store)('SY3', [], [N('SHIC', 1191)], 'cy');
  ck('the sequence is shared across SHIC and SY3', c === N('SY3', 1194), c);

  console.log(NL + 'drafts and saved CEs:');
  store = {};
  let d = await mk(store, { drafts: [{ info: { ceNum: N('SHIC', 1192) } }] })(null, [], [N('SHIC', 1190)], 'ann');
  ck('a number sitting in someone\'s saved draft is never offered', d === N('SHIC', 1193), d);
  store = { v: JSON.stringify({ rows: [{ n: N('SHIC', 1192), by: 'X', at: new Date().toISOString() }] }) };
  d = await mk(store, { ces: [N('SHIC', 1192)] })(null, [], [], 'ann');
  ck('a reservation that has become a saved CE is dropped from the list', d === N('SHIC', 1193) && JSON.parse(store.v).rows.every(r => r.n !== N('SHIC', 1192)));
  store = { v: JSON.stringify({ rows: [{ n: N('SHIC', 1199), by: 'X', at: new Date(Date.now() - 20 * 864e5).toISOString() }] }) };
  d = await mk(store)(null, [], [N('SHIC', 1190)], 'ann');
  ck('a claim nobody used lapses after 14 days', d === N('SHIC', 1191), d);

  console.log(NL + 'two at once:');
  /* Both read the empty list before either writes; the second write overwrites the first. */
  store = {};
  let gate = null, release;
  const hold = new Promise(r => { release = r; });
  let first = true;
  const moved = {};
  const pa = mk(store, { beforeWrite: async () => { if (first) { first = false; await hold; } } })(null, [], [N('SHIC', 1191)], 'ann', n => { moved.ann = n; });
  await new Promise(r => setTimeout(r, 5));
  const pb = mk(store)(null, [], [N('SHIC', 1191)], 'bob', n => { moved.bob = n; });
  const rb = await pb;
  release();
  const ra0 = await pa;
  await new Promise(r => setTimeout(r, 300));
  const ra = moved.ann || ra0, rb1 = moved.bob || rb;
  ck('two people claiming at the same moment do not end up with one number', ra !== rb1, ra + ' / ' + rb1);
  ck('and both numbers are real and next in line', [ra, rb1].sort().join() === [N('SHIC', 1192), N('SHIC', 1193)].join(), ra + ' / ' + rb1);

  console.log(NL + 'offline:');
  const off = new Function('dbGetCompanyKey', 'dbSaveCompanyKey', 'dbGetCeNumbers', 'dbGetDrafts', 'nextCeNum', 'ceSeqOf', 'logSwallowed',
    src + NL + 'return dbReserveCeNumber;')(async () => null, async () => false, async () => { throw new Error('x'); }, async () => { throw new Error('x'); }, lib.nextCeNum, lib.ceSeqOf, () => {});
  ck('with SharePoint unreachable it still hands out a number', (await off(null, [], [N('SHIC', 5)], 'ann')) === N('SHIC', 6));

  console.log(NL + 'the app:');
  ck('New CE claims its number', /const _newGuess = nextCeNum\(history, null, ceNums\);\s+claimCeNum\(null, _newGuess\);/.test(app));
  ck('Clone claims its number', /claimCeNum\(null, _guess\);/.test(app));
  ck('changing the company claims the new prefix\'s number', app.indexOf("claimCeNum(selCo?.cePrefix || 'SHIC'") > 0);
  ck('a number the person has already typed over is not replaced', app.indexOf("String(p.ceNum || '').toUpperCase() === String(from).toUpperCase() ? { ...p, ceNum: n } : p") > 0);
  ck('and the person is told when the number changed', app.indexOf('was just taken by someone else. This CE is') > 0);
  process.exit(bad ? 1 : 0);
})();
