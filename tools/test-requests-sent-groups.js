/* Requests I sent / My requests are split into Open, Needs your action and Closed, each with a count.
   Run: node tools/test-requests-sent-groups.js */
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src/components/MyWorkTab.js'), 'utf8');
const cfg = fs.readFileSync(path.join(__dirname, '..', 'src/config.js'), 'utf8');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const a = src.indexOf('  const sentGroup = x =>'), b = src.indexOf('  const reqRow');
const closedLine = cfg.split(/\r?\n/).find(l => l.startsWith('const CE_CLOSED_STATUSES'));
const cfgFn = closedLine + ' function ceIsOpen(s) { return CE_CLOSED_STATUSES.indexOf(String(s || "Draft").trim()) < 0; }';
const sentGroup = new Function(cfgFn + src.slice(a, b) + '; return sentGroup;')();
const row = (info, status) => ({ e: { info }, m: { status } });
ck('a new request nobody has accepted is open', sentGroup(row({ request: true }, 'Pending')) === 'open');
ck('a request sent back to the requestor needs their action', sentGroup(row({ request: true, reviewStatus: 'returned' }, 'Pending')) === 'action');
ck('a CE waiting for information needs their action', sentGroup(row({}, 'Waiting for Information')) === 'action');
ck('a request sent back to the team is open again', sentGroup(row({ request: true, reviewStatus: 'resubmitted' }, 'Pending')) === 'open');
ck('a CE being worked on is open', sentGroup(row({}, 'Ongoing')) === 'open' && sentGroup(row({}, '')) === 'open');
ck('approved, awarded, no quote and cancelled are closed', ['Approved', 'Awarded', 'No Quote', 'Cancelled', 'Superseded'].every(s => sentGroup(row({}, s)) === 'closed'));
ck('a submitted estimate waits for acknowledgement of receipt', sentGroup(row({}, 'Submitted')) === 'action');
ck('once receipt is acknowledged it is closed', sentGroup({ e: { info: {} }, m: { status: 'Submitted', ackAt: '2026-11-01T00:00:00Z' } }) === 'closed');
ck('the button stamps who and when, then says so', src.includes('ackAt: new Date().toISOString(), ackBy:') && src.includes('Acknowledge receipt') && src.includes('acknowledged.'));
ck('a declined request is closed', sentGroup(row({ request: true, reviewStatus: 'declined' }, 'Pending')) === 'closed');
ck('a request that became a CE is judged by the CE status, not the old review state', sentGroup(row({ request: true, acceptedCeNum: 'X-1', reviewStatus: 'returned' }, 'Ongoing')) === 'open');
ck('three groups with a count each', ["'Open requests'", "'Needs your action'", "'Closed / completed'"].every(s => src.includes(s)) && src.includes('const reqCount = id =>'));
ck('only Needs your action turns the count orange', src.includes('g.todo && all ? ACC'));
ck('the closed group starts folded', src.includes("g.id !== 'closed' && all > 0"));
process.exit(bad ? 1 : 0);
