const getApiKey = () => sessionStorage.getItem('sy3:apikey') || '';
const setApiKey = (k) => { sessionStorage.setItem('sy3:apikey', k); localStorage.removeItem('sy3:apikey'); localStorage.removeItem('sy3:rememberkey'); };

/* === COMPANY DATABASE ======================================================= */
function getCompanies(){
  try{
    const cs=localStorage.getItem('shic:companies');
    if(cs){const p=JSON.parse(cs);if(p&&p.length)return p;}
    /* Migrate old single company config */
    const old=JSON.parse(localStorage.getItem('shic:co_info')||'{}');
    return [{id:1,name:old.name||'SYNERCORE',sub:old.sub||'HEAVY INDUSTRIES CORP.',
      color:old.color||'#cc0000',logo:old.logo||'',
      cePrefix:'SHIC',docNo:old.doc||'SHIC-F-TSG025',revNo:'0',revDate:''}];
  }catch{return[{id:1,name:'SYNERCORE',sub:'HEAVY INDUSTRIES CORP.',color:'#cc0000',logo:'',cePrefix:'SHIC',docNo:'SHIC-F-TSG025',revNo:'0',revDate:''}];}
}
function saveCompanies(list){
  try{localStorage.setItem('shic:companies',JSON.stringify(list));window.dispatchEvent(new Event('shic:companies:updated'));}catch{}
  if(USE_SP||getSiteURL())dbSaveCompanies(list).catch(()=>{});
}

/* === MULTI-PROVIDER AI =====================================================
   Providers: Gemini (free) \xb7 Groq (free) \xb7 Kimi (free tier) \xb7
              ChatGPT/OpenAI \xb7 Microsoft Copilot (Azure OAI) \xb7 Anthropic
========================================================================== */
const PROVIDERS = {
  gemini: {
    label: 'Google Gemini',
    badge: 'FREE',
    bc: '#3FB950',
    note: 'Free \xb7 no card \xb7 aistudio.google.com',
    ph: 'AIza...',
    url: 'https://aistudio.google.com/app/apikey'
  },
  groq: {
    label: 'Groq (Llama 3)',
    badge: 'FREE',
    bc: '#3FB950',
    note: 'Free \xb7 no card \xb7 console.groq.com',
    ph: 'gsk_...',
    url: 'https://console.groq.com/keys'
  },
  kimi: {
    label: 'Kimi (Moonshot)',
    badge: 'FREE',
    bc: '#3FB950',
    note: 'Free tier \xb7 platform.moonshot.cn',
    ph: 'sk-...',
    url: 'https://platform.moonshot.cn/console/api-keys'
  },
  openai: {
    label: 'ChatGPT / OpenAI',
    badge: '$5 credit',
    bc: '#F0A429',
    note: '$5 starting credit \xb7 platform.openai.com',
    ph: 'sk-...',
    url: 'https://platform.openai.com/api-keys'
  },
  copilot: {
    label: 'Microsoft Copilot',
    badge: 'Enterprise',
    bc: '#A78BFA',
    note: 'Requires Azure OAI endpoint \xb7 portal.azure.com',
    ph: 'https://...azure.../openai',
    url: 'https://portal.azure.com'
  },
  anthropic: {
    label: 'Anthropic Claude',
    badge: 'Paid',
    bc: '#7D8590',
    note: 'Pay-per-use \xb7 console.anthropic.com',
    ph: 'sk-ant-...',
    url: 'https://console.anthropic.com/settings/keys'
  }
};
const getProvider = () => localStorage.getItem('sy3:provider') || 'gemini';
const setProvider = p => localStorage.setItem('sy3:provider', p);
const getAzureEndpoint = () => localStorage.getItem('sy3:azureEndpoint') || '';
const setAzureEndpoint = v => localStorage.setItem('sy3:azureEndpoint', v);

/* fetch() rejects with a bare TypeError("Failed to fetch") for three very
   different problems: the device is offline, the page CSP refused to connect,
   or the host would not do CORS. The browser writes the real reason to the
   console and hands JavaScript nothing, so "AI failed: Failed to fetch" was
   all the user ever saw -- and it reads like a bad API key, which is where
   everyone looked first. The AI endpoints were in fact missing from
   connect-src in index.html and every AI call had been dead on the deployed
   site since the CSP landed. Name the likely cause instead of the symptom. */

/* Every model id the app sends, in ONE place.

   Google shut gemini-2.0-flash down and the app went on POSTing to it. Gemini
   is the DEFAULT provider, so out of the box the AI answered 400 Bad Request
   and the toast relayed Google's wording, which never says "this model no
   longer exists". Six ids scattered through six near-identical fetch blocks is
   how that goes unnoticed; one table is something you can actually check
   against a provider's deprecation page. */
