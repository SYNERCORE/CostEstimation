/* Each CE Defaults preset folds to one line; added and copied ones open.
   Run: node tools/test-ce-defaults-fold.js */
'use strict';
const fs = require('fs'), path = require('path');
const s = fs.readFileSync(path.join(__dirname, '..', 'src/components/CeDefaultsPanel.js'), 'utf8').replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('it parses', (() => { try { new Function(s); return true; } catch (e) { console.log(e.message); return false; } })());
ck('all presets start folded', s.indexOf('React.useState(() => new Set())') > 0);
ck('a toggle on the header and on its title', s.indexOf("onClick: () => setOpen(k, !open)") > 0 && (s.match(/setOpen\(k, !open\)/g) || []).length >= 2);
ck('the folded line says the pairing and how much is in it', s.indexOf("' note' : ' notes'") > 0 && s.indexOf("' signatory' : ' signatories'") > 0);
ck('Duplicate and Remove stay on the folded line', s.indexOf("'Duplicate'") > 0 && s.indexOf("'Remove'") > 0 && s.indexOf("'Duplicate'") < s.indexOf("open && React.createElement('label', {style: LBL}, 'Notes')"));
ck('the body only draws when open', ["open && React.createElement('label', {style: LBL}, 'Notes')", "open && (p.notes || []).map(", "open && React.createElement('label', {style: LBL}, 'Signatories')", "open && (p.approvers || []).map("].every(k => s.indexOf(k) > 0));
ck('a new or copied preset opens', s.indexOf('setOpen(nid, true)') > 0 && s.indexOf('setOpen(copy.id, true)') > 0);
ck('Open all and Fold all', s.indexOf("'Open all'") > 0 && s.indexOf("'Fold all'") > 0);
ck('the old inline Duplicate and Remove are gone (one of each)', (s.match(/'Duplicate'/g) || []).length === 1 && (s.match(/'Remove'/g) || []).length === 1);
process.exit(bad ? 1 : 0);
