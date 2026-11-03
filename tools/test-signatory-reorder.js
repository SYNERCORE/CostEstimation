/* Signatory cards can be reordered by drag and drop or by the arrow buttons.
   Run: node tools/test-signatory-reorder.js */
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src/components/SummaryTab.js'), 'utf8').replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const a = src.indexOf('function moveSignatory('), b = src.indexOf('function SummaryTab(');
ck('moveSignatory is defined before SummaryTab', a >= 0 && b > a);
const move = new Function(src.slice(a, b) + '\nreturn moveSignatory;')();
const L = [{ name: 'A', user: 'a' }, { name: 'B', user: 'b', step: 1 }, { name: 'C' }, { name: 'D', user: 'd' }];
const r = move(L, 3, 0);
ck('a card moves to the dropped slot', r.map(x => x.name).join('') === 'DABC');
ck('a linked line with no step keeps the step its old position gave it', r[0].step === 4 && r[1].step === 1);
ck('a typed step is kept and a hand-signed line gets none', r[2].step === 1 && r[3].step === undefined);
ck('moving does not change the original list', L[0].step === undefined && L.map(x => x.name).join('') === 'ABCD');
ck('same slot or out of range changes nothing', move(L, 1, 1) === L && move(L, 0, 9) === L && move(L, -1, 0) === L);
ck('the card is dragged by its grip and dropped on another card', src.includes("draggable: true, className: 'sig-grip'") && src.includes("setData('text/x-signatory'") && src.includes('onDrop: apvLocked ? undefined'));
ck('arrow buttons move a card one place', src.includes('moveSignatory(p, i, i - 1)') && src.includes('moveSignatory(p, i, i + 1)'));
ck('it is off while the CE is out for approval or approved', src.includes('!apvLocked && approvers.length > 1') && src.includes('onDragOver: apvLocked ? undefined'));
process.exit(bad ? 1 : 0);
