#!/usr/bin/env node
/* A status change must survive going to another tab and back. Two ways it
   did not: the CE had two rows in the Monitoring list, so the table read one
   and the save wrote the other; and a list fetch already in flight came back
   holding the row from before the change and replaced the table with it.
   Run: node tools/test-status-sticks.js */
'use strict';
const fs = require('fs');
const db = fs.readFileSync('src/db.js', 'utf8');
const app = fs.readFileSync('src/App.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

/* ---- one CE, one row ---- */
const getMon = db.slice(db.indexOf('async function dbGetMon'), db.indexOf('async function dbGetMon') + 1600);
ck('the table takes the newest row when a CE has more than one',
  getMon.includes('if(seen[cid]!=null){dups++;if(item.Id<seen[cid])continue;}'));
ck('and says so rather than picking one quietly', getMon.includes("' duplicate monitoring row(s); the newest of each is used'"));
const save = db.slice(db.indexOf('async function dbSaveMonEntry'), db.indexOf('async function dbSaveMonEntry') + 2600);
ck('the save takes that same row', save.includes('const sorted=r.slice().sort((a,b)=>b.Id-a.Id);') && save.includes('spId=sorted[0].Id;'));
ck('reads it before merging into it', save.includes('theirs=sorted[0].shicMonData?JSON.parse(sorted[0].shicMonData):null;'));
ck('and writes the older copies too, so they cannot disagree',
  save.includes('alsoWrite=sorted.slice(1).map(x=>x.Id);') &&
  save.includes('for(const other of alsoWrite){'));
ck('a row is always read before it is written, cached id or not',
  save.includes("if(!spId||(changed&&changed!=='ensure'&&changed.length)){"));

/* The picking rule itself. */
const pick = new Function('rows', `
  const seen={},data={};let dups=0;
  for(const item of rows){
    const cid=String(item.shicCEId);
    if(cid&&cid!=='null'&&cid!=='0'&&item.shicMonData){
      if(seen[cid]!=null){dups++;if(item.Id<seen[cid])continue;}
      seen[cid]=item.Id;
      data[cid]=JSON.parse(item.shicMonData);
    }
  }
  return {data,dups,seen};`);
let got = pick([
  { Id: 4, shicCEId: 7, shicMonData: '{"status":"Draft"}' },
  { Id: 9, shicCEId: 7, shicMonData: '{"status":"Superseded"}' },
  { Id: 5, shicCEId: 8, shicMonData: '{"status":"Ongoing"}' }
]);
ck('so the newer of two rows is what the table shows', got.data['7'].status === 'Superseded');
ck('whichever order they arrive in',
  pick([{ Id: 9, shicCEId: 7, shicMonData: '{"status":"Superseded"}' },
        { Id: 4, shicCEId: 7, shicMonData: '{"status":"Draft"}' }]).data['7'].status === 'Superseded');
ck('a CE with one row is untouched', got.data['8'].status === 'Ongoing' && got.dups === 1);
ck('and the id the save will use is the same one', got.seen['7'] === 9);

/* ---- a fetch that started before the change ---- */
ck('every change here is remembered with the moment it was made',
  app.includes('_monWroteAt.current[ceId] = { at: Date.now(), row: n[ceId] };'));
ck('a fetch knows when it started', app.includes('const _fetchAt = Date.now();'));
ck('and keeps a row changed since then', app.includes('if (mine[id] && mine[id].at >= _fetchAt) { out[id] = mine[id].row; kept++; }'));
ck('rather than replacing the table with what it holds', app.includes('r = {...r, data: _keepMine(r.data)};'));
ck('and it says when it did so', app.includes("'monitoring: kept ' + kept + ' row(s) changed here while the list was loading'"));

const keep = new Function('mine', 'incoming', 'fetchAt', `
  const _fetchAt = fetchAt, out = {...incoming}; let kept = 0;
  Object.keys(mine).forEach(id => { if (mine[id] && mine[id].at >= _fetchAt) { out[id] = mine[id].row; kept++; } });
  return {out, kept};`);
got = keep({ 7: { at: 100, row: { status: 'Superseded' } }, 8: { at: 10, row: { status: 'stale' } } },
  { 7: { status: 'Draft' }, 8: { status: 'Ongoing' }, 9: { status: 'Awarded' } }, 50);
ck('the change made during the fetch stands', got.out['7'].status === 'Superseded');
ck('an older change is left to the site, which now has it', got.out['8'].status === 'Ongoing');
ck('everything else comes straight from the site', got.out['9'].status === 'Awarded' && got.kept === 1);

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nstatus survives a reload OK'); process.exit(bad ? 1 : 0);
