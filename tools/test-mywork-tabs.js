/* My Work groups its lists into three labelled collapsible groups with counts, instead of eight boxes.
   Run: node tools/test-mywork-tabs.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = require('./lib/appsrc').plus(fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8')).replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('it parses', (() => { try { new Function(app); return true; } catch (e) { console.log(e.message); return false; } })());
ck('the three tabs', ["Needs my action'", "My CEs and drafts'", "Requests and reviews'"].every(k => app.indexOf(k) > 0));
ck('each header carries a count, red for the one that needs action', app.indexOf("g.urgent ? ERR : ACC") > 0 && app.indexOf("count: g.idx.reduce") > 0);
ck('a group with something in it starts open, an empty one folded, and a click changes that', app.indexOf('mwOpen[g.id] != null ? mwOpen[g.id] : g.count > 0') > 0 && app.indexOf('const [mwOpen, setMwOpen] = useState({})') > 0 && app.indexOf('setMwOpen(p => ({...p, [g.id]: !isOpen}))') > 0);
ck('no tabs: every group is on the page at once', app.indexOf("role:'tablist'") < 0 && app.indexOf('mwTab') < 0);
ck('a section with nothing in it is left out, and an empty group says so', app.indexOf('g.idx.filter(i => n[i] > 0)') > 0 && app.indexOf("'Nothing needs you right now.'") > 0);
ck('the requestor has no Requests group (their own requests have a table)', app.indexOf("g.id !== 'req' || !isRequestor") > 0);
ck('the eight lists are the panel\'s items', app.indexOf("mwPanel([\n      section('✍ For my approval'") > 0 && app.indexOf("section('🔎 For review (status For Approval)', fForReview, x => line(x, null, viewBtn(x)), '')]),") > 0);
ck('the signature and returned cards are gone; the group holds them and its tooltip gives the split', app.indexOf("kpi('Awaiting my signature'") < 0 && app.indexOf("kpi('Returned to me'") < 0 && app.indexOf("' awaiting my signature ")  > 0);
process.exit(bad ? 1 : 0);
