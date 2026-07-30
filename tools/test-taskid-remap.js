/*
 * Exercises the REAL taskId remap code lifted out of src/App.js (not a copy),
 * proving SOW Breakdown assignments survive a save -> load round-trip where
 * every row id is regenerated.
 */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

/* Pull the three remap lines straight out of the source. */
const grab = re => { const m = src.match(re); if (!m) { console.error('could not find in source: ' + re); process.exit(1); } return m[0]; };
const lineMap = grab(/const _sowMap = \{\};/);
const lineSow = grab(/const _sow = \(d\.sowItems \|\| \[\]\)\.map\(s => \{[^\n]*\);/);
const lineRt  = grab(/const _rt = r => \(\{[^\n]*\}\);/);

let n = 0;
const uid = () => 'new' + (++n);

const d = {
  sowItems: [
    { id: 'old-t1', type: 'main', text: 'Pick-up of IDF Rotor from Petron-Bataan' },
    { id: 'old-t2', type: 'sub',  text: 'Conduct As Found Photo/Visual Inspection' },
  ],
  mp: [
    { id: 'old-m1', role: 'BALANCING SUPERVISOR', pax: 1, taskId: 'old-t1' },
    { id: 'old-m2', role: 'TRADE ASSISTANT',      pax: 2, taskId: 'old-t2' },
    { id: 'old-m3', role: 'FLOATING CREW',        pax: 1 },                     // unassigned
    { id: 'old-m4', role: 'GHOST',                pax: 1, taskId: 'deleted-task' }, // dangling
  ],
};

const run = new Function('d', 'uid', `
  ${lineMap}
  ${lineSow}
  ${lineRt}
  return { sow: _sow, mp: (d.mp||[]).map(_rt) };
`);

const out = run(d, uid);

let fails = 0;
const check = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); fails++; }
};

console.log('taskId remap on load:');
check('scope task ids are regenerated',
  out.sow[0].id !== 'old-t1' && out.sow[1].id !== 'old-t2',
  JSON.stringify(out.sow.map(s => s.id)));
check('task text preserved', out.sow[0].text.startsWith('Pick-up'));
check('row assigned to task 1 follows it',
  out.mp[0].taskId === out.sow[0].id,
  out.mp[0].taskId + ' vs ' + out.sow[0].id);
check('row assigned to task 2 follows it',
  out.mp[1].taskId === out.sow[1].id,
  out.mp[1].taskId + ' vs ' + out.sow[1].id);
check('unassigned row stays unassigned', out.mp[2].taskId === '', JSON.stringify(out.mp[2].taskId));
check('dangling taskId is cleared, not left orphaned', out.mp[3].taskId === '', JSON.stringify(out.mp[3].taskId));
check('row payload preserved (role/pax)', out.mp[1].role === 'TRADE ASSISTANT' && out.mp[1].pax === 2);
check('no row keeps its old id', out.mp.every(r => !String(r.id).startsWith('old-')));

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall remap assertions passed');
process.exit(fails ? 1 : 0);
