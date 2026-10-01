/* The CE cache is bounded by BYTES as well as count, and never evicts a CE that
   exists only in this browser. Run: node tools/test-ce-cache-bound.js */
'use strict';
const db = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'db.js'), 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || x === undefined ? '' : '  -> ' + x)); if (!c) bad++; };
const a = db.indexOf('pruneCeCache: (keep = 60');
const src = db.slice(a, db.indexOf('\n  }', db.indexOf('} catch (_e) { return 0; }', a)) + 4);
const mk = entries => {
  const store = new Map(entries.map(e => ['shic:ce_cache:' + e.n, JSON.stringify({ savedAt: e.t, _syncState: e.s, pad: 'x'.repeat(e.kb * 1024) })]));
  const ls = { get length() { return store.size; }, key: i => [...store.keys()][i], getItem: k => store.has(k) ? store.get(k) : null, removeItem: k => store.delete(k) };
  const fn = new Function('localStorage', 'return {' + src + '};')(ls);
  return { store, prune: fn.pruneCeCache };
};
const E = (n, t, kb, s) => ({ n, t: new Date(2026, 8, t).toISOString(), kb, s: s || 'synced' });
/* Forty fat CEs: count alone (keep 60) would keep every one. */
let m = mk(Array.from({ length: 40 }, (_, i) => E('C' + i, 1 + (i % 28), 150)));
const removed = m.prune(60);
const left = [...m.store.values()].reduce((t, v) => t + v.length * 2, 0);
ck('sixty is not a bound when each CE is 150 KB: it still trims', removed > 0, removed);
ck('and what remains fits the byte budget', left <= 1.2 * 1024 * 1024 + 4096, Math.round(left / 1024) + ' KB');
/* The newest are the ones kept. */
m = mk([E('OLD', 1, 400), E('NEW', 20, 400), E('MID', 10, 400)]);
m.prune(60, 900 * 1024);
ck('the newest are kept, the oldest go', m.store.has('shic:ce_cache:NEW') && !m.store.has('shic:ce_cache:OLD'));
/* The point of the whole rule. */
m = mk([E('MINE', 1, 900, 'local'), E('A', 5, 400), E('B', 6, 400)]);
m.prune(60, 900 * 1024); /* sizes are UTF-16 bytes, as LS.usage counts them */
ck('a CE that exists only in this browser is never evicted, however old or big', m.store.has('shic:ce_cache:MINE'));
ck('and does not use up the budget the others share', m.store.has('shic:ce_cache:B'));
m = mk([E('A', 1, 10), E('B', 2, 10)]);
ck('a small cache is left alone', m.prune(60) === 0 && m.store.size === 2);
m = mk([E('A', 1, 10), E('B', 2, 10), E('C', 3, 10)]);
m.prune(2);
ck('the count limit still applies', m.store.size === 2);
console.log(bad ? bad + ' FAILURE(S)' : 'ce cache bound OK');
process.exit(bad ? 1 : 0);
