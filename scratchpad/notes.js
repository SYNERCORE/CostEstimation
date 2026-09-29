/* Renders the SHIPPED notesList expression and the SHIPPED print stylesheet,
   so what appears is what the CE prints -- not a mock-up of it. */
const fs=require('fs');
const app=fs.readFileSync('src/App.js','utf8');
const line=app.split('\n').find(l=>l.indexOf('const notesList =')>=0);
const css=(app.match(/\.nw\{white-space:nowrap\}[^`"']*/)||[''])[0];
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const notes=[
 {text:'Price is valid for fifteen (15) days from the date of this estimate.',imp:true},
 {text:'Any additional scope not stated above is not included in this CE.'},
 {text:'Client to provide scaffolding, power supply and a safe work permit.'},
 {text:'Delivery of the P91 spool is 8-10 weeks ex-works. Any commitment shorter than this must be confirmed with TSG before it is quoted to the client.',imp:true},
 {text:'Prices exclude VAT.'}];
const sowNotes=[{id:'s1',note:'Hydro test at 1.5x design pressure.'}];
const sowLabels={s1:'1.2'};
const notesList=new Function('notes','sowNotes','sowLabels','esc',line+'\nreturn notesList;')(notes,sowNotes,sowLabels,esc);
fs.writeFileSync('scratchpad/notes.html',
 '<!doctype html><meta charset="utf-8"><style>body{font-family:Arial;font-size:9pt;background:#fff;color:#000;padding:18px;width:620px}'+
 css+'</style><div style="border:1px solid #999;padding:10px">'+notesList+'</div>');
console.log('css rule used:', css);
