const SITE_URL = getSiteURL();
const USE_SP = !!getSiteURL();

/* &#9472;&#9472; SharePoint Config &#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472; */
const SP_CFG_KEY = 'shic_sp_config';
function getSPConfig(){try{const v=localStorage.getItem(SP_CFG_KEY);return v?JSON.parse(v):{};}catch{return{};}}
function saveSPConfig(cfg){try{localStorage.setItem(SP_CFG_KEY,JSON.stringify(cfg));}catch{}}
function getSiteURL(){const cfg=getSPConfig();if(cfg.siteUrl)return cfg.siteUrl.replace(/\/$/,'');const m=window.location.href.match(/(https:\/\/[^\/]+\/sites\/[^\/]+)/);return m?m[1]:null;}
function spList(n){const cfg=getSPConfig();const p=(cfg.listPrefix||'SHICCE').replace(/[^a-zA-Z0-9_]/g,'');return p+'_'+n;}
let _spMsalApp=null,_spToken=null,_spExpiry=0;
async function _loadMSAL(){
  /* Try multiple CDNs */
  if(typeof msal!=='undefined')return true;
  const cdns=[
    'https://cdn.jsdelivr.net/npm/@azure/msal-browser@2.38.3/lib/msal-browser.min.js',
    'https://unpkg.com/@azure/msal-browser@2.38.3/lib/msal-browser.min.js',
    'https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js'
  ];
  for(const url of cdns){
    try{
      await new Promise((res,rej)=>{
        const s=document.createElement('script');
        s.src=url;s.onload=()=>setTimeout(res,100);s.onerror=rej;
        document.head.appendChild(s);
      });
      if(typeof msal!=='undefined')return true;
    }catch(e){console.warn('MSAL CDN failed:',url);}
  }
  return false;
}

async function getSPToken(){
  const cfg=getSPConfig();
  if(!cfg.clientId){console.warn('SP: No Client ID configured');return null;}
  const su=getSiteURL();if(!su)return null;
  const scope=su.split('/').slice(0,3).join('/')+'/.default';
  if(_spToken&&Date.now()<_spExpiry-60000)return _spToken;
  const loaded=await _loadMSAL();
  if(!loaded){console.error('MSAL failed to load from all CDNs');return null;}
  try{
    if(!_spMsalApp){
      _spMsalApp=new msal.PublicClientApplication({
        auth:{
          clientId:cfg.clientId,
          authority:'https://login.microsoftonline.com/'+(cfg.tenantId||'common'),
          redirectUri:window.location.origin+window.location.pathname.replace(/\/[^\/]*$/,'/')
        },
        cache:{cacheLocation:'sessionStorage',storeAuthStateInCookie:false}
      });
      try{await _spMsalApp.initialize();}catch(e){}
      /* Handle redirect response (from acquireTokenRedirect) */
      try{const redirectResult=await _spMsalApp.handleRedirectPromise();if(redirectResult){_spToken=redirectResult.accessToken;_spExpiry=redirectResult.expiresOn?redirectResult.expiresOn.getTime():Date.now()+3600000;}}catch(e){}
    }
    const accts=_spMsalApp.getAllAccounts();
    let res;
    try{
      res=await _spMsalApp.acquireTokenSilent({scopes:[scope],account:accts[0]||null});
    }catch(e){
      try{
        res=await _spMsalApp.acquireTokenPopup({scopes:[scope]});
      }catch(popErr){
        /* GitHub Pages COOP blocks popups &#8212; fall back to redirect */
        if(popErr.errorCode==='popup_window_error'||popErr.message?.includes('window.closed')||popErr.message?.includes('interaction_in_progress')){
          await _spMsalApp.acquireTokenRedirect({scopes:[scope]});
          return null;
        }
        throw popErr;
      }
    }
    _spToken=res.accessToken;
    _spExpiry=res.expiresOn?res.expiresOn.getTime():Date.now()+3600000;
    return _spToken;
  }catch(e){
    console.warn('SP token:',e.message||e);
    _spMsalApp=null;_spToken=null;
    return null;
  }
}
async function spDigest(){const su=getSiteURL();const tok=await getSPToken();const h={'Accept':'application/json;odata=nometadata','Content-Type':'application/json',...(tok?{'Authorization':'Bearer '+tok}:{})};const r=await fetch(`${su}/_api/contextinfo`,{method:'POST',credentials:'omit',headers:h});const d=await r.json();return{digest:d.FormDigestValue,token:tok};}
const spH = (d, x = {}) => ({
  Accept: 'application/json;odata=nometadata',
  'Content-Type': 'application/json;odata=nometadata',
  ...(d ? {
    'X-RequestDigest': d
  } : {}),
  ...x
});
async function spGet(l,f='',sel=''){
  const su=getSiteURL();if(!su)return[];
  const tok=await getSPToken();if(!tok){console.warn('SP: No auth token — skipping '+l);return[];}
  const h={'Accept':'application/json;odata=nometadata','Authorization':'Bearer '+tok};
  let results=[];
  const qs=[];if(f)qs.push('$filter='+encodeURIComponent(f));if(sel)qs.push('$select='+sel);qs.push('$top=5000');
  let url=`${su}/_api/web/lists/getbytitle('${l}')/items?${qs.join('&')}`;
  /* Follow odata.nextLink to page through lists larger than 5000 items */
  while(url){
    const r=await fetch(url,{credentials:'omit',headers:h});
    if(!r.ok)throw new Error('SP get '+l+':'+r.status);
    const json=await r.json();
    results=results.concat(json.value||[]);
    url=json['odata.nextLink']||null;
  }
  return results;
}
async function spPost(l,data){const su=getSiteURL();if(!su)throw new Error('SP not configured');const{digest,token}=await spDigest();if(!token)throw new Error('SP: No auth token. Please sign in via Connect & Test first.');const h={'Accept':'application/json;odata=nometadata','Content-Type':'application/json;odata=nometadata','X-RequestDigest':digest,'Authorization':'Bearer '+token};const r=await fetch(`${su}/_api/web/lists/getbytitle('${l}')/items`,{method:'POST',credentials:'omit',headers:h,body:JSON.stringify(data)});if(!r.ok){const t=await r.text();throw new Error('SP post '+l+':'+r.status+' '+t.slice(0,100));}return r.json();}
async function spPatch(l,id,data){const su=getSiteURL();const{digest,token}=await spDigest();const h={'Accept':'application/json;odata=nometadata','Content-Type':'application/json;odata=nometadata','X-RequestDigest':digest,'IF-MATCH':'*','X-HTTP-Method':'MERGE',...(token?{'Authorization':'Bearer '+token}:{})};const r=await fetch(`${su}/_api/web/lists/getbytitle('${l}')/items(${id})`,{method:'PATCH',credentials:'omit',headers:h,body:JSON.stringify(data)});if(!r.ok)throw new Error('SP patch '+l+':'+r.status);}
async function spDelete(l,id){const su=getSiteURL();const{digest,token}=await spDigest();const h={'Accept':'application/json;odata=nometadata','Content-Type':'application/json;odata=nometadata','X-RequestDigest':digest,'IF-MATCH':'*',...(token?{'Authorization':'Bearer '+token}:{})};const r=await fetch(`${su}/_api/web/lists/getbytitle('${l}')/items(${id})`,{method:'DELETE',credentials:'omit',headers:h});if(!r.ok)throw new Error('SP delete '+l+':'+r.status);}

