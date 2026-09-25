/* An approver is asked to sign a figure. Approvers kept asking what the client
   actually requested, and the two things that answer it -- the RCE checklist
   Sales filled in, and the drawings and TOR that came with the inquiry -- were
   reachable only by an estimator with the CE loaded in the editor.

   So both open from the CE viewer itself, where the approving is done, and
   neither can be edited from there: the checklist is Sales's record of what
   was sent, and an attachment on a saved CE is a company record. */
const fs = require('fs');
const path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let bad = 0;
const ck = (what, cond) => { console.log((cond ? '  PASS  ' : '  FAIL  ') + what); if (!cond) bad++; };

const app = R('src/App.js');
const card = R('src/components/RceChecklistCard.js');

console.log('What an approver can see');

/* The viewer's own header -- the row that carries Approve & Sign. */
const bar = app.slice(app.indexOf('/* ── CE Monitoring -> View ── */'), app.indexOf('"🖨 Print"'));

/* ---- the request behind the CE ---- */
ck('the viewer offers the request', bar.indexOf('"📋 Request"') > 0);
ck('it reads the checklist off the CE it is showing',
  /sortedHistory\.find\(x => x\.id === viewCE\.id\)/.test(bar) && /_e\.info && _e\.info\.rce/.test(bar));
/* A CE typed up directly never had a request. Hiding the button would leave
   an approver wondering where it went; disabling it says why. */
ck('a CE with no logged request disables it rather than hiding it',
  /disabled: !_rce/.test(bar));
ck('and says why, so it does not read as a fault',
  bar.indexOf('did not come from a logged request') > 0);

const panel = app.slice(app.indexOf('/* ── CE Monitoring -> View -> the request behind it ── */'),
  app.indexOf('/* ── CE Monitoring -> View ── */'));
ck('the panel shows the shipped checklist card, not a second copy of it',
  /React\.createElement\(RceChecklistCard, \{rce: _rce\}\)/.test(panel));
ck('the card is registered on the page', R('index.html').indexOf('RceChecklistCard.js') > 0);
ck('which is read-only -- it is what Sales sent, not a field to tidy',
  card.indexOf('onChange') < 0 && card.indexOf('<input') < 0);
ck('and the panel says so as well', panel.indexOf('Read-only') > 0);
ck('it names the CE it belongs to', /Request behind/.test(panel));
ck('the panel sits above the viewer that opened it', /zIndex:3100/.test(panel));
ck('and closes without touching the CE underneath',
  /onClick:e=>e\.stopPropagation\(\)/.test(panel) && /onClick:\(\)=>setViewRce\(null\)/.test(panel));

/* ---- the papers that came with it ---- */
ck('the viewer offers the attachments', bar.indexOf('"📎 Files"') > 0);
ck('through the panel that already existed, not a second reader',
  /openAttachPanel\(viewCE\.id\)/.test(bar));
ck('and clicking it again puts it away', /if \(attachPanel === viewCE\.id\) setAttachPanel\(null\)/.test(bar));
const att = app.slice(app.indexOf('/* ── Attachment Panel Modal ── */'), app.indexOf('/* ── CE Monitoring -> Remarks trail ── */'));
ck('that panel sits above the viewer too, or it cannot be read', /zIndex:3100/.test(att));
ck('a file opens in its own tab, so the CE stays where it was',
  /target:'_blank', rel:'noopener noreferrer'/.test(att));
/* Same rule as deleting the CE: an attachment is a company record. */
ck('and only an admin can delete one', /isAdmin && \/\*#__PURE__\*\/React\.createElement\("button", \{\s*style:\{\.\.\.btn\('danger'/.test(att));

/* ---- neither is offered on a draft, which has no saved record to read ---- */
ck('the request button is behind the draft guard',
  /!viewCE\.draftKey && \(\(\) => \{\s+const _e = sortedHistory/.test(bar));
ck('and so is the files button',
  /!viewCE\.draftKey && \/\*#__PURE__\*\/React\.createElement\(\"button\", \{\s+style: btn\(attachPanel === viewCE\.id/.test(bar));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nApprover context OK');
process.exit(bad ? 1 : 0);
