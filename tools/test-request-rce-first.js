/* A request is known by its RCE No.; it gets a CE number when it is accepted.
   ===========================================================================
   Sales raises a request with the RCE No. they were given. No CE number exists
   yet: the Cost Estimation team gives one when it accepts the request, and only
   then is the estimate built. Until then the RCE No. is the key the request is
   filed under; accepting renames the same row, so its Monitoring entry and its
   documents stay with it.

   Run: node tools/test-request-rce-first.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.js'), 'utf8');
const db = fs.readFileSync(path.join(__dirname, '..', 'src', 'db.js'), 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };
const NL = String.fromCharCode(10);
const cut = (s, from, to) => { const a = s.indexOf(from), b = s.indexOf(to, a); if (a < 0 || b < 0) { console.error('anchor missing: ' + from); process.exit(1); } return s.slice(a, b); };

console.log('the form:');
const form = cut(app, 'sect("THE INQUIRY"),', 'sect("THE CUSTOMER');
ck('asks for the RCE No., required', form.indexOf('L("RCE No. *"') > 0);
ck('and no longer for a CE number', form.indexOf('L("CE Number *"') < 0);
ck('the RCE No. is not asked for twice', form.split("inp('rceNo'").length - 1 === 1);
ck('a new form is not seeded with a CE number', app.indexOf("setReqForm({ ceType: 'onsite',") > 0 && app.indexOf('setReqForm({ ceNum:') < 0);

console.log(NL + 'submitting:');
const sub = cut(app, 'const submitRequest = async () => {', 'const [statusDraft');
ck('the request is filed under its RCE No.', sub.indexOf("const ceNum = String(f.rceNo || '').trim().toUpperCase();") > 0);
ck('an empty RCE No. is refused', sub.includes("_todo.push('RCE No.')"));
ck('a repeated RCE No. is refused', /already on a request or a CE/.test(sub) && sub.indexOf('m.rceNo') > 0);
ck('the request carries its RCE No. both as requestNum and rceNo', sub.indexOf('request: true, requestNum: ceNum, rceNo: ceNum,') > 0 && sub.indexOf('rceNo: ceNum };') > 0);
ck('it does not claim a CE number in the sequence', sub.indexOf('setCeNums') < 0);

console.log(NL + 'accepting:');
const acc = cut(app, 'const acceptRequest = async (e, extra) => {', 'const submitRequest = async');
const run = (info, answer, taken, dbRes, role) => {
  const calls = { toasts: [], accepted: null, hist: null, audit: [] };
  const fn = new Function('isRequestor', 'showToast', 'window', 'nextCeNum', 'history', 'ceNums', 'dbFindCEByNum', 'dbFindCESeqClash', 'dbAcceptRequest',
    'currentUser', 'setHistory', 'LS', 'logSwallowed', 'setCeNums', 'auditLog', 'companies', 'nextCeNumForCompany',
    acc + NL + 'return acceptRequest;')(
    role === 'requestor', (m, e) => calls.toasts.push({ m, e: !!e }),
    { prompt: () => answer }, () => 'SHIC-CE-2026-1190', [], [],
    async () => taken, async () => null,
    async (id, o, n, i) => { calls.accepted = { id, o, n, i }; return dbRes || { ok: true }; },
    { name: 'Est One', username: 'est1' }, f => { calls.hist = f([{ id: 7, ceNum: 'RCE-45', info: { request: true } }, { id: 8, ceNum: 'X', info: {} }]); },
    { get: () => [{ id: 7 }], set: () => {} }, () => {}, () => {}, (a, d) => calls.audit.push([a, d]), [], () => 'SHIC-CE-2026-1190');
  return fn({ id: 7, info }).then(() => calls);
};
const REQ = { ceNum: 'RCE-45', requestNum: 'RCE-45', request: true };
(async () => {
  let c = await run(REQ, 'shic-ce-2026-1190', null);
  ck('it asks for a CE number and renames the request to it', c.accepted && c.accepted.o === 'RCE-45' && c.accepted.n === 'SHIC-CE-2026-1190', JSON.stringify(c.accepted));
  ck('the RCE No. is kept on the CE', c.accepted.i.requestNum === 'RCE-45' && c.accepted.i.rceNo === 'RCE-45');
  ck('it records who accepted it and as what', c.accepted.i.acceptedCeNum === 'SHIC-CE-2026-1190' && c.accepted.i.acceptedBy === 'Est One' && !!c.accepted.i.acceptedAt);
  ck('it is still a request until it is costed', c.accepted.i.request === true);
  ck('only that row changes in the list', c.hist[0].ceNum === 'SHIC-CE-2026-1190' && c.hist[1].ceNum === 'X');
  ck('and it is audited', c.audit.length === 1 && /RCE-45 -> SHIC-CE-2026-1190/.test(c.audit[0][1]));
  c = await run(REQ, 'SHIC-CE-2026-1190', { id: 3 });
  ck('a CE number already in use is refused', !c.accepted && c.toasts[0].e === true);
  c = await run(REQ, 'x', null);
  ck('a malformed CE number is refused', !c.accepted && c.toasts[0].e === true);
  c = await run(REQ, null, null);
  ck('cancelling the prompt changes nothing', !c.accepted && c.toasts.length === 0);
  c = await run(Object.assign({ acceptedCeNum: 'A-1' }, REQ), 'SHIC-CE-2026-1190', null);
  ck('a request already accepted is not accepted twice', !c.accepted);
  c = await run({ ceNum: 'SHIC-CE-2026-1001' }, 'SHIC-CE-2026-1190', null);
  ck('a CE that was never a request is left alone', !c.accepted);
  c = await run(REQ, 'SHIC-CE-2026-1190', null, null, 'requestor');
  ck('a requestor cannot accept', !c.accepted && c.toasts[0].e === true);
  c = await run(REQ, 'SHIC-CE-2026-1190', null, { ok: false, reason: 'boom' });
  ck('a refusal from SharePoint is reported and the list is not changed', c.toasts.some(t => /boom/.test(t.m)) && c.hist === null);

  console.log(NL + 'the site:');
  const src = cut(db, 'async function dbAcceptRequest(ceId,oldNum,newNum,info){', '/* Batch-save all entries');
  const rec = { patches: [], local: null };
  const dbf = new Function('USE_SP', 'getSiteURL', 'spGet', 'spList', 'spWithRetry', 'spPatch', '_monRowsFor', '_ceLoadLocal', 'cePut', 'logSwallowed',
    src + NL + 'return dbAcceptRequest;')(true, () => 'x', async () => [{ Id: 70 }], n => 'P_' + n, f => f(),
    async (l, id, d) => { rec.patches.push([l, id, d]); }, async () => [{ Id: 500 }, { Id: 501 }], async () => ({ ceNum: 'RCE-45', info: {} }),
    async o => { rec.local = o; }, () => {});
  const r = await dbf(7, 'RCE-45', 'SHIC-CE-2026-1190', { ceNum: 'SHIC-CE-2026-1190', request: true });
  ck('the CE row is renamed and its info rewritten in one patch', r.ok && rec.patches[0][0] === 'P_CEs' && rec.patches[0][1] === 70 &&
    rec.patches[0][2].Title === 'SHIC-CE-2026-1190' && /acceptedCeNum|request/.test(rec.patches[0][2].shicInfo), JSON.stringify(rec.patches[0]));
  ck('every Monitoring row of that CE is retitled', rec.patches.filter(p => p[0] === 'P_Monitoring').map(p => p[1]).join() === '500,501');
  ck('the local archive follows', rec.local && rec.local.ceNum === 'SHIC-CE-2026-1190');

  console.log(NL + 'loading and saving:');
  ck('Load refuses a request nobody has accepted', /Review this request first/.test(app) && app.indexOf('!_ri.acceptedCeNum') > 0);
  ck('saving the accepted CE under its new number is not mistaken for a duplicate', app.indexOf('(info.acceptedCeNum && String(info.acceptedCeNum).toUpperCase() === ceNum)') > 0);
  ck('Accept sits beside the REQUEST badge, for the team only', app.indexOf("!isRequestor && e.info?.request && !e.info.acceptedCeNum && !e._draft && typeof e.id === 'number'") > 0);
  ck('the requestor\'s table says RCE / CE', app.indexOf("'RCE / CE NO.'") > 0);
  process.exit(bad ? 1 : 0);
})();
