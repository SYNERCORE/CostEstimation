/* My Work groups its lists into three labelled tabs with counts, instead of eight boxes.
   Run: node tools/test-mywork-tabs.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8').replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('it parses', (() => { try { new Function(app); return true; } catch (e) { console.log(e.message); return false; } })());
ck('the three tabs', ["Needs my action'", "My CEs and drafts'", "Requests and reviews'"].every(k => app.indexOf(k) > 0));
ck('each tab carries a count, red for the one that needs action', app.indexOf("g.urgent ? ERR : ACC") > 0 && app.indexOf("count: g.idx.reduce") > 0);
ck('it opens on the first tab with something in it, until one is picked', app.indexOf('groups.find(g => g.count > 0) || groups[0]') > 0 && app.indexOf("const [mwTab, setMwTab] = useState('')") > 0);
ck('a section with nothing in it is left out, and an empty tab says so', app.indexOf('cur.idx.filter(i => n[i] > 0)') > 0 && app.indexOf("'Nothing needs you right now.'") > 0);
ck('the requestor has no Requests tab (their own requests have a table)', app.indexOf("g.id !== 'req' || !isRequestor") > 0);
ck('the eight lists are the panel\'s items', app.indexOf("mwPanel([\n      section('✍ For my approval'") > 0 && app.indexOf("section('🔎 For review (status For Approval)', forReview, x => line(x, null, viewBtn(x)), '')]),") > 0);
ck('the signature and returned cards are gone; the tab holds them and its tooltip gives the split', app.indexOf("kpi('Awaiting my signature'") < 0 && app.indexOf("kpi('Returned to me'") < 0 && app.indexOf("' awaiting my signature · '") > 0);
process.exit(bad ? 1 : 0);
