#!/usr/bin/env node
/*
 * Every SharePoint column the app WRITES must exist in the schema the app
 * CREATES, and every column it READS must exist too.
 *
 * This check exists because of a real outage. shicPax, shicOTHours and
 * shicPerDiem were added to the manpower payload in db.js and never added to
 * the provisioning list in RegisterPage.js. No site had those columns, so every
 * CE_MP insert came back 400 InvalidClientQueryException, dbSaveHistory threw,
 * and every affected CE was quietly kept in the browser instead. The CE header
 * had already been written, so SharePoint held a CE with a total and no
 * manpower rows behind it.
 *
 * Nothing about that is visible from reading either file alone -- the payload
 * and the schema are 300 lines apart in different modules. That is exactly the
 * kind of drift a check should catch instead of a user's console.
 *
 * Run: node tools/check-sp-schema.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const db = rd('src/db.js'), reg = rd('src/components/RegisterPage.js'), sync = rd('src/components/LocalToSPSync.js');

let fails = 0;
const bad = (msg, detail) => { console.log('  FAIL  ' + msg + (detail ? '  -> ' + detail : '')); fails++; };
const ok = msg => console.log('  PASS  ' + msg);

/* ---- the schema the app provisions ---------------------------------------- */
const block = (reg.match(/const lists=\{[\s\S]*?\n  \};/) || [''])[0];
if (!block) { console.error('provisioning block not found in src/components/RegisterPage.js'); process.exit(1); }

