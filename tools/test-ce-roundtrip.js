#!/usr/bin/env node
/*
 * What a CE carries from the editor, through SharePoint, and back.
 *
 * Three things were being dropped, all of them silently:
 *
 *  1. The margin %. It was in the unsaved-changes signature but in neither
 *     mkEntry nor the draft, so `_margin` was written as 0 every single time.
 *     You set 15%, saw SELLING PRICE appear on screen and on the printed CE,
 *     saved, reopened -- margin 0, and the line gone from the print entirely.
 *
 *  2. Everything in `info` except client and description. Those two had
 *     columns; date, location, discipline, department, status, material,
 *     QUANTITY, DAYS, attention, end user and the issuing company did not, so
 *     they never reached SharePoint. They lived in the saving browser's cache
 *     and nowhere else. A colleague opening the CE got BLANK_INFO defaults --
 *     today's date, qty 1, status DRAFT, discipline Electrical -- and saving
 *     from there wrote those defaults back as though they were real.
 *
 *  3. The scope description: written to a column as an empty string, read
 *     back, and then ignored by the loader.
 *
 * Run: node tools/test-ce-roundtrip.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const db = rd('src/db.js'), app = rd('src/App.js'), helpers = rd('src/helpers.js'), reg = rd('src/components/RegisterPage.js');

let fails = 0;
const ck = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};

/* ---- the real BLANK_INFO, so the field list cannot drift from the app ----- */
const biSrc = (helpers.match(/const BLANK_INFO = \{[\s\S]*?\n\}/) || [''])[0];
if (!biSrc) { console.error('BLANK_INFO not found'); process.exit(1); }
const BLANK_INFO = new Function(biSrc + '; return BLANK_INFO;')();
const FIELDS = Object.keys(BLANK_INFO);

/* ---- the real reconstruction, lifted out of dbLoadCE ---------------------- */
const infoSrc = (db.match(/info:\(\(\)=>\{[\s\S]*?\}\)\(\),scope:/) || [''])[0].replace(/,scope:$/, '');
if (!infoSrc) { console.error('dbLoadCE info reconstruction not found'); process.exit(1); }
const rebuild = new Function('h', 'return (' + infoSrc.replace(/^info:/, '') + ');');

/* A CE as the estimator filled it in -- every field non-default. */
const saved = {
  ceNum: 'SHIC-CE-2026-0042', date: '2026-03-11', client: 'SEM-CALACA', location: 'Batangas',
  attention: 'ENGR. REYES', endUser: 'PLANT OPS', projType: 'Mechanical',
  description: 'Turbine bearing rebabbitting', dept: 'TSG', status: 'FOR REVIEW',
  material: 'Babbitt alloy', qty: '5', days: '20', companyId: 'shic'
};
const row = {
  Id: 42, Title: saved.ceNum, shicClient: saved.client, shicDesc: saved.description,
  shicInfo: JSON.stringify(saved)
};

console.log('Every field the estimator typed comes back:');
for (const f of FIELDS)
  ck(f + ' survives the round trip', rebuild(row)[f] === saved[f],
    JSON.stringify(rebuild(row)[f]) + ' (was ' + JSON.stringify(saved[f]) + ')');

console.log('\nThe fields that decide money and identity:');
const back = rebuild(row);
ck('quantity is not silently 1', back.qty === '5', back.qty + ' — the unit price is the grand total divided by this');
ck('days is not silently blank', back.days === '20', back.days + ' — every manpower row defaults from this');
ck('the issuing company is not lost', back.companyId === 'shic', 'it decides the CE prefix and document number');
ck('the date is the CE date, not today', back.date === '2026-03-11');
ck('the discipline is not reset to Electrical', back.projType === 'Mechanical');
ck('the status is not reset to DRAFT', back.status === 'FOR REVIEW');

console.log('\nThe indexed columns stay authoritative:');
const conflicting = { ...row, shicInfo: JSON.stringify({ ...saved, ceNum: 'SHIC-CE-1999-0001', client: 'WRONG' }) };
ck('Title wins over the JSON copy of ceNum', rebuild(conflicting).ceNum === saved.ceNum,
  'duplicate detection and every filter match on Title; the JSON must never contradict it');
ck('the client column wins too', rebuild(conflicting).client === saved.client);

console.log('\nA CE saved before this existed still opens:');
const legacy = { Id: 7, Title: 'SHIC-CE-2025-0009', shicClient: 'OLD CLIENT', shicDesc: 'old desc' };
ck('no shicInfo does not throw', (() => { try { rebuild(legacy); return true; } catch (_e) { return false; } })());
ck('and it keeps exactly what it had', rebuild(legacy).ceNum === legacy.Title && rebuild(legacy).client === 'OLD CLIENT'
  && rebuild(legacy).description === 'old desc');
ck('malformed JSON is ignored, not fatal',
  (() => { try { return rebuild({ ...legacy, shicInfo: '{not json' }).ceNum === legacy.Title; } catch (_e) { return false; } })());

