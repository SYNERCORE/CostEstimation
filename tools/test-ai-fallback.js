#!/usr/bin/env node
/*
 * When the provider will not serve the model, the app finds one it will.
 *
 * A hardcoded model id is a small time bomb, and not only because models get
 * retired. Groq answered
 *
 *   404 The model `llama-3.3-70b-versatile` does not exist or you do not
 *       have access to it
 *
 * for a model its own documentation still listed as production -- the id was
 * right, the ACCOUNT could not reach it. No amount of care choosing a default
 * fixes that, because the correct answer differs per key.
 *
 * So: on a model-not-found failure, ask the provider which models this key may
 * use, pick one, remember it, retry once. What used to need a code change and a
 * deploy is now something the app settles by itself.
 *
 * Run: node tools/test-ai-fallback.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^﻿/, '');

let fails = 0;
const ck = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};

/* ---- a browser, near enough -------------------------------------------- */
function makeEnv(opts) {
  const store = {};
  const mem = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  mem.setItem('sy3:provider', opts.provider);
  const calls = [];
  const toasts = [];

  /* The fake provider: chat completions honour opts.serves, the models
     endpoint returns opts.catalogue. */
  const fetchStub = async (url, init) => {
    const isList = /\/models(\?|$)/.test(url);
    calls.push({ url, list: isList, body: init && init.body ? String(init.body) : '' });
    if (isList) {
      if (opts.listFails) return { ok: false, status: 401, json: async () => ({ error: { message: 'no' } }) };
      const ids = opts.catalogue;
      if (opts.provider === 'gemini')
        return { ok: true, status: 200, json: async () => ({ models: ids.map(id => ({ name: 'models/' + id, supportedGenerationMethods: ['generateContent'] })) }) };
      if (opts.provider === 'anthropic')
        return { ok: true, status: 200, json: async () => ({ data: ids.map(id => ({ id })) }) };
      return { ok: true, status: 200, json: async () => ({ data: ids.map(id => ({ id })) }) };
    }
    /* Which model was asked for? */
    let asked = '';
    const m = /models\/([^:]+):generateContent/.exec(url);
    if (m) asked = m[1];
    else { try { asked = JSON.parse(init.body).model; } catch (_) {} }
    if (opts.serves.indexOf(asked) !== -1) {
      const text = JSON.stringify({ ok: true, model: asked });
      if (opts.provider === 'gemini') return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
      if (opts.provider === 'anthropic') return { ok: true, status: 200, json: async () => ({ content: [{ text }] }) };
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: text } }] }) };
    }
    const status = opts.failStatus || 404;
    const detail = opts.failDetail || ('The model `' + asked + '` does not exist or you do not have access to it');
    return { ok: false, status, json: async () => ({ error: { message: detail } }) };
  };

  const sandbox = {
    localStorage: mem, sessionStorage: mem, fetch: fetchStub,
    navigator: { onLine: true },
    showToast: t => toasts.push(t),
    console: { warn() {}, error() {} },
    document: { currentScript: null, querySelector: () => null },
    window: { addEventListener() {}, dispatchEvent() {} },
    USE_SP: false, getSiteURL: () => '', dbSaveCompanies: async () => {}
  };
  const names = Object.keys(sandbox);
  const body = rd('src/ai.js') + '\n' + rd('src/ai_models.js') +
    '\nreturn {callAI, aiModel, aiPickModel, aiListModels, aiIsModelError, getModelOverrides, AI_MODELS, AI_MODEL_REJECT};';
  const api = new Function(...names, body)(...names.map(n => sandbox[n]));
  mem.setItem('sy3:apikey', 'k-valid');
  return { api, calls, toasts, mem };
}

