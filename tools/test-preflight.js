/*
 * Exercises the Check CE pre-flight rules lifted out of src/App.js.
 * The panel is read-only, so the risk is a wrong verdict: telling the user a CE
 * is clean when it is not, or flagging a complete CE. Both are tested here.
 */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

/* Grab the rule block: everything between the issue list and the severity tally. */
const m = src.match(/const issues = \[\];[\s\S]*?const clean = issues\.length === 0;/);
if (!m) { console.error('could not find the pre-flight rule block in src/App.js'); process.exit(1); }
const rules = m[0];

const N = v => parseFloat(v) || 0;

function run(ctx) {
  const fn = new Function(
    'N', 'grand', 'collectZeroCost', 'info', 'sowItems', 'sowUnassignedCount',
    'margin', 'addlCosts', 'hlSources', 'approvers',
    rules + '\n return { issues, errs, warns, clean };'
  );
  return fn(
    N, ctx.grand, () => ctx.zero || [], ctx.info || {}, ctx.sowItems || [],
    ctx.sowUnassignedCount || 0, ctx.margin || 0, ctx.addlCosts || [],
    ctx.hlSources || [], ctx.approvers || []
  );
}

let fails = 0;
const check = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};
const has = (r, needle) => r.issues.some(i => i.msg.indexOf(needle) >= 0);

/* A CE with nothing filled in at all. */
const empty = run({ grand: 0 });
console.log('empty CE:');
check('is not reported clean', !empty.clean);
check('flags the zero grand total', has(empty, 'Grand total is ₱0.00'));
check('flags the missing description', has(empty, 'No project description'));
check('flags the missing client', has(empty, 'No client name'));
check('flags no scope items', has(empty, 'No Scope of Work'));
check('flags 0% margin', has(empty, 'Margin is 0%'));

/* A complete CE. */
const good = run({
  grand: 250000,
  info: { client: 'PETRON', description: 'IDF rotor rebalancing', qty: '1' },
  sowItems: [{ id: 't1', type: 'main', text: 'Pick-up' }],
  sowUnassignedCount: 0,
  margin: 15,
  approvers: [{ name: 'Mr. Warren Maralit' }],
});
console.log('\ncomplete CE:');
check('is reported clean', good.clean, JSON.stringify(good.issues.map(i => i.msg)));
check('has no errors', good.errs === 0, good.errs);

/* Severity split: unassigned resources are a review item, not a blocker. */
const partial = run({
  grand: 250000,
  info: { client: 'PETRON', description: 'IDF rotor rebalancing', qty: '1' },
  sowItems: [{ id: 't1', type: 'main', text: 'Pick-up' }],
  sowUnassignedCount: 12,
  margin: 15,
  approvers: [{ name: 'Mr. Warren Maralit' }],
});
console.log('\nunassigned resources:');
check('is flagged', has(partial, '12 resource rows not assigned'), JSON.stringify(partial.issues.map(i => i.msg)));
check('counts as review, not a blocker', partial.errs === 0 && partial.warns === 1, partial.errs + '/' + partial.warns);
check('links to the SOW Breakdown tab', partial.issues.some(i => i.tabId === 'sowbreak'));

/* Zero-cost items are a blocker and must be summarised. */
const zero = run({
  grand: 250000,
  info: { client: 'PETRON', description: 'x', qty: '1' },
  sowItems: [{ id: 't1' }], margin: 10, approvers: [{ name: 'A' }],
  zero: ['Tool: CHAIN BLOCK 1T', 'PPE: GLOVES'],
});
console.log('\nzero-cost line items:');
check('is flagged as an error', zero.errs === 1, zero.errs);
check('reports the count', has(zero, '2 line items priced at ₱0.00'), JSON.stringify(zero.issues.map(i => i.msg)));
check('lists the offenders as a hint', zero.issues.some(i => (i.hint || '').indexOf('CHAIN BLOCK 1T') >= 0));

/* A highlighted cost whose linked source was deleted. */
const dang = run({
  grand: 250000,
  info: { client: 'P', description: 'x', qty: '1' },
  sowItems: [{ id: 't1' }], margin: 10, approvers: [{ name: 'A' }],
  addlCosts: [{ label: 'DELIVERY', src: 'miscRow:transportation:gone' }],
  hlSources: [{ k: 'calc:unit' }],
});
console.log('\nhighlighted cost pointing at a deleted item:');
check('is flagged as an error', dang.errs === 1 && has(dang, 'no longer exists'), JSON.stringify(dang.issues.map(i => i.msg)));

/* A manual highlighted cost must NOT be treated as dangling. */
const manual = run({
  grand: 250000,
  info: { client: 'P', description: 'x', qty: '1' },
  sowItems: [{ id: 't1' }], margin: 10, approvers: [{ name: 'A' }],
  addlCosts: [{ label: 'PICKUP', src: 'manual', amount: 5000 }],
  hlSources: [{ k: 'calc:unit' }],
});
check('a manual highlighted cost is not flagged', manual.clean, JSON.stringify(manual.issues.map(i => i.msg)));

/* Blank quantity falls back to 1 for the unit price. */
const noQty = run({
  grand: 250000,
  info: { client: 'P', description: 'x' },
  sowItems: [{ id: 't1' }], margin: 10, approvers: [{ name: 'A' }],
});
console.log('\nblank quantity:');
check('is flagged for review', has(noQty, 'Quantity is blank'), JSON.stringify(noQty.issues.map(i => i.msg)));

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall pre-flight assertions passed');
process.exit(fails ? 1 : 0);
