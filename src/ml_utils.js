
function shicMLToggle(){var p=document.getElementById('shic-ml-panel');if(p)p.style.display=p.style.display==='none'||!p.style.display?'block':'none';}
function ph2(n){return 'P'+Number(n).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});}
function _esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function shicMLRate(){
  var role=document.getElementById('ml-role-input').value.trim();
  if(!role)return;
  var res=window.SHIC_ML&&window.SHIC_ML.suggestRates(role);
  var el=document.getElementById('ml-rate-result');
  if(!res){el.innerHTML='<span style="color:#F59E0B">No historical data for this role yet. Analyze some project files first.</span>';return;}
  el.innerHTML='<div style="background:#0D1117;border-radius:6px;padding:8px;margin-top:4px">'
    +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:6px">'
    +'<div style="text-align:center"><div style="color:#7D8590;font-size:10px">AVG</div><div style="color:#F0A429;font-weight:700;font-size:13px">'+ph2(res.avg)+'</div></div>'
    +'<div style="text-align:center"><div style="color:#7D8590;font-size:10px">LATEST</div><div style="color:#10B981;font-weight:700;font-size:13px">'+ph2(res.latest)+'</div></div>'
    +'<div style="text-align:center"><div style="color:#7D8590;font-size:10px">RANGE</div><div style="font-size:10px">'+ph2(res.min)+' - '+ph2(res.max)+'</div></div>'
    +'</div><div style="color:#7D8590;font-size:10px">From '+res.count+' record(s):<br>'
    +res.samples.map(function(s){return _esc(s.ceNum||'?')+': '+ph2(s.rate);}).join(' &bull; ')+'</div></div>';
}
function shicMLPredict(){
  var scope=document.getElementById('ml-scope-input').value.trim();
  if(!scope)return;
  var res=window.SHIC_ML&&window.SHIC_ML.predictCost(scope);
  var el=document.getElementById('ml-predict-result');
  if(!res||!res.count){el.innerHTML='<span style="color:#F59E0B">Analyze more project files to enable cost prediction.</span>';return;}
  var cc=res.confidence>70?'#10B981':res.confidence>40?'#F59E0B':'#EF4444';
  el.innerHTML='<div style="background:#0D1117;border-radius:6px;padding:8px;margin-top:4px">'
    +'<div style="font-size:18px;font-weight:800;color:#F0A429">'+ph2(res.predicted)+'</div>'
    +'<div style="display:flex;align-items:center;gap:8px;margin:4px 0"><div style="background:#1C2128;border-radius:8px;height:5px;flex:1"><div style="background:'+cc+';height:5px;border-radius:8px;width:'+res.confidence+'%"></div></div>'
    +'<span style="color:'+cc+';font-weight:700;font-size:10px">'+res.confidence+'% confidence</span></div>'
    +res.topMatches.map(function(m){return '<div style="color:#7D8590;font-size:10px;margin-top:2px">- '+_esc(m.ceNum||m.source||'?')+': '+ph2(m.grand)+'</div>';}).join('')+'</div>';
}
function shicMLMatch(){
  var scope=document.getElementById('ml-match-input').value.trim();
  if(!scope)return;
  var results=window.SHIC_ML&&window.SHIC_ML.matchScope(scope,5);
  var el=document.getElementById('ml-match-result');
  if(!results||!results.length){el.innerHTML='<span style="color:#F59E0B">No matching projects found yet.</span>';return;}
  el.innerHTML=results.map(function(m){
    return '<div style="background:#0D1117;border-radius:6px;padding:8px;margin-top:6px;border-left:3px solid #8B5CF6">'
      +'<div style="display:flex;justify-content:space-between"><span style="font-weight:700;color:#8B5CF6">'+_esc(m.ceNum||m.source||'Unknown')+'</span><span style="font-size:10px;color:#7D8590">'+Math.round(m.sim*100)+'% match</span></div>'
      +(m.description?'<div style="font-size:11px;margin:3px 0">'+_esc(m.description)+'</div>':'')
      +'<div style="color:#F0A429;font-size:11px;font-weight:700">'+ph2(m.grand)+'</div>'
      +(m.mp&&m.mp.length?'<div style="color:#7D8590;font-size:10px">Workers: '+m.mp.slice(0,3).map(function(r){return _esc(typeof r==='string'?r:r.role||'');}).join(', ')+'</div>':'')
      +'</div>';
  }).join('');
}
function shicMLAnomalies(){
  var mp=window.shicCurrentMp||[];
  var anomalies=window.SHIC_ML&&window.SHIC_ML.detectAnomalies(mp,[],[],window.shicMasterlist);
  var el=document.getElementById('ml-anomaly-result');
  if(!anomalies||!anomalies.length){el.innerHTML='<div style="color:#10B981;font-weight:700">No anomalies detected. Rates look normal.</div>';return;}
  el.innerHTML=anomalies.map(function(a){
    return '<div style="background:#EF444411;border:1px solid #EF444433;border-radius:6px;padding:8px;margin-top:6px">'
      +'<div style="color:#EF4444;font-weight:700;font-size:11px">'+(a.type==='rate_high'?'High Rate':'Low Rate')+'</div>'
      +'<div style="font-size:11px;margin:2px 0">'+_esc(a.item)+'</div>'
      +'<div style="color:#7D8590;font-size:10px">Yours: '+ph2(a.value)+' | Expected: '+ph2(a.expected)+'</div></div>';
  }).join('');
}













