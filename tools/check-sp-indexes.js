#!/usr/bin/env node
/*
 * Every column the app filters on must be indexed.
 *
 * SharePoint's list view threshold makes a $filter on a NON-INDEXED column
 * fail once a list passes 5,000 items, and it reports that as a 500 -- so it
 * reads as an outage rather than a limit. The CE line-item lists hold roughly
 * thirty rows per CE, so a site is over the threshold at ~170 CEs and every
 * "load this CE" read breaks. Nothing in this app created an index, so every
 * site reaches that wall eventually; at ~900 CEs, ours did.
 *
 * This walks the $filter expressions in db.js and fails if any names a column
 * that setup does not index. Id is exempt -- SharePoint indexes it itself.
 *
 * Run: node tools/check-sp-indexes.js
 */
'use strict';

const fs = require('fs');
const reg = fs.readFileSync('src/components/RegisterPage.js', 'utf8');
const sp = fs.readFileSync('src/sp.js', 'utf8');
const db = fs.readFileSync('src/db.js', 'utf8');

let fails = 0;
const ck = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};

const idxBlock = (reg.match(/const INDEXED\s*=\s*\{[\s\S]*?\n  \};/) || [''])[0];
if (!idxBlock) { console.error('INDEXED map not found in RegisterPage.js'); process.exit(1); }

/* list -> Set(columns) that setup indexes */
const indexed = {};
for (const m of idxBlock.matchAll(/\[spList\('([A-Za-z_]+)'\)\]\s*:\s*\[([^\]]*)\]/g))
  indexed[m[1]] = new Set(m[2].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean));

console.log('setup indexes:');
for (const list of Object.keys(indexed).sort())
  ck(list + ' -> ' + [...indexed[list]].join(', '), indexed[list].size > 0);

console.log('\nevery filtered column is covered:');
const filtered = new Set();
for (const m of db.matchAll(/spList\('([A-Za-z_]+)'\)\s*,\s*`([A-Za-z]+) eq /g))
  filtered.add(m[1] + '.' + m[2]);
/* _spGetByCE hides the filter behind a `list` parameter, so the pattern above
   cannot see it. It filters on shicCEId by definition -- that is the whole
   point of the helper -- so every list passed to it needs that index, and
   these are the two lists this check exists for. */
for (const m of db.matchAll(/_spGetByCE\(\s*spList\('([A-Za-z_]+)'\)/g))
  filtered.add(m[1] + '.shicCEId');
for (const f of [...filtered].sort()) {
  const [list, col] = f.split('.');
  ck(f, col === 'Id' || (indexed[list] && indexed[list].has(col)),
    'a $filter on it stops working once ' + list + ' passes 5,000 items');
}

console.log('\nhow the index is applied:');
ck('on every run, not only when the column is new',
  /Indexed on every run/.test(reg) && /for\(const fname of \(INDEXED\[name\]\|\|\[\]\)\)/.test(reg),
  'a site built by an older version has the column but no index -- exactly the broken state');
ck('with MERGE, since the field already exists', /'X-HTTP-Method':'MERGE'/.test(reg));
ck('treating already-indexed as success', /already indexed/.test(reg),
  're-running setup must stay harmless');
ck('and reporting how many were done', /indexed\+\+/.test(reg) && /column\(s\) indexed/.test(reg));

console.log('\nand the error tells you which failure this is:');
ck('the threshold is named, with the remedy',
  /list view threshold/.test(sp) && /Repair lists & columns/.test(sp));
ck('spGet passes the response body so it can be recognised',
  /throw spErr\('get', ?l, ?r\.status, ?body\)/.test(sp),
  'without the body a threshold error, a missing column and a real outage all read as a bare 500');

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nSharePoint index coverage OK');
process.exit(fails ? 1 : 0);
