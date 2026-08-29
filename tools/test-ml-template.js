#!/usr/bin/env node
/*
 * The masterlist template must speak the app's own vocabulary.
 *
 * downloadMLTemplate wrote the raw field KEYS as its header row -- code,
 * category, role, rate, perDiem, uom -- while the labels the app shows sat in
 * colL a few lines above it. So the column stayed "perDiem" in every exported
 * template long after it was renamed to Incentive everywhere else.
 *
 * The template now writes colL, which means the two lists must stay aligned
 * (a mismatch shifts every column) and every label must map back to its own
 * field key on import, or a template downloaded and re-imported unchanged
 * would lose data.
 *
 * Older templates carrying the raw keys, and workbooks still saying "Per Diem",
 * must keep importing -- there are plenty of both in circulation.
 *
 * Run: node tools/test-ml-template.js
 */
const fs=require('fs');
const src=fs.readFileSync('src/App.js','utf8');
const norm=eval('('+src.match(/const norm = h => String\(h\)[^;]*;/)[0].replace(/^const norm = /,'').replace(/;$/,'')+')');
const HEADER_KEY=eval('('+src.match(/const HEADER_KEY = \{[\s\S]*?\n        \};/)[0].replace(/^const HEADER_KEY = /,'').replace(/;$/,'')+')');
const colL=eval('('+src.match(/const colL = \{[\s\S]*?\n    \};/)[0].replace(/^const colL = /,'').replace(/;$/,'')+')');
const colMap=eval('('+src.match(/const colMap = \{[\s\S]*?\n      \};/)[0].replace(/^const colMap = /,'').replace(/;$/,'')+')');

let bad=0; const ck=(n,c,x)=>{ if(c)console.log('  PASS  '+n); else {console.log('  FAIL  '+n+(x?'  -> '+x:''));bad++;} };

console.log('the template header row and the field keys line up:');
for(const tab of Object.keys(colMap)){
  ck(tab+': '+colL[tab].length+' labels for '+colMap[tab].length+' keys', colL[tab].length===colMap[tab].length,
     'a mismatch shifts every column in the exported template');
}
console.log('\nevery label the template writes maps back to its own key:');
for(const tab of Object.keys(colMap)){
  colL[tab].forEach((label,i)=>{
    const want=colMap[tab][i], got=HEADER_KEY[norm(label)];
    ck(tab+': "'+label+'" -> '+got, got===want, 'expected '+want+', norm="'+norm(label)+'"');
  });
}
console.log('\nold templates still import:');
[['perDiem','perDiem'],['Per Diem','perDiem'],['PER DIEM','perDiem'],['code','code'],['role','role'],['rate','rate'],['uom','uom'],['desc','desc']]
  .forEach(([h,want])=>ck('"'+h+'" -> '+HEADER_KEY[norm(h)], HEADER_KEY[norm(h)]===want));
console.log('\nand nothing maps to the old name:');
ck('no header resolves to a field called incentive', !Object.values(HEADER_KEY).includes('incentive'),
   'storage still calls it perDiem; only the LABEL changed');
console.log(bad?'\n'+bad+' FAILURE(S)':'\nmasterlist template round-trip OK');
process.exit(bad?1:0);
