/* Which model to actually send, discovered rather than guessed.
   ==========================================================================

   A hardcoded model id is a small time bomb. Providers retire models, and they
   also gate them per account: Groq answered
   "The model `llama-3.3-70b-versatile` does not exist or you do not have
   access to it" for a model its own documentation still lists as production.
   So the id being correct in the docs does not make it correct for THIS key,
   and no amount of care in choosing a default fixes that.

   Every provider exposes the list of models a key may use. Ask, instead of
   guessing: on a model-not-found failure, fetch the list, pick a usable chat
   model, remember it for that provider, and retry once. A dead end that used
   to need a code change and a deploy becomes something the app settles itself.

   The remembered choice is per provider and per browser (localStorage), so one
   estimator sorting it out does not change anyone else's setup, and clearing
   it falls back to the default in AI_MODELS. */

const AI_MODEL_KEY = 'sy3:models';

function getModelOverrides() {
  try { const v = JSON.parse(localStorage.getItem(AI_MODEL_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; }
  catch (_) { return {}; }
}
function setModelOverride(provider, id) {
  try { const o = getModelOverrides(); o[provider] = id; localStorage.setItem(AI_MODEL_KEY, JSON.stringify(o)); } catch (_) {}
}
function clearModelOverride(provider) {
  try { const o = getModelOverrides(); delete o[provider]; localStorage.setItem(AI_MODEL_KEY, JSON.stringify(o)); } catch (_) {}
}
/* What to send: the model this browser has settled on, else the shipped default. */
function aiModel(provider) {
  return getModelOverrides()[provider] || AI_MODELS[provider] || '';
}

/* The same idea for request size.

   A free tier caps tokens per minute and counts the prompt AND max_tokens --
   the room reserved for the reply -- so a request that is fine on a paid key
   is refused on a free one. callAI recovers by halving and retrying, which
   works, but without remembering the answer EVERY call repeated the whole
   dance: a 413, a wasted round trip, and a red line in the console that looks
   like a failure to anyone who has not read this file.

   So remember the size that worked, per provider, and start there next time.
   It is a ceiling, never a floor: a caller asking for less still gets less. */
const AI_CAP_KEY = 'sy3:tokencaps';

function getTokenCaps() {
  try { const v = JSON.parse(localStorage.getItem(AI_CAP_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; }
  catch (_) { return {}; }
}
function setTokenCap(provider, n) {
  try { const c = getTokenCaps(); c[provider] = n; localStorage.setItem(AI_CAP_KEY, JSON.stringify(c)); } catch (_) {}
}
function clearTokenCap(provider) {
  try { const c = getTokenCaps(); delete c[provider]; localStorage.setItem(AI_CAP_KEY, JSON.stringify(c)); } catch (_) {}
}
/* The reply room to ask for: what the caller wants, capped by what this
   provider has already shown it will accept. */
function aiTokens(provider, want) {
  const cap = Number(getTokenCaps()[provider]) || 0;
  return cap > 0 ? Math.min(want, cap) : want;
}

/* Models that answer chat but are no use for extracting a costing plan --
   speech, moderation, embeddings. Filtered out so the fallback never lands on
   one and produces a baffling result instead of a clear failure. */
const AI_MODEL_REJECT = /whisper|tts|guard|embed|moderat|vision-only|image|rerank|distil-whisper/i;

/* Preference order per provider: cheap-and-capable first, since these calls
   are one-shot JSON extraction, not conversation. Anything not listed is still
   usable -- this only decides which of several is picked. */
const AI_MODEL_PREF = {
  groq: [/^llama-3\.3-70b/, /^openai\/gpt-oss-120b/, /^openai\/gpt-oss-20b/, /^llama-3\.1-8b/, /^groq\/compound/],
  openai: [/^gpt-4o-mini$/, /^gpt-4o$/, /^gpt-4\.1-mini/, /^gpt-4/],
  gemini: [/flash-latest$/, /2\.5-flash$/, /flash$/, /pro$/],
  kimi: [/^moonshot-v1-8k$/, /^moonshot-v1-32k$/, /^moonshot/],
  anthropic: [/^claude-opus-5$/, /^claude-sonnet-5$/, /^claude-haiku/]
};

/* Ask the provider which models this key may use. Every one of these has a
   list endpoint; the shapes differ, the idea does not. */
async function aiListModels(provider, key) {
  const j = async (url, opts) => { const r = await aiFetch(url, opts); const d = await r.json().catch(() => null); if (!r.ok) throw aiHttpError(provider, provider, r.status, d && d.error && (d.error.message || d.error)); return d; };
  if (provider === 'gemini') {
    const d = await j('https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(key) + '&pageSize=200');
    return (d && d.models || [])
      .filter(m => (m.supportedGenerationMethods || []).indexOf('generateContent') !== -1)
      .map(m => String(m.name || '').replace(/^models\//, ''));
  }
  if (provider === 'anthropic') {
    const d = await j('https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } });
    return (d && d.data || []).map(m => m.id);
  }
  /* Groq, OpenAI and Kimi are all OpenAI-compatible here. */
  const base = provider === 'groq' ? 'https://api.groq.com/openai/v1'
    : provider === 'kimi' ? 'https://api.moonshot.cn/v1'
    : 'https://api.openai.com/v1';
  const d = await j(base + '/models', { headers: { Authorization: 'Bearer ' + key } });
  return (d && d.data || []).map(m => m.id);
}

/* Choose from what the key can actually reach. */
function aiPickModel(provider, ids) {
  const usable = (ids || []).filter(id => id && !AI_MODEL_REJECT.test(id));
  if (!usable.length) return '';
  for (const re of (AI_MODEL_PREF[provider] || [])) {
    const hit = usable.find(id => re.test(id));
    if (hit) return hit;
  }
  /* Nothing preferred matched -- shortest id is a decent proxy for the plain,
     general-purpose member of a family rather than a dated or specialised one. */
  return usable.slice().sort((a, b) => a.length - b.length)[0];
}

/* True when a failure is "that model is not available to you", which is the
   one error worth retrying with a different model. Providers disagree on the
   status: Groq and OpenAI use 404, Gemini uses 400. */
function aiIsModelError(status, detail) {
  const s = String(detail || '');
  if (status === 404) return true;
  return status === 400 && /model|not found|not exist|not supported|deprecat|decommission/i.test(s);
}