const AI_MODELS = {
  gemini: 'gemini-2.5-flash',
  groq: 'llama-3.3-70b-versatile',
  kimi: 'moonshot-v1-8k',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-opus-5'
};

/* Providers answer failures with their own vocabulary, and the app used to
   relay it verbatim: "API key not valid", "model_not_found", "Bad Request".
   None of that tells an estimator what to DO. Map the status onto the action,
   and keep the provider's own words after it for anyone who wants them. */
function aiHttpError(label, provider, status, detail) {
  /* Tagged so callAI knows this is the retryable one. */
  const _isModel = aiIsModelError(status, detail);
  const _tag = err => { err._modelError = _isModel; return err; };
  const model = aiModel(provider) || AI_MODELS[provider] || '';
  const tail = detail ? ' (' + label + ': ' + detail + ')' : ' (' + label + ' error ' + status + ')';
  if (status === 401 || status === 403)
    return new Error('The ' + label + ' API key was rejected. Click the key button in the top bar and paste a current one.' + tail);
  if (status === 404)
    return _tag(new Error(label + ' does not recognise the model "' + model + '". It has most likely been retired, or your account does not have access to it.' + tail));
  if (status === 429)
    return new Error(label + ' is rate limiting or the free quota is used up. Wait a minute, or switch provider.' + tail);
  if (status >= 500)
    return new Error(label + ' is having trouble at their end. Try again shortly, or switch provider.' + tail);
  if (status === 400 && /model|not found|not supported|deprecat/i.test(String(detail || '')))
    return _tag(new Error(label + ' rejected the model "' + model + '" -- it has most likely been retired, or your account does not have access to it.' + tail));
  if (status === 400 && /api key|api_key|credential/i.test(String(detail || '')))
    return new Error('The ' + label + ' API key was rejected. Click the key button in the top bar and paste a current one.' + tail);
  return _tag(new Error(label + ' rejected the request.' + tail));
}

async function aiFetch(url, opts) {
  try {
    return await fetch(url, opts);
  } catch (e) {
    if (e && e.name === "TypeError") {
      if (typeof navigator !== "undefined" && navigator.onLine === false)
        throw new Error("No internet connection, so the AI could not be reached.");
      let host = url;
      try { host = new URL(url).host; } catch (_) {}
      throw new Error("The browser blocked the request to " + host + " before it was sent. " +
        "This is the page security policy (connect-src in index.html), not your API key. " +
        "Check the browser console for a Content Security Policy message.");
    }
    throw e;
  }
}
/* One attempt with whatever model is currently resolved. */
/* A model the key cannot reach is the one failure worth retrying, because the
   fix is mechanical: ask which models this key CAN reach, pick one, remember
   it, go again. Anything else is passed straight through -- a bad key does not
   get better on a second attempt.

   Only ever one retry, and only after the model has actually changed, so a
   provider that 404s everything cannot spin. */
async function callAI(prompt, maxTokens) {
  const provider = getProvider();
  try {
    return await callAIOnce(prompt, maxTokens);
  } catch (e) {
    if (!e || !e._modelError) throw e;
    const was = aiModel(provider);
    let ids;
    try { ids = await aiListModels(provider, getApiKey()); }
    catch (_) { throw e; }   /* cannot ask -- report the original failure */
    const pick = aiPickModel(provider, ids);
    if (!pick || pick === was) {
      const few = (ids || []).filter(id => !AI_MODEL_REJECT.test(id)).slice(0, 8).join(', ');
      throw new Error(e.message + (few ? ' Models this key can use: ' + few + '.' : ' This key has no usable chat models.'));
    }
    setModelOverride(provider, pick);
    try {
      const out = await callAIOnce(prompt, maxTokens);
      if (typeof showToast === 'function') showToast('"' + was + '" is not available on your account. Switched to "' + pick + '".');
      return out;
    } catch (e2) {
      /* The replacement failed too -- do not leave a bad choice remembered. */
      clearModelOverride(provider);
      throw e2;
    }
  }
}