console.log('\nThe write side:');
ck('the whole info object is written', /shicInfo:JSON\.stringify\(e\.info\|\|\{\}\)/.test(db));
ck('and read back', /shicInfo/.test((db.match(/(?:_spGetTolerant|spGet)\(spList\('CEs'\),`Id eq \$\{id\}`,'[^']*'/) || [''])[0]),
  'writing it without selecting it would change nothing');
ck('the column is provisioned', /\[3,'shicInfo'\]/.test(reg),
  'an unprovisioned column 400s the whole save');
ck('it is a Note column, not single-line text', /\[3,'shicInfo'\]/.test(reg),
  'a 255-char text column would truncate the JSON and corrupt every field after it');

console.log('\nMargin and scope are actually saved:');
const mk = (app.match(/const mkEntry = \(revSuffix = ''\) => \{[\s\S]*?\n  \};/) || [''])[0];
ck('mkEntry found', mk.length > 0);
ck('mkEntry saves the margin', /\n      margin,/.test(mk),
  'the printed SELLING PRICE line is suppressed when margin is 0');
ck('mkEntry saves the scope text', /\n      scope,/.test(mk));
const draft = (app.match(/const saveDraft = async \(\) => \{[\s\S]*?savedAt: new Date\(\)\.toISOString\(\)\n    \};/) || [''])[0];
ck('the draft saves the margin too', /\n      margin,/.test(draft),
  'a draft is how people park work overnight');
ck('the CE loader restores the scope text', /setMargin\(d\.margin \|\| 0\);\n    setScope\(d\.scope \|\| ''\);/.test(app),
  'it was loaded from SharePoint and then thrown away');

console.log('\nNothing saved is missing from the unsaved-changes signature:');
const sig = (app.match(/sig: JSON\.stringify\(\[(.*?)\]\)/) || ['', ''])[1].split(',').map(x => x.trim());
for (const f of ['ceType', 'info', 'mp', 'tools', 'mats', 'ppe', 'misc', 'sowItems', 'notes', 'addlCosts', 'margin', 'approvers', 'scope', 'mobVehicles', 'demobVehicles'])
  ck(f + ' marks the CE dirty', sig.includes(f), 'editing it would leave the CE looking already saved');

/* A consolidated crew is the one row whose cost belongs to SEVERAL scope tasks.
   "Consolidate crew" and "Combine" record that split in `shares`; every other
   row field has a column of its own and this one did not, so it was written to
   state and dropped on save. The grand total was unaffected -- which is exactly
   why nobody noticed -- but on reload the single surviving taskId absorbed all
   of the merged cost and every other task it served showed no manpower.
   The breakdown is the part of the CE a reviewer reads, so it was wrong where
   it mattered most. */
console.log('\nA consolidated crew keeps the tasks it serves:');
const ROWS = [['CE_MP', 'mpPayloads', 'a shared crew'], ['CE_Resources', 'resPayloads', 'shared tools']];
for (const [list, payload, what] of ROWS) {
  const body = (db.match(new RegExp('const ' + payload + '=[\\s\\S]*?;const ')) || [''])[0];
  ck(what + ' is written with its shares', /shicShares:_shDump\(r\.shares\)/.test(body),
    'without this the merged cost lands entirely on one task');
  ck('the ' + list + ' column is provisioned', new RegExp("\\[spList\\('" + list + "'\\)\\][^\\n]*\\[3,'shicShares'\\]").test(reg),
    'an unprovisioned column 400s the whole save');
}
/* dbSaveHistory also queries these lists for 'Id' alone, to delete the previous
   revision's rows. Only the selects that actually load a row need the column. */
for (const sel of (db.match(/(?:_spGetByCE|_spGetTolerant|spGet)\(spList\('CE_(?:MP|Resources)'\),(?:`shicCEId eq \$\{id\}`|id),'[^']*'/g) || [])
                  .filter(s => !/,'Id'$/.test(s)))
  ck('shares are selected back out of ' + (sel.includes('CE_MP') ? 'CE_MP' : 'CE_Resources'), /shicShares/.test(sel),
    'writing a column without selecting it changes nothing');
ck('every row type parses them back', (db.match(/shares:_shParse\(r\.shicShares\)/g) || []).length === 4,
  'manpower, tools, materials and PPE -- Combine works on all of them');
ck('a row that was never consolidated stays clean', /Array\.isArray\(v\)&&v\.length\?JSON\.stringify\(v\):''/.test(db),
  'writing "[]" into every row would bloat the list for no reason');
ck('and malformed JSON cannot break the load', /catch\(_\)\{return \[\];\}/.test(db),
  'one bad row must not take the whole CE down');
/* The parsers must survive what the writer produces, including the empty
   string a normal row carries. */
const shDump = new Function('return ' + (db.match(/const _shDump=[^;]*/) || [''])[0].replace('const _shDump=', '') + ';')();
const shParse = new Function('return ' + (db.match(/const _shParse=s=>\{[\s\S]*?\};/) || [''])[0].replace('const _shParse=', '').replace(/;$/, '') + ';')();
const SH = [{ taskId: 't1', weight: 2 }, { taskId: 't2', weight: 15 }];
ck('shares survive the trip unchanged', JSON.stringify(shParse(shDump(SH))) === JSON.stringify(SH));
ck('an ordinary row round-trips to no shares', JSON.stringify(shParse(shDump(undefined))) === '[]');
ck('a truncated column does not throw', JSON.stringify(shParse('[{"taskId"')) === '[]');

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall CE round-trip assertions passed');
process.exit(fails ? 1 : 0);
