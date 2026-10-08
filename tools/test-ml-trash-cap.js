#!/usr/bin/env node
/*
 * The Masterlist Trash is held in the browser for 30 days, so deleting a long list put every row in browser storage that long, and an expired
 * entry stayed there until someone next opened or changed the Trash. It is now cleaned on every start and capped by count and by size,
 * keeping the newest entries. This runs the real code from db.js against a stand-in for storage.
 *
 * Run: node tools/test-ml-trash-cap.js
 */
'use strict';
const fs = require('fs');
const db = fs.readFileSync('src/db.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

const a = db.indexOf('const ML_TRASH_DAYS = 30;');
const b = db.indexOf('})();', db.indexOf('pruneMlTrashOnLoad')) + 5;
ck('the trash block is found', a > 0 && b > a);
const block = db.slice(a, b);

const DAY = 864e5, now = Date.now();
const entry = (key, ageDays, pad) => ({ key, tab: 'tools', item: { desc: 'x'.repeat(pad || 20) }, at: new Date(now - ageDays * DAY).toISOString(), by: 'u' });

function load(stored) {
  const store = { ml_trash: stored }, writes = [];
  const LS = { get: k => store[k], set: (k, v) => { store[k] = v; writes.push(k); } };
  const fn = new Function('LS', 'logSwallowed', block + '\nreturn { _mlTrashCap, _mlTrashFresh, ML_TRASH_MAX, ML_TRASH_MAX_BYTES };');
  const api = fn(LS, () => {});
  return { api, store, writes };
}

console.log('\nthe cap:');
{
  const { api } = load(undefined);
  const small = [entry('a', 1), entry('b', 2)];
  ck('a small trash is returned as it is', api._mlTrashCap(small) === small);
  const many = Array.from({ length: api.ML_TRASH_MAX + 250 }, (_, i) => entry('k' + i, i / 1000));
  const capped = api._mlTrashCap(many);
  ck('more than the count cap is cut to it', capped.length === api.ML_TRASH_MAX, capped.length);
  ck('the newest are kept, the oldest go', capped.some(e => e.key === 'k0') && !capped.some(e => e.key === 'k' + (api.ML_TRASH_MAX + 249)));
  const fat = Array.from({ length: 40 }, (_, i) => entry('f' + i, i, 30000));
  const fc = api._mlTrashCap(fat);
  ck('a trash too big in bytes is cut to the size cap', fc.length < 40 && JSON.stringify(fc).length <= api.ML_TRASH_MAX_BYTES + 100, fc.length);
  ck('and it is the newest that stay', fc[0].key === 'f0' && fc.every((e, i) => e.key === 'f' + i));
  ck('anything that is not a list is an empty one', api._mlTrashCap(null).length === 0 && api._mlTrashCap('x').length === 0);
}

console.log('\nage still applies, then the cap:');
{
  const { api } = load(undefined);
  const list = [entry('new', 1), entry('old', 31), entry('edge', 29.9), { key: '', at: new Date().toISOString() }, null];
  const f = api._mlTrashFresh(list);
  ck('an entry older than 30 days is dropped, a younger one kept', f.map(e => e.key).join() === 'new,edge', f.map(e => e.key).join());
  const many = Array.from({ length: api.ML_TRASH_MAX + 50 }, (_, i) => entry('k' + i, 0.5));
  ck('a fresh but oversized list is capped as well', api._mlTrashFresh(many).length === api.ML_TRASH_MAX);
}

console.log('\non every start:');
{
  const stale = [entry('new', 1), entry('old', 45), entry('older', 90)];
  const r = load(stale);
  ck('expired entries are removed from the copy in this browser', r.store.ml_trash.map(e => e.key).join() === 'new', JSON.stringify(r.store.ml_trash.map(e => e.key)));
  ck('and written back', r.writes.length === 1);
  const clean = load([entry('a', 1), entry('b', 2)]);
  ck('a trash with nothing to remove is not rewritten', clean.writes.length === 0);
  const none = load(undefined);
  ck('no trash at all is left alone', none.writes.length === 0 && none.store.ml_trash === undefined);
  const junk = load('not a list');
  ck('a damaged value does not stop the app starting', junk.writes.length === 0);
}

console.log('\nwired in:');
ck('a change to the trash is capped too', /return _mlTrashCap\(out\);\};/.test(db));
ck('reading the trash caps it (through _mlTrashFresh)', /_mlTrashFresh\(list\)\{[\s\S]{0,260}_mlTrashCap\(/.test(db));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\ntrash cap OK');
process.exit(bad ? 1 : 0);
