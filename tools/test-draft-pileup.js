#!/usr/bin/env node
/* Resume Work reached 143 rows. Two reasons, both closed here:
   merely OPENING a saved CE counted as a change and wrote a draft of it; and
   a draft was only ever retired by the person who saved that CE, in the
   session that saved it, so every other draft of it stayed for good.
   Run: node tools/test-draft-pileup.js */
'use strict';
const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

/* ---- opening a CE is not work in progress ---- */
ck('what was just loaded is recorded as already written',
  app.includes("setTimeout(() => { try { if (_live.current) _lastAutoSig.current = _live.current.sig; } catch (_e) {} }, 400);"));
ck('and the auto-save still only writes a CE that has changed',
  app.includes('if(live.sig===_lastAutoSig.current)return;') && app.includes('_lastAutoSig.current=live.sig;'));
ck('a save still accounts for its own state, as it always did',
  app.includes('if (_live.current) _lastAutoSig.current = _live.current.sig;'));

/* ---- a finished draft clears itself ---- */
const start = app.indexOf('  const _draftPrunedRef = React.useRef(new Set());');
const stop = app.indexOf('    if (!done.length) return;', start);
ck('the rule is in the app', start > 0 && stop > start);
const run = new Function('sharedDrafts', 'history', 'React',
  app.slice(start, stop).replace('const _draftPrunedRef = React.useRef(new Set());', 'const _draftPrunedRef = { current: new Set() };')
    .replace('useEffect(() => {', 'const _eff = () => {')
    .replace("if (!sharedDrafts.length || !history.length) return;", "if (!sharedDrafts.length || !history.length) return [];") +
  '\n    return done; };\n  return _eff();');

const hist = [
  { ceNum: 'SY3-CE-2026-1129-R7', savedAt: '2026-09-23T05:00:00Z', savedBy: 'aljon' },
  { info: { ceNum: 'SY3-CE-2026-1059' }, savedAt: '2026-09-23T02:00:00Z', savedBy: 'kenneth' }
];
const drafts = [
  { draftId: 'a', savedBy: 'aljon', savedAt: '2026-09-23T04:00:00Z', info: { ceNum: 'SY3-CE-2026-1129-R7' } },
  { draftId: 'b', savedBy: 'kenneth', savedAt: '2026-09-23T06:00:00Z', info: { ceNum: 'SY3-CE-2026-1059' } },
  { draftId: 'c', savedBy: 'mark', savedAt: '2026-09-23T04:00:00Z', info: { ceNum: 'SHIC-CE-2026-1145' } },
  { draftId: 'd', savedBy: 'aljon', savedAt: '', info: { ceNum: 'SY3-CE-2026-1129-R7' } }
];
const done = run(drafts, hist).map(d => d.draftId);
ck('a draft written before its CE was saved, by the person who saved it, is cleared', done.includes('a'));
ck('a draft written AFTER the save is somebody\'s newer work and is kept', !done.includes('b'));
ck('a draft of a CE that was never saved is kept', !done.includes('c'));
ck('and one with no time on it is left alone rather than guessed at', !done.includes('d'));
ck('nothing else is touched', done.length === 1);
ck('a lower-case or spaced CE number still matches', run(
  [{ draftId: 'e', savedBy: 'aljon', savedAt: '2026-09-23T04:00:00Z', info: { ceNum: ' sy3-ce-2026-1129-r7 ' } }], hist).length === 1);
/* Narrowed deliberately in the audit: see test-audit-hardening.js. Somebody
   else's draft of the same CE may hold changes that never went in. */
ck("and somebody else's draft of the same CE is left for a person to decide on",
  !run([{ draftId: 'f', savedBy: 'someone-else', savedAt: '2026-09-23T04:00:00Z', info: { ceNum: 'SY3-CE-2026-1129-R7' } }], hist).length);
ck('it is cleared from the site, not just from the screen',
  app.includes('try { await dbDeleteDraft(d.draftId); gone++; }') &&
  app.includes("setSharedDrafts(p => p.filter(x => !done.some(d => d.draftId === x.draftId)));"));
ck('and it says how many went', app.includes("'Resume Work: ' + gone + ' finished draft'"));
ck('a draft it could not delete is tried again another time, not counted',
  app.includes('catch (_e) { /* left for next time */ }'));

/* ---- what is left is labelled ---- */
ck('a draft whose CE is saved says so in the list', app.includes('"newer than the saved CE"'));
ck('with what that means', app.includes('so it holds changes the saved CE does not.'));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\ndraft pile-up OK'); process.exit(bad ? 1 : 0);
