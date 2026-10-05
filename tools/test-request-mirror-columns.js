/* A request's events are stated as plain columns, for the Power Automate flow (docs/power-automate-request-flow.md).
   Run: node tools/test-request-mirror-columns.js */
'use strict';
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const db = R('src/db.js'), app = R('src/App.js'), reg = R('src/components/RegisterPage.js'), doc = R('docs/power-automate-request-flow.md');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

const a = db.indexOf('function _apvCols('), b = db.indexOf('/* A site that has not had', a);
const apvMirrorKey = () => 'k';
const cols = new Function('apvMirrorKey', db.slice(a, b) + 'return _apvCols;')(apvMirrorKey);

const got = cols({ req: { state: 'returned', to: 'Jess Tan', key: 'returned|2026-10-05T01:00:00Z', note: 'Send the TOR', by: 'Ana Cruz', rce: 'TEST-3' } }, 'TEST-3');
ck('the six columns carry the event', got.shicReqState === 'returned' && got.shicReqTo === 'Jess Tan' && got.shicReqKey === 'returned|2026-10-05T01:00:00Z' && got.shicReqNote === 'Send the TOR' && got.shicReqBy === 'Ana Cruz' && got.shicReqRce === 'TEST-3');
ck('a row with no request writes none of them', !Object.keys(cols({ status: 'Pending' }, 'X')).some(k => /^shicReq/.test(k)));
ck('the flow\'s own memory is never written', Object.keys(got).indexOf('shicReqNotified') < 0 && db.indexOf("out.shicReqNotified") < 0);
ck('a long note is cut to the column\'s size', cols({ req: { note: 'x'.repeat(500) } }, 'X').shicReqNote.length === 255);
ck('an approval and a request on one row both come through', (() => { const o = cols({ req: { state: 'new', key: 'k' }, apv: { state: 'pending', waiting: ['a'] } }, 'X'); return o.shicReqState === 'new' && o.shicApvState === 'pending'; })());

const strip = db.slice(db.indexOf('function _stripApvCols('), db.indexOf('function _stripApvCols(') + 600);
ck('a site without the columns still saves: they are stripped on the second try', ['shicReqState', 'shicReqTo', 'shicReqKey', 'shicReqNote', 'shicReqBy', 'shicReqRce'].every(c => strip.indexOf(c) > 0));
ck('Repair lists & columns creates them', ['shicReqState', 'shicReqTo', 'shicReqKey', 'shicReqNote', 'shicReqBy', 'shicReqRce'].every(c => reg.indexOf("'" + c + "'") > 0) && reg.indexOf('shicReqNotified') < 0);

ck('each event says what happened and who to tell', ["mkReq('new',", "mkReq('accepted',", 'mkReq(st,'].every(k => app.indexOf(k) > 0));
ck('the key is new at every event', app.indexOf("key: state + '|' + new Date().toISOString()") > 0);
ck('a returned or declined request goes to the requestor', app.indexOf("(_m.receivedBy || '')") > 0);
ck('an accepted one goes to the requestor and the estimators', app.indexOf("[_m.receivedBy, newEst || curEst].filter(Boolean).join(', ')") > 0);
ck('a new request tells the assigned estimators, and nobody by name when there is none', app.indexOf("mkReq('new', String(f.assignee || '').trim()") > 0);

ck('the flow steps are written down', doc.indexOf('Request — Teams') > 0 && doc.indexOf('shicReqNotified') > 0 && doc.indexOf('Get newest row for this request') > 0 && doc.indexOf('Trigger conditions') > 0);
const paren = (s) => { let d = 0; for (const ch of s) { if (ch === '(') d++; else if (ch === ')') d--; if (d < 0) return false; } return d === 0; };
const msg = doc.slice(doc.indexOf('@concat('), doc.indexOf('```', doc.indexOf('@concat(')));
ck('the message expression\'s brackets balance', paren(msg));
process.exit(bad ? 1 : 0);