window.SHIC_OD=(function(){
  var msalApp=null;var OD_CFG_KEY='shic_od_config';
  function getODConfig(){try{var v=localStorage.getItem(OD_CFG_KEY);return v?JSON.parse(v):null;}catch(e){return null;}}
  function saveODConfig(cfg){try{localStorage.setItem(OD_CFG_KEY,JSON.stringify(cfg));}catch(e){}}
  function initMSAL(clientId,tenantId){var authority='https://login.microsoftonline.com/'+(tenantId||'common');msalApp=new msal.PublicClientApplication({auth:{clientId:clientId,authority:authority,redirectUri:window.location.origin+window.location.pathname},cache:{cacheLocation:'localStorage',storeAuthStateInCookie:false}});return msalApp;}
  async function getToken(){if(!msalApp)throw new Error('MSAL not initialized');var scopes=['Files.Read','Files.Read.All'];var accounts=msalApp.getAllAccounts();try{var r=await msalApp.acquireTokenSilent({scopes:scopes,account:accounts[0]});return r.accessToken;}catch(e){var r=await msalApp.acquireTokenPopup({scopes:scopes});return r.accessToken;}}
  async function graphGet(path,token){var r=await fetch('https://graph.microsoft.com/v1.0'+path,{headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'}});if(!r.ok)throw new Error('Graph '+r.status);return r.json();}
  async function downloadFile(url,token){var r=await fetch(url,{headers:{'Authorization':'Bearer '+token}});if(!r.ok)throw new Error('Download failed '+r.status);return r.arrayBuffer();}
  async function listExcelFiles(folder,token){var encoded=encodeURIComponent(folder).replace(/%2F/g,'/');var ep=folder==='/'||folder===''?'/me/drive/root/children':'/me/drive/root:/'+encoded+':/children';var d=await graphGet(ep+'?$top=200&$select=id,name,@microsoft.graph.downloadUrl,file',token);return(d.value||[]).filter(function(f){return f.file&&(f.name.endsWith('.xlsx')||f.name.endsWith('.xls'));});}
  function parseExcelFile(buf,name){try{var wb=XLSX.read(buf,{type:'array'});var projects=[];wb.SheetNames.forEach(function(sn){var rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:''});if(rows.length<2)return;var p=extractProjectData(rows,sn,name);if(p)projects.push(p);});return{fileName:name,projects:projects};}catch(e){return{fileName:name,projects:[]};}}
  function cleanNum(v){if(typeof v==='number')return v;var s=String(v).replace(/[^0-9.-]/g,'');return parseFloat(s)||0;}
  function findRow(rows,kws){for(var i=0;i<rows.length;i++){var rs=rows[i].join(' ').toLowerCase();for(var k=0;k<kws.length;k++){if(rs.includes(kws[k]))return i;}}return-1;}
  function extractProjectData(rows,sheet,file){var p={source:file+'>'+sheet,description:'',client:'',ceNum:'',grand:0,mp:[],tools:[],mats:[],ceType:'onsite',savedAt:new Date().toISOString()};var text=rows.map(function(r){return r.join(' ');}).join(' ').toLowerCase();var cm=text.match(/([a-z]{2,6}-ce-\d{4}-\d{4})/i);if(cm)p.ceNum=cm[1];var di=findRow(rows,['project title','description','scope','job title']);if(di>=0){for(var c=0;c<rows[di].length;c++){var v=String(rows[di][c]).trim();if(v&&v.length>10&&!v.toLowerCase().includes('description')){p.description=v;break;}}}var ti=findRow(rows,['grand total','total amount','total cost']);if(ti>=0){var mx=0;rows[ti].forEach(function(c){var n=cleanNum(c);if(n>mx)mx=n;});if(mx>0)p.grand=mx;}if(!p.grand){var mx=0;rows.forEach(function(r){r.forEach(function(c){var n=cleanNum(c);if(n>1000&&n>mx)mx=n;});});p.grand=mx;}if(!p.description&&!p.grand)return null;if(!p.description)p.description=sheet+'('+file+')';return p;}
  async function scanFolder(folder,cb){var cfg=getODConfig();if(!cfg||!cfg.clientId)throw new Error('OneDrive not configured');if(!msalApp)initMSAL(cfg.clientId,cfg.tenantId);cb&&cb({step:'auth',msg:'Signing in...',progress:0});var token=await getToken();cb&&cb({step:'list',msg:'Listing files...',progress:0.05});var files=await listExcelFiles(folder||cfg.folderPath||'/',token);if(!files.length)throw new Error('No Excel files found in that folder');var all=[];for(var i=0;i<files.length;i++){var f=files[i];cb&&cb({step:'parse',msg:'Parsing '+f.name+' ('+(i+1)+'/'+files.length+')',progress:(i+1)/files.length});try{var url=f['@microsoft.graph.downloadUrl'];if(!url)continue;var buf=await downloadFile(url,token);var parsed=parseExcelFile(buf,f.name);parsed.projects.forEach(function(p){all.push(p);});}catch(e){console.warn('Parse failed:',f.name,e.message);}}window.shicODHistory=all;window.shicHistory=(window.shicHistory||[]).concat(all);try{localStorage.setItem('shic:od_history',JSON.stringify(all));}catch(e){}cb&&cb({step:'done',msg:'Done!',progress:1});return{projects:all,files:files.length};}
  (function(){try{var c=localStorage.getItem('shic:od_history');if(c){var d=JSON.parse(c);window.shicODHistory=d;setTimeout(function(){window.shicHistory=(window.shicHistory||[]).concat(d);},3000);}}catch(e){}})();
  return{initMSAL:initMSAL,scanFolder:scanFolder,getODConfig:getODConfig,saveODConfig:saveODConfig};
})();











function switchAnalyzerTab(t){document.getElementById('analyzer-local').style.display=t==='local'?'block':'none';document.getElementById('analyzer-od').style.display=t==='od'?'block':'none';document.getElementById('tab-local').style.background=t==='local'?'#30363D':'transparent';document.getElementById('tab-local').style.color=t==='local'?'#E6EDF3':'#7D8590';document.getElementById('tab-od').style.background=t==='od'?'#30363D':'transparent';document.getElementById('tab-od').style.color=t==='od'?'#E6EDF3':'#7D8590';}
var _localFiles=[];
function localFilesSelected(files){
  _localFiles=Array.from(files).filter(function(f){return /\.(xlsx|xls|pdf|docx|doc)$/i.test(f.name);});
  var cE=document.getElementById('local-file-count');
  var nE=document.getElementById('local-file-names');
  var lE=document.getElementById('local-file-list');
  var btn=document.getElementById('local-analyze-btn');
  if(!_localFiles.length){cE.textContent='No supported files found.';lE.style.display='block';btn.disabled=true;btn.style.background='#30363D';btn.style.color='#7D8590';btn.style.cursor='not-allowed';return;}
  var bT={xlsx:0,pdf:0,docx:0};
  _localFiles.forEach(function(f){if(/\.xlsx?$/i.test(f.name))bT.xlsx++;else if(/\.pdf$/i.test(f.name))bT.pdf++;else if(/\.docx?$/i.test(f.name))bT.docx++;});
  var p=[];if(bT.xlsx)p.push(bT.xlsx+' Excel');if(bT.pdf)p.push(bT.pdf+' PDF');if(bT.docx)p.push(bT.docx+' Word');
  cE.textContent=_localFiles.length+' files: '+p.join(', ');
  nE.innerHTML=_localFiles.slice(0,15).map(function(f){return '<div>'+_esc(f.name)+'</div>';}).join('');
  if(_localFiles.length>15)nE.innerHTML+='<div>...and '+(_localFiles.length-15)+' more</div>';
  lE.style.display='block';
  btn.disabled=false;btn.style.background='#F0A429';btn.style.color='#000';btn.style.cursor='pointer';
}
function ph3(n){return 'P'+Number(n).toLocaleString('en-PH',{minimumFractionDigits:0,maximumFractionDigits:0});}
function cleanNum3(v){if(typeof v==='number')return v;var s=String(v).replace(/[^0-9.]/g,'');return parseFloat(s)||0;}
function extractFromText(text,src){
  var p={source:src,description:'',client:'',ceNum:'',grand:0,mp:[],tools:[],mats:[],ceType:'onsite',savedAt:new Date().toISOString()};
  var cm=text.match(/([A-Z]{2,6}-CE-\d{4}-\d{3,4})/i);if(cm)p.ceNum=cm[1];
  var amounts=[];var rx=/(?:grand\s*total|total\s*amount|total\s*cost)[^\d]*([\d,]+(?:\.\d{2})?)/gi;
  var m;while((m=rx.exec(text))!==null)amounts.push(cleanNum3(m[1]));
  if(!amounts.length){var rx2=/(?:PHP|PhP|P)\s?([\d,]{4,}(?:\.\d{2})?)/g;while((m=rx2.exec(text))!==null)amounts.push(cleanNum3(m[1]));}
  if(amounts.length)p.grand=Math.max.apply(null,amounts);
  var lines=text.split(/[\n\r]+/).map(function(l){return l.trim();}).filter(function(l){return l.length>20&&l.length<200;});
  if(lines.length)p.description=lines[0].slice(0,120);
  var cM=text.match(/(?:client|customer|owner)[:\s]+([A-Z][^\n\r]{3,50})/i);
  if(cM)p.client=cM[1].trim().slice(0,60);
  var mpRx=/([A-Za-z ]{4,30})\s+(?:PHP|P|PhP)?\s?([\d,]+(?:\.\d{2})?)\s*(?:\/day|\/hr|per day)/gi;
  while((m=mpRx.exec(text))!==null&&p.mp.length<10){var rate=cleanNum3(m[2]);if(rate>100&&rate<200000)p.mp.push({role:m[1].trim(),rate:rate,shift:'straight',days:1,qty:1});}
  if(!p.description)p.description=src.replace(/\.[^.]+$/,'');
  return(p.grand>0||p.mp.length>0||p.ceNum)?p:null;
}
function extractFromRows(rows,src){
  var text=rows.map(function(r){return r.join(' ');}).join('\n');
  var p=extractFromText(text,src)||{source:src,description:src,client:'',ceNum:'',grand:0,mp:[],mats:[],tools:[],ceType:'onsite',savedAt:new Date().toISOString()};
  if(!p.mp.length){
    for(var i=0;i<rows.length;i++){
      if(rows[i].join(' ').toLowerCase().match(/manpower|labor|personnel/)){
        for(var j=i+1;j<Math.min(i+30,rows.length);j++){
          var role=String(rows[j][0]||'').trim();var rate=0;
          for(var k=1;k<rows[j].length;k++){var n=cleanNum3(rows[j][k]);if(n>100&&n<200000){rate=n;break;}}
          if(role&&role.length>1&&role.length<50&&!role.toLowerCase().includes('total'))p.mp.push({role:role,rate:rate,shift:'straight',days:1,qty:1});
        }break;
      }
    }
  }
  return(p.grand>0||p.mp.length>0)?p:null;
}
async function parseLocalFile(file){
  var n=file.name.toLowerCase();
  if(/\.xlsx?$/.test(n)){
    var buf=await file.arrayBuffer();var wb=XLSX.read(buf,{type:'array'});
    var best=null;var bestG=0;
    wb.SheetNames.forEach(function(sn){var rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:''});if(rows.length<2)return;var p=extractFromRows(rows,file.name+'>'+sn);if(p&&p.grand>bestG){best=p;bestG=p.grand;}else if(p&&!best)best=p;});
    return best;
  }
  if(/\.pdf$/.test(n)){
    try{
      if(typeof pdfjsLib==='undefined')return{source:file.name,description:file.name,client:'',ceNum:'',grand:0,mp:[],tools:[],mats:[],ceType:'onsite',savedAt:new Date().toISOString()};
      var buf=await file.arrayBuffer();var pdf=await pdfjsLib.getDocument({data:buf}).promise;
      var text='';var pages=Math.min(pdf.numPages,5);
      for(var i=1;i<=pages;i++){var pg=await pdf.getPage(i);var ct=await pg.getTextContent();text+=ct.items.map(function(x){return x.str;}).join(' ')+' ';}
      return extractFromText(text,file.name);
    }catch(e){console.warn('PDF:',e.message);return null;}
  }
  if(/\.docx?$/.test(n)){
    try{
      if(typeof mammoth==='undefined')return null;
      var buf=await file.arrayBuffer();var r=await mammoth.extractRawText({arrayBuffer:buf});
      return extractFromText(r.value,file.name);
    }catch(e){console.warn('Word:',e.message);return null;}
  }
  return null;
}
async function analyzeLocalFiles(){
  if(!_localFiles.length)return;
  var prog=document.getElementById('local-progress');var bar=document.getElementById('local-progress-bar');
  var msg=document.getElementById('local-progress-msg');var res=document.getElementById('local-results');
  prog.style.display='block';res.style.display='none';
  var projects=[];
  for(var i=0;i<_localFiles.length;i++){
    msg.textContent='Reading '+_localFiles[i].name+' ('+(i+1)+'/'+_localFiles.length+')...';
    bar.style.width=Math.round((i/_localFiles.length)*100)+'%';
    try{var p=await parseLocalFile(_localFiles[i]);if(p)projects.push(p);}catch(e){console.warn(_localFiles[i].name,e);}
  }
  bar.style.width='100%';msg.textContent='Done! '+projects.length+' projects extracted.';
  window.shicHistory=(window.shicHistory||[]).concat(projects);
  try{localStorage.setItem('shic:local_history',JSON.stringify(projects.slice(0,100)));}catch(e){}
  /* Save to SharePoint so all users benefit &#8212; admin-only operation */
  if(projects.length>0&&typeof spSaveMLImports!=='undefined'){
    spSaveMLImports(projects).catch(function(e){console.warn('SP ML save:',e.message);});
  }
  var wG=projects.filter(function(p){return p.grand>0;}).length;
  res.style.display='block';
  res.innerHTML='<div style="background:#10B98111;border:1px solid #10B98133;border-radius:8px;padding:14px">'
    +'<div style="color:#10B981;font-weight:700;font-size:13px;margin-bottom:10px">Analysis Complete!</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">'
    +'<div style="text-align:center;background:#0D1117;border-radius:6px;padding:8px"><div style="color:#7D8590;font-size:10px">FILES</div><div style="color:#F0A429;font-weight:700;font-size:16px">'+_localFiles.length+'</div></div>'
    +'<div style="text-align:center;background:#0D1117;border-radius:6px;padding:8px"><div style="color:#7D8590;font-size:10px">PROJECTS</div><div style="color:#F0A429;font-weight:700;font-size:16px">'+projects.length+'</div></div>'
    +'<div style="text-align:center;background:#0D1117;border-radius:6px;padding:8px"><div style="color:#7D8590;font-size:10px">WITH COSTS</div><div style="color:#F0A429;font-weight:700;font-size:16px">'+wG+'</div></div>'
    +'</div><div style="color:#7D8590;font-size:11px;margin-bottom:8px">ML engine updated with '+projects.length+' reference projects. Open the ML panel to use predictions.</div>'
    +'<div style="max-height:120px;overflow-y:auto">'+projects.slice(0,8).map(function(p){return'<div style="font-size:10px;color:#7D8590;padding:3px 0;border-bottom:1px solid #30363D22;display:flex;justify-content:space-between"><span>'+p.source.split('>')[0]+'</span><span style="color:#F0A429">'+(p.grand?ph3(p.grand):'-')+'</span></div>';}).join('')+'</div></div>';
}
function odSaveConfig(){var c={clientId:((document.getElementById('od-client-id')||{}).value||'').trim(),tenantId:((document.getElementById('od-tenant-id')||{}).value||'').trim(),folderPath:((document.getElementById('od-folder')||{}).value||'/').trim()};window.SHIC_OD&&window.SHIC_OD.saveODConfig(c);}
async function odScan(){var ci=document.getElementById('od-client-id');if(!ci||!ci.value.trim()){alert('Enter Client ID');return;}odSaveConfig();if(window.SHIC_OD)window.SHIC_OD.initMSAL(ci.value.trim(),(document.getElementById('od-tenant-id')||{}).value||'common');var prog=document.getElementById('od-progress');var bar=document.getElementById('od-progress-bar');var msg=document.getElementById('od-progress-msg');var res=document.getElementById('od-results');if(prog)prog.style.display='block';try{var r=await window.SHIC_OD.scanFolder(((document.getElementById('od-folder')||{}).value||'/'),function(p){if(msg)msg.textContent=p.msg;if(bar)bar.style.width=Math.round((p.progress||0)*100)+'%';});if(bar)bar.style.width='100%';if(res){res.style.display='block';res.innerHTML='<div style="color:#10B981;font-weight:700;padding:8px">Done! '+r.files+' files, '+r.projects.length+' projects extracted.</div>';}}catch(e){if(msg)msg.textContent='Error: '+e.message;/* Escaped: this message is whatever Graph, MSAL or a parse failure produced,
   and it can carry a OneDrive file or folder name that someone else chose. */
if(res){res.style.display='block';res.innerHTML='<div style="color:#EF4444;padding:8px">'+_esc(e.message)+'</div>';}}};
function openODPanel(){var p=document.getElementById('shic-od-panel');if(p)p.style.display='flex';}
(function(){try{var c=localStorage.getItem('shic:local_history');if(c){var d=JSON.parse(c);setTimeout(function(){window.shicHistory=(window.shicHistory||[]).concat(d);},4000);}}catch(e){}})();