/* ---- the reported failure, end to end ----------------------------------- */
async function main() {
  console.log('Groq refuses the shipped model but serves another:');
  {
    const { api, calls, toasts } = makeEnv({
      provider: 'groq',
      serves: ['openai/gpt-oss-120b', 'llama-3.1-8b-instant'],
      catalogue: ['whisper-large-v3', 'openai/gpt-oss-120b', 'llama-3.1-8b-instant', 'meta-llama/llama-guard-4-12b']
    });
    ck('the shipped default is the one that 404s', api.AI_MODELS.groq === 'llama-3.3-70b-versatile');
    const raw = await api.callAI('hello', 100);
    const got = JSON.parse(raw);
    ck('the call succeeds instead of failing', got.ok === true);
    ck('on a model the account can actually reach', got.model === 'openai/gpt-oss-120b', got.model);
    ck('it asked the provider what was available', calls.some(c => c.list));
    ck('exactly one retry, not a loop', calls.filter(c => !c.list).length === 2, calls.filter(c => !c.list).length + ' chat calls');
    ck('the choice is remembered for next time', api.aiModel('groq') === 'openai/gpt-oss-120b');
    ck('and the user is told what changed', /not available on your account/.test(toasts.join(' ')) && /gpt-oss-120b/.test(toasts.join(' ')),
      toasts.join(' | '));
    ck('speech and safety models are never picked', !/whisper|guard/.test(got.model));
  }

  console.log('\nGemini reports the same fault as 400, not 404:');
  {
    const { api } = makeEnv({
      provider: 'gemini', failStatus: 400,
      failDetail: 'models/gemini-9-flash is not found for API version v1beta',
      serves: ['gemini-2.5-flash'], catalogue: ['gemini-2.5-flash', 'embedding-001']
    });
    const got = JSON.parse(await api.callAI('hello', 100));
    ck('a 400 naming the model still triggers the retry', got.ok === true);
    ck('and the embedding model is not chosen', got.model === 'gemini-2.5-flash', got.model);
  }

  console.log('\nFailures that a different model would not fix are passed straight through:');
  {
    const { api, calls } = makeEnv({
      provider: 'groq', failStatus: 401, failDetail: 'Invalid API Key',
      serves: [], catalogue: ['openai/gpt-oss-120b']
    });
    let msg = '';
    try { await api.callAI('hello', 100); } catch (e) { msg = e.message; }
    ck('a bad key is reported, not retried', /API key was rejected/.test(msg), msg);
    ck('and no model list is fetched for it', !calls.some(c => c.list),
      'retrying a rejected key just wastes a request');
  }
  {
    const { api, calls } = makeEnv({
      provider: 'groq', failStatus: 429, failDetail: 'rate limit reached',
      serves: [], catalogue: ['openai/gpt-oss-120b']
    });
    let msg = '';
    try { await api.callAI('hello', 100); } catch (e) { msg = e.message; }
    ck('a rate limit is reported, not retried', /rate limiting or the free quota/.test(msg), msg);
    ck('and no model list is fetched for it', !calls.some(c => c.list));
  }

  console.log('\nWhen no replacement works, it says so and stays clean:');
  {
    const { api, calls, mem } = makeEnv({
      provider: 'groq', serves: [], catalogue: ['openai/gpt-oss-120b', 'llama-3.1-8b-instant']
    });
    let msg = '';
    try { await api.callAI('hello', 100); } catch (e) { msg = e.message; }
    ck('the replacement is tried once', calls.filter(c => !c.list).length === 2);
    ck('a failed replacement is not left remembered', !api.getModelOverrides().groq,
      'the next run would start from a model already known to fail');
  }
  {
    const { api } = makeEnv({ provider: 'groq', serves: [], catalogue: ['whisper-large-v3'] });
    let msg = '';
    try { await api.callAI('hello', 100); } catch (e) { msg = e.message; }
    ck('a catalogue with nothing usable says so', /no usable chat models/.test(msg), msg);
  }
  {
    const { api } = makeEnv({ provider: 'groq', serves: [], catalogue: ['llama-3.3-70b-versatile'] });
    let msg = '';
    try { await api.callAI('hello', 100); } catch (e) { msg = e.message; }
    ck('picking the same failing model again is refused', /Models this key can use/.test(msg), msg);
  }
  {
    const { api, calls } = makeEnv({ provider: 'groq', serves: [], catalogue: [], listFails: true });
    let msg = '';
    try { await api.callAI('hello', 100); } catch (e) { msg = e.message; }
    ck('if the list cannot be fetched, the original failure is reported',
      /does not recognise the model/.test(msg), msg);
  }

  console.log('\nChoosing between several the key can reach:');
  {
    const { api } = makeEnv({ provider: 'groq', serves: [], catalogue: [] });
    ck('the preferred family wins over the merely available',
      api.aiPickModel('groq', ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile']) === 'llama-3.3-70b-versatile');
    ck('rejects are filtered before preference is applied',
      api.aiPickModel('groq', ['whisper-large-v3', 'llama-3.1-8b-instant']) === 'llama-3.1-8b-instant');
    ck('an empty catalogue picks nothing rather than guessing',
      api.aiPickModel('groq', []) === '');
    ck('unknown families still yield something usable',
      api.aiPickModel('groq', ['some-new-model-v2-preview', 'some-new-model']) === 'some-new-model');
    ck('a 404 is always a model fault', api.aiIsModelError(404, '') === true);
    ck('a plain 400 is not', api.aiIsModelError(400, 'malformed request body') === false,
      'retrying a genuinely bad request would just fail again');
  }

  console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall AI fallback assertions passed');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('harness error: ' + e.stack); process.exit(1); });
