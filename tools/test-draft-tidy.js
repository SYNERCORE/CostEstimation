#!/usr/bin/env node
/* Resume Work can be cleared out in one go, by the two things that make a
   draft dead: its CE has since been saved, or nobody has touched it in a
   month. Somebody else's draft is an admin's to clear, nobody else's.
   Run: node tools/test-draft-tidy.js */
'use strict';
const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

const start = app.indexOf('  const draftTidyGroups = () => {');
const stop = app.indexOf('  const [draftTidyBusy', start);
ck('the grouping is in the app', start > 0 && stop > start);
const mk = (isAdmin, now) => new Function('history', 'sharedDrafts', 'currentUser', 'isAdmin', 'Date',
  'return (' + app.slice(start, stop).replace('const draftTidyGroups = ', '').trim().replace(/;$/, '') + ')();');

const NOW = Date.parse('2026-09-23T12:00:00Z');
const FakeDate = { now: () => NOW, parse: Date.parse };
const history = [{ ceNum: 'SY3-CE-2026-1129-R7' }, { info: { ceNum: 'SY3-CE-2026-1059' } }];
const drafts = [
  { draftId: 'a', savedBy: 'me', savedAt: '2026-09-23T10:00:00Z', info: { ceNum: 'SY3-CE-2026-1129-R7' } },
  { draftId: 'b', savedBy: 'aljon', savedAt: '2026-09-23T10:00:00Z', info: { ceNum: 'SY3-CE-2026-1059' } },
  { draftId: 'c', savedBy: 'me', savedAt: '2026-06-01T10:00:00Z', info: { ceNum: 'SY3-CE-2026-0900' } },
  { draftId: 'd', savedBy: 'kenneth', savedAt: '2026-05-01T10:00:00Z', info: { ceNum: 'SY3-CE-2026-0800' } },
  { draftId: 'e', savedBy: 'me', savedAt: '2026-09-23T11:00:00Z', info: { ceNum: 'SY3-CE-2026-1200' } }
];
const groups = admin => mk()(history, drafts, { username: 'me' }, admin, FakeDate);

let g = groups(true);
ck('an admin sees every draft whose CE is saved', g.savedCE.map(d => d.draftId).sort().join('') === 'ab');
ck('and every one over 30 days old', g.old.map(d => d.draftId).sort().join('') === 'cd');
ck('work in progress on an unsaved CE is never offered', !g.savedCE.concat(g.old).some(d => d.draftId === 'e'));

g = groups(false);
ck('a plain user is only ever offered their own', g.savedCE.map(d => d.draftId).join('') === 'a' && g.old.map(d => d.draftId).join('') === 'c');
ck('and the panel says how many belong to other people', g.othersN === 2 && g.mineN === 3);

/* ---- what clearing does ---- */
ck('it says exactly what it will clear, and who wrote it',
  app.includes("list.slice(0, 12).map(d => '  \\u2022 ' + ((d.info && d.info.ceNum) || '(no CE#)')"));
ck('it warns when the drafts are not yours',
  app.includes("(notMine ? notMine + ' of them belong to somebody else. ' : '')"));
ck('and that unsaved work goes for good, while saved CEs do not',
  app.includes('Whatever they hold that was never saved is lost for good. The saved CEs and their Monitoring rows are not touched.'));
ck('nothing happens without an answer', app.includes("if (!confirm('Clear ' + what + '?'"));
ck('only the drafts that really went leave the list',
  app.includes('removed.add(d.draftId);') && app.includes('setSharedDrafts(p => p.filter(x => !removed.has(x.draftId)));'));
ck('and one that could not be reached is reported, not hidden',
  app.includes("(kept ? ', ' + kept + ' could not be reached and are still there' : '')"));
ck('the list is re-read afterwards, quietly', app.includes('loadSharedDrafts(true);'));

/* ---- the buttons ---- */
ck('both sit in the Resume Work header with their counts',
  app.includes("() => tidyDrafts('saved'), g.savedCE.length)") && app.includes("() => tidyDrafts('old'), g.old.length)"));
ck('a button with nothing to clear cannot be pressed', app.includes("disabled: !n || draftTidyBusy,"));
ck('and neither can be pressed twice at once', app.includes('const [draftTidyBusy, setDraftTidyBusy] = useState(false);'));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\ndraft tidy OK');
process.exit(bad ? 1 : 0);