async function spGetAttachments(listName, itemId){
  const su=getSiteURL(); if(!su) return [];
  const tok=await getSPToken(); if(!tok) return [];
  const h={'Accept':'application/json;odata=nometadata','Authorization':'Bearer '+tok};
  const r=await fetch(`${su}/_api/web/lists/getbytitle('${listName}')/items(${itemId})/AttachmentFiles`,{credentials:'omit',headers:h});
  if(!r.ok) return [];
  const json=await r.json();
  return json.value||[];
}
async function spAddAttachment(listName, itemId, fileName, fileBuffer){
  const su=getSiteURL(); if(!su) throw new Error('No SP site');
  const {digest,token}=await spDigest();
  const h={'Accept':'application/json;odata=nometadata','Content-Type':'application/octet-stream','X-RequestDigest':digest,...(token?{'Authorization':'Bearer '+token}:{})};
  const r=await fetch(`${su}/_api/web/lists/getbytitle('${listName}')/items(${itemId})/AttachmentFiles/add(FileName='${encodeURIComponent(fileName)}')`,{method:'POST',credentials:'omit',headers:h,body:fileBuffer});
  if(!r.ok) throw new Error('SP attach '+r.status);
  return await r.json();
}
async function spDeleteAttachment(listName, itemId, fileName){
  const su=getSiteURL(); if(!su) throw new Error('No SP site');
  const {digest,token}=await spDigest();
  const h={'Accept':'application/json;odata=nometadata','X-RequestDigest':digest,'X-HTTP-Method':'DELETE','IF-MATCH':'*',...(token?{'Authorization':'Bearer '+token}:{})};
  const r=await fetch(`${su}/_api/web/lists/getbytitle('${listName}')/items(${itemId})/AttachmentFiles/getByFileName('${encodeURIComponent(fileName)}')`,{method:'POST',credentials:'omit',headers:h});
  if(!r.ok) throw new Error('SP del attach '+r.status);
}
/* Upload a client document and return its server-relative URL, or null.
   Called by handleDocUpload but never defined, so attaching a document threw a
   ReferenceError for every SharePoint user. Built on the existing spPost /
   spAddAttachment helpers rather than a new file-library code path.
   Never throws: the caller keeps the locally extracted text either way, so a
   failed upload must degrade to local-only instead of losing the document. */
async function spUploadDoc(fileName, fileBuffer){
  try{
    if(!getSiteURL()) return null;
    const list = spList('CE_Documents');
    const ext = (String(fileName).split('.').pop() || '').toLowerCase();
    const item = await spPost(list, {Title:fileName, shicFileName:fileName, shicFileType:ext});
    if(!item || item.Id === undefined) return null;
    const att = await spAddAttachment(list, item.Id, fileName, fileBuffer);
    return (att && att.ServerRelativeUrl) || null;
  }catch(e){
    console.warn('spUploadDoc:', e.message);
    return null;
  }
}
