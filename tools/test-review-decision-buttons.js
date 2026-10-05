/* The review dialog decides with Accept / Return to requestor / Decline buttons that stay in view.
   Run: node tools/test-review-decision-buttons.js */
'use strict';
const fs = require('fs'), path = require('path');
const m = fs.readFileSync(path.join(__dirname, '..', 'src/components/RceReviewModal.js'), 'utf8');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('three decision buttons, each submitting its own decision', ["submit('decline')", "submit('secure')", "submit('proceed')"].every(k => m.indexOf(k) > 0));
ck('they are named for what they do', ["'Decline / No Quote'", "'Return to requestor'", "'Accept the request'"].every(k => m.indexOf(k) > 0));
ck('the footer stays in view while the checklist scrolls', m.indexOf("position: 'sticky', bottom: -18") > 0);
ck('the pressed decision is the one validated, so Accept still needs an estimator and Decline a reason', m.indexOf('const rec = pick || recState;') > 0 && m.indexOf("rec === 'proceed' && !String(est).trim()") > 0 && m.indexOf("rec === 'decline' && !String(reason).trim()") > 0);
ck('the requestor still gets one Send back button', m.indexOf("'Send back to Cost Estimation'") > 0);
ck('what is still needed shows in the footer, where the buttons are', m.indexOf("errs.length > 0 && React.createElement('div', { style: { flexBasis: '100%'") > m.indexOf('position: ' + String.fromCharCode(39) + 'sticky'));
process.exit(bad ? 1 : 0);
