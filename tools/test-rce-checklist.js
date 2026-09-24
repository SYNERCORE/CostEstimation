/* The request form is the RCE checklist form, SHIC-F-SMD-002 Rev 01. What
   matters is not that the fields exist but that the checklist is a gate: a
   request cannot be handed to an estimator with items unanswered, because
   "can this be costed yet" is the only question the form is asked. */
const fs = require('fs');
const path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let bad = 0;
const ck = (what, cond) => { console.log((cond ? '  PASS  ' : '  FAIL  ') + what); if (!cond) bad++; };

const consts = R('src/constants.js');
const app = R('src/App.js');
const card = R('src/components/RceChecklistCard.js');

console.log('RCE checklist');

/* ---- the items are the paper form's, not an approximation ---- */
const items = new Function(consts.slice(consts.indexOf('const RCE_ITEMS = [')).split('];')[0] + '];\nreturn RCE_ITEMS;')();
ck('thirteen items, as the form has', items.length === 13);
ck('numbered 1 to 13 in order', items.every((it, i) => it.n === i + 1));
[[1, 'PR / ITB / RFQ'], [2, 'In line with SHIC'], [5, 'Terms of Reference'], [8, 'Asset and equipment'],
 [11, 'Acceptance criteria'], [13, 'Implementation schedule']].forEach(([n, frag]) => {
  const it = items.find(x => x.n === n);
  ck('item ' + n + ' is "' + frag + '..."', !!it && it.t.indexOf(frag) === 0);
});
ck('the form it came from is named', app.indexOf('SHIC-F-SMD-002 Rev 01') > 0);

/* ---- item 14 ---- */
ck('all three recommendations exist', ['proceed', 'secure', 'decline']
  .every(v => consts.indexOf("v: '" + v + "'") > 0));
ck('and they are numbered as the form numbers them',
  ['14.1', '14.2', '14.3'].every(n => consts.indexOf(n) > 0));

/* ---- the gate ---- */
const fn = consts.slice(consts.indexOf('function rceUnanswered'));
const rceUnanswered = new Function('RCE_ITEMS', fn.slice(0, fn.indexOf('\n}') + 2) + '\nreturn rceUnanswered;')(items);
ck('a blank checklist leaves every item unanswered', rceUnanswered({}).length === 13);
ck('an item answered No counts as answered -- No is a record, not a gap',
  rceUnanswered({ items: { 1: { v: 'no' } } }).length === 12);
ck('N/A counts as answered too', rceUnanswered({ items: { 1: { v: 'na' } } }).length === 12);
ck('a remark with no answer is still unanswered',
  rceUnanswered({ items: { 1: { r: 'sent by email' } } }).length === 13);
ck('a full checklist leaves nothing unanswered',
  rceUnanswered({ items: Object.fromEntries(items.map(i => [i.n, { v: 'yes' }])) }).length === 0);

const submit = app.slice(app.indexOf('const submitRequest = async ()'), app.indexOf('const [statusPanel'));
ck('the form refuses a request with items unanswered', submit.indexOf('const _miss = rceUnanswered(f);') > 0);
ck('and names the first one, so it can be found', /_miss\[0\]\.n \+ ', ' \+ _miss\[0\]\.t/.test(submit));
ck('item 14 is required as well', submit.indexOf("if (!f.recommendation)") > 0);
ck('a decline must say why', /recommendation === 'decline' && !String\(f\.declineReason/.test(submit));

/* The gate must come BEFORE anything is written, or a refused request has
   already been saved and assigned by the time it is refused. */
const gateAt = submit.indexOf('const _miss = rceUnanswered(f);');
['dbSaveHistory(', 'dbSaveMonEntry(', 'auditLog('].forEach(w => {
  const at = submit.indexOf(w);
  ck('nothing is written before the gate: ' + w.replace('(', ''), at < 0 || gateAt < at);
});

/* ---- it survives the round trip ---- */
ck('the checklist is stored on info, which is saved whole as one JSON column',
  /rce: \{ inquiryNo:/.test(submit));
const dbsrc = R('src/db.js');
ck('and info really is stored whole', dbsrc.indexOf('shicInfo:JSON.stringify(e.info||{})') > 0);
ck('so no new SharePoint column is needed', dbsrc.indexOf('shicRce') < 0);
ck('who raised it and when are kept with it', /preparedBy:.*preparedAt:/s.test(submit));

/* ---- the estimator can read it back ---- */
ck('the checklist is shown on the CE it became', app.indexOf('React.createElement(RceChecklistCard, {rce: info.rce})') > 0);
ck('the card is loaded by the page', R('index.html').indexOf('RceChecklistCard.js') > 0);
ck('what did NOT come is pulled to the top', /a\.v === 'no' \? 0 : 1/.test(card));
ck('and counted in the header the estimator sees first',
  card.indexOf("' of ' + RCE_ITEMS.length + ' did not come with the inquiry'") > 0);
ck('a checklist with gaps opens itself; a clean one stays folded',
  /useState\(missing\.length > 0 \|\| rce\.recommendation !== 'proceed'\)/.test(card));
ck('it is read-only -- it is the record of what was sent, not a field to tidy',
  card.indexOf('onChange') < 0 && card.indexOf('<input') < 0);

/* ---- the recommendation reaches CE Monitoring ---- */
ck('the recommendation is written into the Monitoring remarks',
  /RCE_RECOMMENDATIONS\.find\(r => r\.v === f\.recommendation\)/.test(submit));
ck('and a decline carries its reason there too',
  /f\.recommendation === 'decline' \? String\(f\.declineReason/.test(submit));

/* ---- the form does not start half-filled ---- */
const open = app.slice(app.indexOf('const openRequest = ()'), app.indexOf('const submitRequest'));
ck('the checklist starts blank, not pre-answered Yes', open.indexOf('items: {}') > 0);
ck('every item answered Yes is never the default', open.indexOf("v: 'yes'") < 0);

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nRCE checklist OK');
process.exit(bad ? 1 : 0);
