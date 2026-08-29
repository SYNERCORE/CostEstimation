#!/usr/bin/env node
/*
 * The two Status fields must describe the same CE.
 *
 * Project Info carries a DOCUMENT state (DRAFT / FOR REVIEW / APPROVED /
 * REJECTED / REVISED) that prints on the estimate. Monitoring carries a
 * PIPELINE state (Pending, Ongoing, Submitted, ...) that drives Open CEs, the
 * dashboard donut and the filters. They shared no values at all -- the same CE
 * could print APPROVED and read Cancelled in Monitoring.
 *
 * config.js now maps between them. This checks that mapping stays sane:
 *   - every document state reaches a pipeline status that is SELECTABLE
 *     ('No Quote' and 'Draft' were referenced by the app's logic for months
 *     without being in the dropdown, which is how this started)
 *   - every document state round-trips: doc -> pipeline -> the same doc, so
 *     picking one on the Project Info tab does not silently become another
 *   - nothing maps to a state that does not exist on the other side
 *
 * A pipeline status with no document equivalent is fine and is reported: it
 * deliberately leaves the printed state alone rather than misrepresenting it.
 *
 * Run: node tools/check-status-sync.js
 */
const fs=require('fs');
const sandbox={};
new Function('g','with(g){'+fs.readFileSync('src/config.js','utf8')+'\ng.CE_DOC_STATUSES=CE_DOC_STATUSES;g.DOC_TO_MON=DOC_TO_MON;g.MON_TO_DOC=MON_TO_DOC;g.DEFAULT_STATUS_OPTIONS=DEFAULT_STATUS_OPTIONS;}')(sandbox);
const {CE_DOC_STATUSES:DOC,DOC_TO_MON:D2M,MON_TO_DOC:M2D,DEFAULT_STATUS_OPTIONS:OPT}=sandbox;
let bad=0;
DOC.forEach(d=>{const m=D2M[d];
  if(!m){console.log('FAIL no pipeline for',d);bad++;return;}
  if(OPT.indexOf(m)<0){console.log('FAIL',d,'->',m,'not selectable');bad++;}
  if(M2D[m]!==d){console.log('FAIL round trip',d,'->',m,'->',M2D[m]);bad++;}});
Object.keys(M2D).forEach(m=>{
  if(OPT.indexOf(m)<0){console.log('FAIL',m,'maps back but is not selectable');bad++;}
  if(DOC.indexOf(M2D[m])<0){console.log('FAIL',m,'->',M2D[m],'not a document state');bad++;}});
console.log('document states :',DOC.join(', '));
console.log('doc -> pipeline :',DOC.map(d=>d+' -> '+D2M[d]).join('  |  '));
console.log('no doc equivalent (left alone):',OPT.filter(o=>!M2D[o]).join(', ')||'(none)');
console.log(bad?bad+' PROBLEM(S)':'mapping tables are consistent');
process.exit(bad?1:0);
