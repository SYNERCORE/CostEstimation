#!/usr/bin/env node
/* Duplicate Monitoring rows are found, folded into one, and cleared -- and
   nothing is deleted before the admin has seen the list. A status written to
   the copy nobody was reading is rescued, not thrown away.
   Run: node tools/test-mon-dup-tidy.js */
'use strict';
const fs = require('fs');
const vm = require('vm');
const db = fs.readFileSync('src/db.js', 'utf8');
const panel = fs.readFileSync('src/components/LocalToSPSync.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

/* ---- the grouping and the merge, run as the app runs them ---- */
const ctx = { console, JSON, Date, Array, Object, String, setTimeout };
vm.createContext(ctx);
const cut = src => {
  const a = db.indexOf('function _monMergeLog');
  const b = db.indexOf('async function dbGetMon');
  const c = db.indexOf('function _monMergeRow');
  const d = db.indexOf('async function dbTidyMonDuplicates');
  return db.slice(a, db.indexOf('\n}', a) + 2) + db.slice(c, d);
};
vm.runInContext(cut() + '\nthis.M = _monMergeRow;', ctx);
const mergeRow = ctx.M;

const keep = { status: 'Draft', statusChangedAt: '2026-09-22T01:00:00Z', statusChangedBy: 'Aljon',
  jobTitle: 'FABRICATION', statusLog: [{ status: 'Draft', at: '2026-09-22T01:00:00Z', by: 'Aljon' }] };
const other = { status: 'Superseded', statusChangedAt: '2026-09-23T04:00:00Z', statusChangedBy: 'Jhuniel',
  deadline: '2026-10-01', statusLog: [{ status: 'Superseded', at: '2026-09-23T04:00:00Z', by: 'Jhuniel' }] };
let m = mergeRow(keep, other);
ck('a status change written to the copy nobody read is rescued', m.status === 'Superseded');
ck('with who made it and when', m.statusChangedBy === 'Jhuniel' && m.statusChangedAt === '2026-09-23T04:00:00Z');
ck('both trails are kept, in order',
  m.statusLog.length === 2 && m.statusLog[0].status === 'Draft' && m.statusLog[1].status === 'Superseded');
ck('a field only the other copy had is not lost', m.deadline === '2026-10-01');
ck('and the row that was on screen wins where it is newer', mergeRow(other, keep).status === 'Superseded');
m = mergeRow({ status: 'Ongoing', statusChangedAt: '2026-09-25T00:00:00Z', jobTitle: 'A' }, { status: 'Draft', statusChangedAt: '2026-09-01T00:00:00Z' });
ck('an older status in the other copy does not undo a newer one', m.status === 'Ongoing');
m = mergeRow({ remarks: 'old', remarksLog: [{ text: 'old', at: '2026-09-01T00:00:00Z', by: 'A' }] },
  { remarksLog: [{ text: 'new', at: '2026-09-20T00:00:00Z', by: 'B' }] });
ck('remarks from both copies stay, the latest shown', m.remarksLog.length === 2 && m.remarks === 'new');

/* ---- what it does to the list ---- */
ck('the newest row is the one kept', db.includes('const rows=by[cid].slice().sort((a,b)=>b.Id-a.Id);') &&
  db.includes('return {ceId:cid,title:rows[0].Title||cid,keep:rows[0].Id,drop:rows.slice(1).map(x=>x.Id),'));
ck('a CE with one row is never listed', db.includes('.filter(cid=>by[cid].length>1)'));
ck('the kept row is written BEFORE anything is deleted',
  db.indexOf("spPatch(spList('Monitoring'),g.keep") < db.indexOf("spDelete(spList('Monitoring'),id)"));
ck('a CE that fails is left whole, and the rest carry on',
  db.includes('}catch(e){failed++;if(onStep)onStep({ceId:g.ceId,title:g.title,ok:false,reason:e.message});}'));
ck('and the cached row id is dropped, so the next save looks it up again',
  db.includes('delete _monSpIdCache[g.ceId];'));

/* ---- the panel ---- */
ck('looking is a separate button from tidying',
  panel.includes("'🔍 Look for duplicates'") && panel.includes("'🧹 Tidy ' + dups.length + ' CE(s)'"));
ck('and Tidy only appears once something has been found',
  panel.includes('dups && dups.length > 0 && React.createElement(\'button\''));
ck('it says what it will delete, and asks first',
  panel.includes('older row(s) are deleted. Deleting cannot be undone.') && panel.includes('if (!window.confirm('));
ck('every CE it touches is reported', panel.includes("'  ✓ ' + st.title + ': ' + st.dropped + ' row(s) cleared'"));
ck('a clean list says so rather than offering to tidy nothing',
  panel.includes("'✅ Every CE has one row. Nothing to tidy.'"));
ck('and it sits in the admin sync panel', panel.includes('React.createElement(MonDupTidy, null)'));
ck('and the panel itself is loaded with the app', fs.readFileSync('index.html', 'utf8').includes('LocalToSPSync.js'));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nduplicate tidy OK'); process.exit(bad ? 1 : 0);
