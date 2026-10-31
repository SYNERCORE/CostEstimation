/* Requests I sent shows a coloured status pill with who has it and the time left.
   Run: node tools/test-requests-sent-status.js */
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src/components/MyWorkTab.js'), 'utf8');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('the section uses the status pill', src.includes("section('📤 Requests I sent', fSent, x => line(x, sentStatus(x), viewBtn(x))"));
ck('declined and returned have their own wording', src.includes("'Declined'") && src.includes("'Returned to you'") && src.includes("'Sent back to Cost Estimation'"));
ck('an unassigned request says so', src.includes("'not yet assigned'"));
ck('the time left is in words', src.includes("' days overdue'") && src.includes("'due today'") && src.includes("'due in '"));
ck('the requestor table is untouched', src.includes("['RCE / CE NO.', 'CUSTOMER', 'JOB', 'DISCIPLINE', 'ASSIGNED TO', 'STATUS', '']"));
process.exit(bad ? 1 : 0);
