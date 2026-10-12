#!/usr/bin/env node
/*
 * My Work: a CE that is saved AND has an autosaved draft of the same number is one item. The open-CE row shows "unsaved changes" and Resume,
 * and the draft is not listed again under My drafts. Drafts of other CEs stay listed.
 * Runs the real folding block. Run: node tools/test-mywork-draft-fold.js
 */
'use strict';
const fs = require('fs');
const src = fs.readFileSync('src/components/MyWorkTab.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };
const m = src.match(/const _dkey = [\s\S]*?const fDrafts = fDraftsAll\.filter\(d => !_folded\.has\(d\)\);/);
ck('the folding block exists', !!m);
if (m) {
  const run = (fOpen, drafts) => new Function('fOpen', 'drafts', 'fDraftsAll', m[0] + '\nreturn {draftOfOpen, fDrafts};')(fOpen, drafts, drafts);
  const open = [{ e: { id: 5, info: { ceNum: 'SHIC-CE-2026-1166' } } }];
  const dA = { draftId: 'a', info: { ceNum: ' shic-ce-2026-1166 ' }, savedAt: '2026-10-12T14:56:00' };
  const dB = { draftId: 'b', info: { ceNum: 'SHIC-CE-2026-2000' }, savedAt: '2026-10-12T10:00:00' };
  let r = run(open, [dA, dB]);
  ck('the draft of an open CE attaches to that CE (case/space insensitive)', r.draftOfOpen[5] === dA);
  ck('and is not listed again under My drafts', r.fDrafts.length === 1 && r.fDrafts[0] === dB);
  r = run(open, [dB]);
  ck('a CE with no draft shows nothing extra', !r.draftOfOpen[5] && r.fDrafts.length === 1);
  const dA2 = { ...dA, draftId: 'a2', savedAt: '2026-10-12T16:00:00' };
  r = run(open, [dA, dA2]);
  ck('with two drafts the latest is the one offered', r.draftOfOpen[5] === dA2);
  ck('the row shows the chip and Resume', /unsaved changes/.test(src) && /resumeDraft\(draftOfOpen\[x\.e\.id\]\)/.test(src));
}
console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nMy Work draft fold OK');
process.exit(bad ? 1 : 0);