async function callAIOnce(prompt, maxTokens) {
  maxTokens = maxTokens || 1000;
  const provider = getProvider(),
    key = getApiKey();
  if (!key) throw new Error('No API key set. Click the \uD83D\uDD11 button in the top bar.');

  /* -- Google Gemini -- */
  if (provider === 'gemini') {
    const r = await aiFetch('https://generativelanguage.googleapis.com/v1beta/models/' + aiModel('gemini') + ':generateContent?key=' + key, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0.1
        }
      })
    });
    const d = await r.json();
    if (!r.ok) throw aiHttpError('Gemini', 'gemini', r.status, d.error && d.error.message);
    return d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts && d.candidates[0].content.parts[0] && d.candidates[0].content.parts[0].text || '';
  }

  /* -- Groq -- */
  if (provider === 'groq') {
    const r = await aiFetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify({
        model: aiModel('groq'),
        max_tokens: maxTokens,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });
    const d = await r.json();
    if (!r.ok) throw aiHttpError('Groq', 'groq', r.status, d.error && d.error.message);
    return d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content || '';
  }

  /* -- Kimi (Moonshot) -- */
  if (provider === 'kimi') {
    const r = await aiFetch('https://api.moonshot.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify({
        model: aiModel('kimi'),
        max_tokens: maxTokens,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });
    const d = await r.json();
    if (!r.ok) throw aiHttpError('Kimi', 'kimi', r.status, d.error && d.error.message);
    return d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content || '';
  }

  /* -- ChatGPT / OpenAI -- */
  if (provider === 'openai') {
    const r = await aiFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify({
        model: aiModel('openai'),
        max_tokens: maxTokens,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });
    const d = await r.json();
    if (!r.ok) throw aiHttpError('OpenAI', 'openai', r.status, d.error && d.error.message);
    return d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content || '';
  }

  /* -- Microsoft Copilot (Azure OpenAI) -- */
  if (provider === 'copilot') {
    const endpoint = getAzureEndpoint();
    if (!endpoint) throw new Error('Azure OpenAI endpoint not set. Enter it in the key modal.');
    const r = await aiFetch(endpoint + '/chat/completions?api-version=2024-02-01', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': key
      },
      body: JSON.stringify({
        messages: [{
          role: 'user',
          content: prompt
        }],
        max_tokens: maxTokens,
        temperature: 0.1
      })
    });
    const d = await r.json();
    if (!r.ok) throw aiHttpError('Copilot/Azure', 'copilot', r.status, d.error && d.error.message);
    return d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content || '';
  }

  /* -- Anthropic -- */
  const r = await aiFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: aiModel('anthropic'),
      max_tokens: maxTokens,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })
  });
  const d = await r.json();
  if (!r.ok) throw aiHttpError('Anthropic', 'anthropic', r.status, d.error && d.error.message);
  return d.content && d.content[0] && d.content[0].text || '';
}
/* === PLAN PARSING & TASK LINKING ============================================
   Both AI features -- "Extract Info" (from a document) and "Generate" (from a
   typed scope) -- ask the model for the SAME thing: a scope of work plus the
   manpower, tools, materials and PPE to deliver it. They then write that
   straight into state.

   What they never did was CONNECT the two halves. Every resource row landed
   with no taskId, and rowServesTask matches on exactly that, so the SOW
   Breakdown showed P0.00 and 0 resources against every task the model had just
   written -- the one screen whose whole purpose is to show which scope item
   costs what. The model had the information; the app threw it away on arrival.

   The model returns `task` as a 1-based index into its own sow array, which is
   the only reference it can give: the real ids do not exist until we mint them
   here (uid() comes from helpers.js, loaded before this file). Anything out of range is dropped rather than guessed at -- an unlinked
   row is visibly unassigned, a wrongly-linked one is a costing error nobody
   sees.
========================================================================== */

/* The response schema, shared so the two prompts cannot drift apart. */
const AI_PLAN_SCHEMA = [
  '{"sow":[{"type":"main","text":"","note":""},{"type":"sub","text":"","note":""}],',
  '"manpower":[{"role":"","pax":1,"days":1,"shift":"regular_day","rate":0,"otHours":0,"task":1}],',
  '"tools":[{"desc":"","qty":1,"days":1,"uom":"Lot","cost":0,"task":1}],',
  '"materials":[{"desc":"","qty":1,"uom":"Lot","cost":0,"task":1}],',
  '"ppe":[{"desc":"","qty":1,"uom":"Pcs","cost":0,"task":1}]}'
].join('');

/* The rules that describe the fields above. Kept next to the schema for the
   same reason: a field added to one and not explained in the other is a field
   the model fills in badly. */
