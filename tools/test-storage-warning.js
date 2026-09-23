#!/usr/bin/env node
/* "Why do I always see this storage full error?"

   Because it only ever said so. The cached CEs that were filling the browser
   were cleared nowhere but in the handler for a write that had already
   failed, so every session measured the same 4,102 KB and showed the same
   warning, and the number behind it never moved. It also named nothing: the
   one thing it could have said -- what is holding the space -- is the thing
   that tells you whether there is anything to be done about it.

   Run: node tools/test-storage-warning.js */
'use strict';
const fs = require('fs');
const vm = require('vm');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

/* ---- a localStorage that can be filled ---- */
function makeLS(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    get length() { return m.size; },
    key: i => [...m.keys()][i],
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    _map: m
  };
}
const big = (n) => 'x'.repeat(n);
const seed = {};
/* 300 cached CEs at ~10 KB each, a CE list, and a signature */
for (let i = 1; i <= 300; i++) seed['shic:ce_cache:' + i] = JSON.stringify({ savedAt: new Date(2026, 0, i).toISOString(), pad: big(8000) });
seed['shic:history'] = JSON.stringify({ pad: big(20000) });
seed['shic:my_sig:aljon'] = JSON.stringify({ pad: big(2000) });

function load(store) {
  const toasts = [];
  const ctx = {
    console, localStorage: store, setTimeout: (fn) => fn(), clearTimeout: () => {},
    Date, JSON, Math, Object, Array, String, Number, Set, Map, atob: s => s, btoa: s => s, fetch: () => Promise.reject(new Error('no net')),
    window: { _shicToast: (msg, isErr) => toasts.push({ msg, isErr }), addEventListener: () => {} }
  };
  ctx.window.localStorage = store; ctx.self = ctx.window; ctx.document = { addEventListener: () => {} };
  ctx.window.setTimeout = ctx.setTimeout;
  vm.createContext(ctx);
  const src = fs.readFileSync('src/db.js', 'utf8');
  const start = src.indexOf('const LS = {');
  const end = src.indexOf('\n};', src.indexOf('pruneCeCache:')) + 3;
  vm.runInContext(src.slice(start, end) + '\nthis.LS = LS;', ctx);
  return { LS: ctx.LS, toasts, win: ctx.window };
}

/* ---- it says what is holding the space ---- */
let { LS } = load(makeLS(seed));
let u = LS.usage();
ck('the total is measured', u.total > 3 * 1024 * 1024);
ck('and broken down by what is holding it', !!u.groups['cached CEs'] && !!u.groups['the CE list']);
ck('the biggest holder is named', u.top.name === 'cached CEs' && u.top.bytes > 0);
ck('a signature is never counted as a cache', u.groups['signatures'] > 0);
ck('the size reads as a size', /^[\d,]+ KB$/.test(LS.kb(4200000)));

/* ---- crossing the line clears what can be cleared, and says so ---- */
let store = makeLS(seed);
let app = load(store);
app.win._lsLastScan = 0;
app.LS.set('features', { a: 1 });
ck('a write over the line clears the cached CEs', store._map.size < 200);
const keptKeys = [...store._map.keys()].filter(k => k.indexOf('shic:ce_cache:') === 0);
const kept = keptKeys.length;
/* Seeded so that a higher number is a later savedAt: the ones kept are the
   ones most recently saved, not whichever the browser listed first. */
ck('the most recently saved are the ones kept',
  keptKeys.every(k => Number(k.split(':').pop()) > 300 - 41));
ck('it keeps a working set rather than clearing the lot', kept === 40);
ck('nothing but the caches is touched',
  store._map.has('shic:history') && store._map.has('shic:my_sig:aljon'));
ck('and it says what it did, and that nothing is lost by it',
  app.toasts.length === 1 && /cached CE\(s\) were cleared/.test(app.toasts[0].msg) &&
  /fetched from SharePoint again/.test(app.toasts[0].msg));
ck('which is news, not an error', !app.toasts[0].isErr);
ck('it is not a warning that comes back next time', app.LS.usage().total < app.LS.WARN_AT);

/* ---- when clearing cannot help, it says what is actually holding it ---- */
const heavy = { 'shic:history': JSON.stringify({ pad: big(2200000) }), 'shic:masterlist': JSON.stringify({ pad: big(200000) }) };
store = makeLS(heavy); app = load(store); app.win._lsLastScan = 0;
app.LS.set('features', { a: 1 });
ck('a full browser with nothing to clear still warns', app.toasts.length === 1 && app.toasts[0].isErr === true);
ck('and names what is holding it instead of asking for a guess', /Most of it is the CE list/.test(app.toasts[0].msg));
ck('it says what full means', /of about 5,000 KB/.test(app.toasts[0].msg));
ck('and it is said once, not on every write', (app.LS.set('features', { b: 2 }), app.toasts.length === 1));

/* ---- an ordinary browser is left alone ---- */
store = makeLS({ 'shic:history': JSON.stringify({ pad: big(1000) }), 'shic:ce_cache:1': JSON.stringify({ savedAt: '2026-01-01', pad: big(100) }) });
app = load(store); app.win._lsLastScan = 0;
app.LS.set('features', { a: 1 });
ck('a browser with room says nothing', app.toasts.length === 0);
ck('and keeps every cached CE it has', store._map.has('shic:ce_cache:1'));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nstorage warning OK');
process.exit(bad ? 1 : 0);
