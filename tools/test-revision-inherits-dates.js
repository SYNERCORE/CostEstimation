#!/usr/bin/env node
/*
 * A revision is the same job, so it keeps the received date, deadline, receiver and RCE No. of the CE it revises -- the date being the one the
 * Date Recv. column SHOWS for that CE (its own, else the day it was saved). Revisions saved before this get the same through an admin button,
 * which fills only blanks and carries forward along the chain R0 -> R1 -> R2.
 *
 * Runs the real helpers and the real backfill memo. Run: node tools/test-revision-inherits-dates.js
 */
'use strict';
process.env.TZ = 'Asia/Manila';
const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8');
const mon = fs.readFileSync('src/components/MonitoringPanel.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

const grab = (re, what) => { const m = app.match(re); if (!m) { console.error('not found: ' + what); process.exit(1); } return m[0]; };
const helpers = grab(/const localIso = [^\n]*\n  const REV_INHERIT = [^\n]*\n  const effRecv = [^\n]*\n  const revInherit = [\s\S]*?\n  \};\n/, 'helpers');
const memo = grab(/const revDateFixes = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[monRows, monData\]\);/, 'revDateFixes');
const famSrc = grab(/const CE_REV_RE = [^\n]*\nfunction ceFamily\(num\) \{[\s\S]*?\n\}\n/, 'ceFamily');
const grpSrc = grab(/function groupCERevisions\(rows, numOf\) \{[\s\S]*?\n\}\n/, 'groupCERevisions');

const build = (history, monData) => new Function('history', 'monData', 'monRows', 'monOf', 'useMemo',
  famSrc + grpSrc + helpers + '\n' + memo.replace(/^const revDateFixes = /, 'const revDateFixes = ') + '\nreturn {revInherit, revDateFixes, effRecv};')
  (history, monData, history, e => monData[e.id] || {}, f => f());

(async () => {
  const H = [
    { id: 1, info: { ceNum: 'SHIC-CE-2026-1197' }, savedAt: '2026-10-10T08:00:00+08:00' },
    { id: 2, info: { ceNum: 'SHIC-CE-2026-1197-R1' }, savedAt: '2026-10-12T09:00:00+08:00' }
  ];
  /* at save time */
  let a = build(H, { 1: { dateRecv: '2026-10-05', deadline: '2026-10-30', receivedBy: 'Ana', rceNo: 'RCE-1' } });
  let got = a.revInherit('SHIC-CE-2026-1197', {});
  ck('a new revision takes the received date, deadline, receiver and RCE No. of the CE it revises', got.dateRecv === '2026-10-05' && got.deadline === '2026-10-30' && got.receivedBy === 'Ana' && got.rceNo === 'RCE-1', JSON.stringify(got));
  ck('a value the revision already has is not overwritten', a.revInherit('SHIC-CE-2026-1197', { deadline: '2026-11-15' }).deadline === undefined);
  a = build(H, { 1: {} });
  ck('a CE with no received date of its own passes on the date it shows (the day it was saved)', a.revInherit('SHIC-CE-2026-1197', {}).dateRecv === '2026-10-10', JSON.stringify(a.revInherit('SHIC-CE-2026-1197', {})));
  ck('nothing is invented when the source has no deadline', a.revInherit('SHIC-CE-2026-1197', {}).deadline === undefined);
  ck('an unknown source number inherits nothing', Object.keys(a.revInherit('NOPE', {})).length === 0);

  /* the backfill for revisions saved earlier */
  a = build(H, { 1: { dateRecv: '2026-10-05', deadline: '2026-10-30' }, 2: {} });
  ck('an old revision with blanks is offered the original\'s values', a.revDateFixes.length === 1 && a.revDateFixes[0].id === 2 && a.revDateFixes[0].patch.dateRecv === '2026-10-05' && a.revDateFixes[0].patch.deadline === '2026-10-30', JSON.stringify(a.revDateFixes));
  a = build(H, { 1: { dateRecv: '2026-10-05', deadline: '2026-10-30' }, 2: { dateRecv: '2026-10-11', deadline: '2026-12-01' } });
  ck('a revision that has its own dates is left alone', a.revDateFixes.length === 0, JSON.stringify(a.revDateFixes));
  a = build(H, { 1: {}, 2: {} });
  ck('without a deadline anywhere only the shown date is carried', a.revDateFixes.length === 1 && a.revDateFixes[0].patch.dateRecv === '2026-10-10' && a.revDateFixes[0].patch.deadline === undefined, JSON.stringify(a.revDateFixes));

  /* a chain: R0 -> R1 -> R2 */
  const H3 = [...H, { id: 3, info: { ceNum: 'SHIC-CE-2026-1197-R2' }, savedAt: '2026-10-14T09:00:00+08:00' }];
  a = build(H3, { 1: { dateRecv: '2026-10-05', deadline: '2026-10-30' }, 2: {}, 3: {} });
  ck('it carries along the chain R0 to R1 to R2', a.revDateFixes.length === 2 && a.revDateFixes.every(f => f.patch.dateRecv === '2026-10-05' && f.patch.deadline === '2026-10-30'), JSON.stringify(a.revDateFixes));
  a = build([H[0]], { 1: {} });
  ck('a CE with no revisions is never touched', a.revDateFixes.length === 0);

  /* wiring */
  ck('Revise passes the CE it came from', /noteRevisionRemark\(_re\.info\.ceNum, _why, _re\.info, ceNum\)/.test(app) && /\.\.\.revInherit\(fromNum, monData\[saved\.id\]\)/.test(app));
  ck('the admin button shows only when there is something to fill', /isAdmin && \(revDateFixes \|\| \[\]\)\.length > 0/.test(mon) && /Inherit revision dates \(/.test(mon));
  ck('the backfill is admin-only, confirmed and audited', /const fillRevDates = async \(\) => \{\n\s+if \(!isAdmin/.test(app) && /uiConfirm\(revDateFixes\.length/.test(app) && /auditLog\('revision_inherit'/.test(app));

  console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nRevision inherits dates OK');
  process.exit(bad ? 1 : 0);
})();