const schema = {};           /* logical list name -> Set of field names */
for (const line of block.split('\n')) {
  const m = line.match(/\[spList\('([A-Za-z_]+)'\)\]:\s*(\[.*\])/);
  if (!m) continue;
  const fields = new Set(['Title', 'Id']);   /* every SharePoint list has these */
  for (const f of m[2].match(/'(shic[A-Za-z]+)'/g) || []) fields.add(f.replace(/'/g, ''));
  schema[m[1]] = fields;
}
const listNames = Object.keys(schema);
if (!listNames.length) { console.error('no lists parsed out of the provisioning block'); process.exit(1); }
console.log('Provisioned lists: ' + listNames.length);

/* ---- what the app writes -------------------------------------------------- */
/* spPost(spList('X'), {...}) and spPatch(spList('X'), id, {...}). The payload is
   often a variable, so collect object literals and named payloads alike. */
const src = db + '\n' + sync;
const writes = [];   /* {list, field, where} */

/* `payload` is declared separately in dbSaveDraft and dbSaveMonEntry with
   different fields, so a name->body map keyed on the last one seen reports the
   wrong list. Resolve each name against the NEAREST PRECEDING declaration
   instead. */
const declOf = (name, before) => {
  const re = new RegExp('const\\s+' + name + '\\s*=\\s*\\{([^{}]*)\\}', 'g');
  let body = null, m;
  while ((m = re.exec(src)) && m.index < before) body = m[1];
  return body;
};
/* Direct inline payloads: spPost(spList('CE_MP'),{shicX:...}) */
for (const m of src.matchAll(/sp(?:Post|Patch)\(\s*spList\('([A-Za-z_]+)'\)[^)]*?\{([^{}]*)\}/g)) {
  for (const f of m[2].match(/\b(shic[A-Za-z]+)\s*:/g) || [])
    writes.push({ list: m[1], field: f.replace(/\s*:$/, ''), where: 'inline' });
}
/* Payloads built into a variable and posted by name. Tie each payload variable
   to the list it is posted to. */
for (const m of src.matchAll(/sp(?:Post|Patch)\(\s*spList\('([A-Za-z_]+)'\)\s*,\s*(?:\w+\s*,\s*)?(\w+)\s*\)/g)) {
  const body = declOf(m[2], m.index);
  if (!body) continue;
  for (const f of body.match(/\b(shic[A-Za-z]+)\s*:/g) || [])
    writes.push({ list: m[1], field: f.replace(/\s*:$/, ''), where: m[2] });
}
/* mpPayloads / resPayloads: built by map() then posted in a loop. Match the
   payload factory to the list its inserts go to. */
const payloadToList = [['mpPayloads', 'CE_MP'], ['resPayloads', 'CE_Resources']];
for (const [varName, list] of payloadToList) {
  const m = src.match(new RegExp('const ' + varName + '=([\\s\\S]*?);const '));
  if (!m) { bad(varName + ' not found - the payload builder was renamed'); continue; }
  for (const f of m[1].match(/\b(shic[A-Za-z]+)\s*:/g) || [])
    writes.push({ list, field: f.replace(/\s*:$/, ''), where: varName });
}

/* ---- what the app reads --------------------------------------------------- */
const reads = [];
for (const m of src.matchAll(/(?:_spGetTolerant|spGet)\(\s*spList\('([A-Za-z_]+)'\)\s*,[^,]*,\s*'([^']*)'/g))
  for (const f of m[2].split(',').map(s => s.trim()).filter(s => /^shic/.test(s)))
    reads.push({ list: m[1], field: f });

console.log('Writes checked: ' + writes.length + ' · reads checked: ' + reads.length);
if (writes.length < 20) bad('suspiciously few writes parsed', writes.length + ' - the parser has drifted from the source');

/* ---- the actual assertion ------------------------------------------------- */
console.log('\nEvery column written exists in the provisioned schema:');
const seen = new Set();
for (const w of writes) {
  const key = w.list + '.' + w.field;
  if (seen.has(key)) continue;
  seen.add(key);
  if (!schema[w.list]) { bad(w.list + ' is written to but never provisioned'); continue; }
  if (!schema[w.list].has(w.field))
    bad(w.list + '.' + w.field + ' is written but never created', 'in ' + w.where + ' - every insert will 400 InvalidClientQueryException');
}
if (!fails) ok(seen.size + ' distinct written columns all exist');

console.log('\nEvery column read exists too:');
const before = fails;
const seenR = new Set();
for (const r of reads) {
  const key = r.list + '.' + r.field;
  if (seenR.has(key)) continue;
  seenR.add(key);
  if (!schema[r.list]) { bad(r.list + ' is read from but never provisioned'); continue; }
  if (!schema[r.list].has(r.field))
    bad(r.list + '.' + r.field + ' is selected but never created', '$select on a missing field fails the whole query');
}
if (fails === before) ok(seenR.size + ' distinct read columns all exist');

/* A column that is written and never read back is dead weight at best and a
   silent data loss at worst -- the value goes to SharePoint and no load path
   brings it home, so it vanishes on the next round-trip. */
console.log('\nEvery column written to a CE row is read back:');
const before2 = fails;
for (const list of ['CE_MP', 'CE_Resources']) {
  const w = new Set(writes.filter(x => x.list === list).map(x => x.field));
  const r = new Set(reads.filter(x => x.list === list).map(x => x.field));
  for (const f of w)
    if (!r.has(f) && f !== 'shicCEId')
      bad(list + '.' + f + ' is saved but never loaded', 'the value round-trips to nothing');
}
if (fails === before2) ok('nothing is written into a black hole');

/* Adding the columns to this file only helps a site that runs setup again.
   Until this change, a connected site had no button that did that -- the only
   control was Disconnect -- so a column added in any release was unreachable
   without disconnecting first. */
console.log('\nAn already-connected site can receive newly added columns:');
const fb = rd('src/components/FbSetupPanel.js');
const before3 = fails;
if (!/Repair lists & columns/.test(fb)) bad('no repair control in the SP setup panel');
if (!/status==='connected'&&React\.createElement\('button'/.test(fb))
  bad('the repair control is not shown while connected', 'that is the only state it is useful in');
if (!/handleRepair/.test(fb)) bad('the repair control has no handler');
if (!/autoSetupSP/.test((fb.match(/const handleRepair=[\s\S]*?\n  \};/) || [''])[0]))
  bad('repair does not run the provisioning routine');
if (fails === before3) ok('a repair button runs the idempotent provisioning routine');

/* A 400 InvalidClientQueryException is unreadable and unactionable. The user in
   the field saw a wall of SharePoint JSON and could not know that one admin
   button fixes it. */
console.log('\nA missing column explains itself:');
const before4 = fails;
if (!/InvalidClientQueryException/.test(db)) bad('the save path does not recognise a schema gap');
if (!/Repair lists & columns/.test(db)) bad('the message does not name the fix');
if (fails === before4) ok('the save failure names the button that fixes it');

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nSharePoint schema OK');
process.exit(fails ? 1 : 0);
