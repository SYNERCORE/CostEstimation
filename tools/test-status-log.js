#!/usr/bin/env node
/*
 * Every status change is recorded, with who and when.
 *
 * statusChangedAt/By held only the MOST RECENT change, so the previous one was
 * overwritten the moment the next landed -- "who moved this to Submitted, and
 * when did it leave For Approval" had no answer. updateMon now appends to a
 * statusLog, and the Status action opens a panel showing the trail.
 *
 * What has to hold:
 *   - every change is appended, in order, with who, when, and what it moved
 *     from
 *   - clearing the status back to blank is not logged: nothing to attribute
 *   - a non-status field never touches the log
 *   - the log is capped, so a CE toggled daily for years cannot grow an
 *     unbounded column in a SharePoint list already at its size limits
 *   - the cap drops the OLDEST, since the recent entries are the ones anyone
 *     asks about
 *
 * Run: node tools/test-status-log.js
 */
const fs=require('fs');
const src=fs.readFileSync('src/App.js','utf8');
const body=src.match(/const updateMon = \(ceId, field, val\) => setMonData\(prev => \{[\s\S]*?return n;\s*\}\);/)[0];
const currentUser={name:'Jhuniel Ubana'};
let saved=null;
const dbSaveMonEntry=(a,b,c)=>{saved=c;return{then:()=>({catch:()=>{}})};};
const LS={}, MON_KEY='k', localStorage={setItem:()=>{}};
const history=[{id:7,info:{ceNum:'CE-1'}}];
const setSyncStatus=()=>{};
let state={};
const setMonData=fn=>{state=fn(state);};
const upd=new Function('setMonData','currentUser','dbSaveMonEntry','localStorage','MON_KEY','history','setSyncStatus',
  'return '+body.replace(/^const updateMon = /,'').replace(/;$/,''))
  (setMonData,currentUser,dbSaveMonEntry,localStorage,MON_KEY,history,setSyncStatus);

let bad=0; const ck=(n,c,x)=>{ if(c)console.log('  PASS  '+n); else {console.log('  FAIL  '+n+(x?'  -> '+x:''));bad++;} };
upd(7,'status','Pending');
upd(7,'status','For Approval');
upd(7,'status','Submitted');
const log=state[7].statusLog;
ck('every change is kept, not just the last', log.length===3, 'got '+log.length);
ck('in the order they happened', log.map(x=>x.status).join(' > ')==='Pending > For Approval > Submitted');
ck('each records who', log.every(x=>x.by==='Jhuniel Ubana'));
ck('and when', log.every(x=>!isNaN(new Date(x.at))));
ck('and what it moved from', log[1].from==='Pending' && log[2].from==='For Approval');
ck('the first has no "from"', log[0].from==='');
ck('the latest stamp still matches the last entry', state[7].statusChangedAt===log[2].at);
upd(7,'deadline','2026-09-01');
ck('a non-status field does not touch the log', state[7].statusLog.length===3);
upd(7,'status','');
ck('clearing the status is not logged', state[7].statusLog.length===3,
   'there is nothing to attribute');
for(let i=0;i<80;i++) upd(7,'status','Ongoing'+i);
ck('the log is capped so a busy CE cannot grow without bound', state[7].statusLog.length===60,
   'got '+state[7].statusLog.length);
ck('and the cap drops the oldest, keeping the recent ones',
   state[7].statusLog[59].status==='Ongoing79');
ck('it is persisted with the rest of the monitoring record', saved && Array.isArray(saved.statusLog));
console.log(bad?'\n'+bad+' FAILURE(S)':'\nstatus log OK');
process.exit(bad?1:0);
