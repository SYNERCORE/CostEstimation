#!/usr/bin/env node
/* The four faults that stopped people signing at all:
   1. the fingerprint was taken from the editor, not from the CE as saved, so
      approvers were told "the figures changed" when nothing had;
   2. two signatures at once lost one of them;
   3. a half-loaded CE could be signed, saving away the missing lines;
   4. the viewer's Sign button believed Monitoring alone.
   Run: node tools/test-apv-blockers.js */
'use strict';
const fs = require('fs');
const vm = require('vm');
const app = fs.readFileSync('src/App.js', 'utf8');
const db = fs.readFileSync('src/db.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

/* ---- 1. the fingerprint is taken from the saved copy ---- */
ck('the CE is read back after it is saved',
  app.includes('const back = await dbLoadCE(dup.id);') &&
  app.includes("if (back && !back._partial && apvFigSig(back) !== apv.figSig) {"));
ck('and the corrected fingerprint is stored with the approval',
  app.includes('const fixed = {...apv, figSig: apvFigSig(back), contentSig: apvContentSig(back)};') &&
  app.includes('if (await dbPatchCEInfo(dup.id, {...(back.info || {}), approval: fixed})) apv = fixed;'));
ck('by a write that touches the header only, not every line',
  db.includes('async function dbPatchCEInfo(ceId,info){') && db.includes("shicInfo:JSON.stringify(info||{})") &&
  !db.slice(db.indexOf('async function dbPatchCEInfo')).slice(0, 700).includes('dbSaveHistory'));
ck('nothing is corrected when the save never reached SharePoint',
  app.includes("if (apv.state === 'pending' && !(res && res.sp === false)) {"));
ck('and an approver who is refused is told what it now totals',
  app.includes("'The figures changed after it was submitted (it now totals '") &&
  app.includes('N(N(full.grand) || computeCEGrand(full))'));

/* ---- 3. a CE that only half arrived cannot be signed ---- */
ck('db says so when rows are missing', db.includes('_ce._partial=true;_ce._missingRows=_missing;'));
ck('and signing refuses it', app.includes("if (full._partial) { showToast('This CE did not arrive complete — '"));
ck('as does correcting the fingerprint', app.includes('!back._partial'));

/* ---- 2. two signatures at once ---- */
ck('the CE is read once more at the last moment', app.includes('const now = await dbLoadCE(ceId);'));
ck('and a signature already there is left alone',
  app.includes("!(action === 'approve' && aN.lines && aN.lines[line.id])"));
ck('the two sets of signed lines are folded together',
  app.includes('lines: {...(aN.lines || {}), ...apv.lines}') && app.includes('log: apvMergeLog(aN.log, apv.log)'));
ck('so is the stamped image, onto the copy that was just read',
  app.includes('signatures: {...(now.signatures || {}), [line.id]: sigs[line.id]}'));
ck('and whether it is now fully approved is decided on the merged set',
  app.includes("merged.state = apvStatus(appr, merged).done ? 'approved' : 'pending';"));
ck('what is written is the merged CE', app.includes('dbSaveHistory({...out, grand: N(out.grand) || computeCEGrand(out)})'));

/* The trail itself, run as the app runs it. */
const apvCtx = { console };
vm.createContext(apvCtx);
vm.runInContext(fs.readFileSync('src/approval.js', 'utf8') + '\nthis.m = apvMergeLog;', apvCtx);
const merge = apvCtx.m;
const A = { at: '2026-09-01T01:00:00Z', by: 'a', action: 'submitted' };
const B = { at: '2026-09-01T02:00:00Z', by: 'b', action: 'approved', role: 'QA' };
const C = { at: '2026-09-01T03:00:00Z', by: 'c', action: 'approved', role: 'Ops' };
let got = merge([A, C], [A, B]);
ck('the two trails come back as one, in order',
  got.length === 3 && got.map(l => l.by).join('') === 'abc');
ck('and nothing is counted twice', merge([A], [A]).length === 1);
ck('an empty or missing trail is no trouble', merge(null, undefined).length === 0 && merge([A], null).length === 1);

/* ---- 4. the viewer asks the CE itself ---- */
ck('the viewer asks the CE when Monitoring says nothing',
  app.includes('const [viewApvTurn, setViewApvTurn] = useState(false);') &&
  app.includes('if (id == null || !currentUser || apvMonWaitsOn(monData[id], currentUser.username)) return;') &&
  app.includes('if (apvCanSign(full.approvers, a, currentUser.username)) setViewApvTurn(true);'));
ck('and repairs the mirror while it is there',
  app.includes('const fresh = apvMirror(full.approvers, a);') &&
  app.includes('updateMon(id, { apv: fresh });'));
ck('the button appears on either answer',
  app.includes('(apvMonWaitsOn(monData[viewCE.id], currentUser.username) || viewApvTurn)'));
ck('and it stops asking when the viewer is closed or changed',
  app.includes('return () => { off = true; };') &&
  app.includes('}, [viewCE && viewCE.id, viewCE && viewCE.k, currentUser && currentUser.username]);'));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\napproval blockers OK'); process.exit(bad ? 1 : 0);
