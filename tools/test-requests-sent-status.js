/* Requests I sent is its own table with a coloured status pill and time left, and the group that holds the reviews does not look like to-do.
   Run: node tools/test-requests-sent-status.js */
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src/components/MyWorkTab.js'), 'utf8');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('anyone who has sent a request gets the table, not just requestors', src.includes('(isRequestor || sent.length > 0) &&'));
ck('it is titled Requests I sent for them and My requests for a requestor', src.includes("(isRequestor ? '📤 My requests' : '📤 Requests I sent')"));
ck('the table has a due column', src.includes("'ASSIGNED TO', 'DUE', 'STATUS', ''"));
ck('declined and returned have their own wording', src.includes("'Returned to you'") && src.includes("'Sent back to Cost Estimation'"));
ck('the time left is in words', src.includes("' days overdue'") && src.includes("'due today'") && src.includes("'due in '"));
ck('Requests I sent is no longer inside the Requests group', !src.includes("section('📤 Requests I sent'"));
ck('that group counts only reviews and its badge is neutral', src.includes("idx: [7], info: true") && src.includes("g.count && !g.info ?"));
ck('a person who is not a requestor can still View and Add details from the table', src.includes('!isRequestor && addBtn(x), !isRequestor && viewBtn(x)'));
process.exit(bad ? 1 : 0);
