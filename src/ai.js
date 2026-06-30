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
async function callAI(prompt, maxTokens) {
  maxTokens = maxTokens || 1000;
  const provider = getProvider(),
    key = getApiKey();
  if (!key) throw new Error('No API key set. Click the \uD83D\uDD11 button in the top bar.');

  /* -- Google Gemini -- */
  if (provider === 'gemini') {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + key, {
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
    if (!r.ok) throw new Error(d.error && d.error.message || 'Gemini error ' + r.status);
    return d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts && d.candidates[0].content.parts[0] && d.candidates[0].content.parts[0].text || '';
  }

  /* -- Groq -- */
  if (provider === 'groq') {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: maxTokens,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error && d.error.message || 'Groq error ' + r.status);
    return d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content || '';
  }

  /* -- Kimi (Moonshot) -- */
  if (provider === 'kimi') {
    const r = await fetch('https://api.moonshot.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify({
        model: 'moonshot-v1-8k',
        max_tokens: maxTokens,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error && d.error.message || 'Kimi error ' + r.status);
    return d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content || '';
  }

  /* -- ChatGPT / OpenAI -- */
  if (provider === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: maxTokens,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error && d.error.message || 'OpenAI error ' + r.status);
    return d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content || '';
  }

  /* -- Microsoft Copilot (Azure OpenAI) -- */
  if (provider === 'copilot') {
    const endpoint = getAzureEndpoint();
    if (!endpoint) throw new Error('Azure OpenAI endpoint not set. Enter it in the key modal.');
    const r = await fetch(endpoint + '/chat/completions?api-version=2024-02-01', {
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
    if (!r.ok) throw new Error(d.error && d.error.message || 'Copilot/Azure error ' + r.status);
    return d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content || '';
  }

  /* -- Anthropic -- */
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error && d.error.message || 'Anthropic error ' + r.status);
  return d.content && d.content[0] && d.content[0].text || '';
}