const AI_PLAN_RULES = [
  '\nShifts: regular_day,regular_night,sunday_day,sunday_night,holiday_day,holiday_night.',
  '\n- sow: the scope of work as structured items. type="main" for numbered steps,',
  ' type="sub" for lettered sub-steps under the preceding main step.',
  '\n- sow[].note: OPTIONAL. How this step was costed -- the reasoning a reviewer',
  ' would ask about (crew size, why that duration). Leave "" if there is nothing to explain.',
  '\n- task: REQUIRED on every manpower, tool, material and PPE row. The 1-based',
  ' position of the sow item that row is needed for (the first sow item is 1).',
  ' Every row must serve exactly one scope item -- this is what makes the cost',
  ' breakdown per scope step work. If a resource is needed across the whole job,',
  ' point it at the scope item it is most associated with.',
  '\n- manpower[].days: days THAT ROLE works, which may be shorter than the job.',
  '\n- manpower[].otHours: overtime hours PER DAY (not the total for the job). 0 if none.',
  '\n- tools[].days: days the tool is on hire. Tools are charged qty x days x cost,',
  ' so omitting this bills a 20-day job for one day. Materials and PPE are not billed by day.'
].join('');

/* Models wrap JSON in prose and fences however they like. Pull out the object
   rather than hoping the whole reply is clean: the old code stripped ``` fences
   and nothing else, so one sentence of preamble threw a SyntaxError and the
   user got "Unexpected token" with no idea the extraction had nearly worked. */
function aiParseJSON(raw) {
  const s = String(raw == null ? '' : raw).replace(/```+\s*json/gi, '').replace(/```+/g, '').trim();
  if (!s) throw new Error('The AI returned an empty response. Try again.');
  try { return JSON.parse(s); } catch (_) {}
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a !== -1 && b > a) {
    try { return JSON.parse(s.slice(a, b + 1)); } catch (_) {}
  }
  /* A truncated reply is the common failure -- the token cap cut it off
     mid-object -- and it deserves to say so instead of "Unexpected end of JSON
     input", which reads like the model misbehaved. */
  if (a !== -1 && b <= a) throw new Error('The AI reply was cut off before it finished. Try a shorter document, or a smaller section of it.');
  throw new Error('The AI did not return usable JSON.');
}

/* Turn one parsed plan into the rows the app stores, with the scope items and
   the resources actually joined up. `mkId` is the app's uid(). */
function aiLinkPlan(plan) {
  const p = plan || {};
  const arr = v => Array.isArray(v) ? v : [];
  const num = (v, d) => { const n = Number(v); return isFinite(n) && n > 0 ? n : d; };

  const sowItems = arr(p.sow).map(s => ({
    id: uid(),
    type: s && s.type === 'sub' ? 'sub' : 'main',
    text: String((s && s.text) || ''),
    note: String((s && s.note) || '')
  }));

  /* 1-based index -> the id we just minted. */
  const taskIdAt = i => {
    const n = Math.trunc(Number(i));
    return (n >= 1 && n <= sowItems.length) ? sowItems[n - 1].id : '';
  };
  const strip = r => { const o = Object.assign({}, r); delete o.task; return o; };

  const mp = arr(p.manpower).map(r => Object.assign(strip(r), {
    id: uid(),
    pax: num(r.pax, 1),
    days: num(r.days, 1),
    rate: Number(r.rate) || 0,
    shift: r.shift || 'regular_day',
    otHours: Number(r.otHours) || 0,
    perDiem: Number(r.perDiem) || 0,
    taskId: taskIdAt(r.task)
  }));
  /* Tools carry days; consumables and PPE deliberately do not. */
  const res = (list, withDays) => arr(list).map(r => {
    const o = Object.assign(strip(r), {
      id: uid(),
      desc: String(r.desc || ''),
      qty: num(r.qty, 1),
      uom: r.uom || 'Lot',
      cost: Number(r.cost) || 0,
      taskId: taskIdAt(r.task)
    });
    if (withDays) o.days = num(r.days, 1); else delete o.days;
    return o;
  });

  return { sowItems, mp, tools: res(p.tools, true), mats: res(p.materials, false), ppe: res(p.ppe, false) };
}

/* Every field added to the schema costs output tokens, and the reply is one
   JSON object -- a cap hit halfway through is not a short answer, it is an
   unparseable one. 2000/2500 was already tight before sow notes and the task
   links were added to the response. */
const AI_MAX_TOKENS = 8000;

/* Say plainly when rows arrived without a scope task, rather than letting the
   user find the zeros in the SOW Breakdown later. */
function aiLinkNote(plan) {
  const rows = [].concat(plan.mp, plan.tools, plan.mats, plan.ppe);
  if (!rows.length) return '';
  const loose = rows.filter(r => !r.taskId).length;
  if (!plan.sowItems.length) return 'No scope items, so nothing is linked to the breakdown.';
  if (!loose) return 'All ' + rows.length + ' rows linked to scope tasks.';
  return loose + ' of ' + rows.length + ' rows could not be linked to a scope task -- set them in the Scope Task column.';
}
