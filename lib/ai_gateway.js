'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)/g;
const POSTCODE_RE = /\b(?:GIR ?0AA|[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})\b/gi;
const URL_QUERY_RE = /\bhttps?:\/\/[^\s?#]+[?#][^\s]+/gi;

function redactString(input) {
  return String(input || '')
    .replace(EMAIL_RE, '[email removed]')
    .replace(PHONE_RE, '[phone removed]')
    .replace(POSTCODE_RE, '[postcode removed]')
    .replace(URL_QUERY_RE, '[URL with query removed]');
}
function redact(value, key = '') {
  const sensitiveKey = /(?:email|name|phone|address|postcode|participant.?id|user.?id|ip|contact)/i.test(key);
  if (sensitiveKey) {
    if (Array.isArray(value)) return value.map(() => '[identifier removed]');
    if (value && typeof value === 'object') return '[identifier removed]';
    return '[identifier removed]';
  }
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.slice(0, 500).map(v => redact(v, key));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (/(?:relayAdminToken|relayKey|inviteToken|connectorCapability|password|secret|token)$/i.test(k)) continue;
      out[k] = redact(v, k);
    }
    return out;
  }
  return value;
}
function boundedJson(value, maxChars = 350000) {
  const raw = JSON.stringify(value);
  if (raw.length <= maxChars) return raw;
  return raw.slice(0, maxChars) + '\n[truncated by Eve]';
}
function parseJsonText(text) {
  const raw = String(text || '').trim();
  try { return JSON.parse(raw); } catch {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch {} }
  const object = raw.match(/\{[\s\S]*\}/);
  if (object) { try { return JSON.parse(object[0]); } catch {} }
  throw new Error('AI provider returned invalid JSON.');
}
function outputText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  const parts = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    if (item?.type !== 'message') continue;
    for (const c of Array.isArray(item.content) ? item.content : []) {
      if ((c?.type === 'output_text' || c?.type === 'text') && typeof c.text === 'string') parts.push(c.text);
    }
  }
  return parts.join('\n');
}

function createAiGateway({ json, body, requireRole, dataDir, authConfigured=()=>true, stateStore=null }) {
  const timeoutMs=Math.max(5000,Math.min(120000,Number(process.env.EVE_AI_TIMEOUT_MS||45000))),configFile=path.join(dataDir||process.cwd(),'ai-provider.json'),keyFile=path.join(dataDir||process.cwd(),'.ai-provider.key');
  const persisted=stateStore?.scope('settings',{aiProvider:{legacyFile:configFile,fallback:{}}});
  function machineKey(){const supplied=String(process.env.EVE_CONNECTOR_SECRET||'');if(supplied)return crypto.createHash('sha256').update(`ai:${supplied}`).digest();try{const x=fs.readFileSync(keyFile);if(x.length===32)return x}catch{}const x=crypto.randomBytes(32);fs.mkdirSync(path.dirname(keyFile),{recursive:true});fs.writeFileSync(keyFile,x,{mode:0o600});return x}
  function encryptSecret(v){if(!v)return null;const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',machineKey(),iv),data=Buffer.concat([c.update(String(v),'utf8'),c.final()]);return{iv:iv.toString('base64url'),tag:c.getAuthTag().toString('base64url'),data:data.toString('base64url')}}
  function decryptSecret(v){if(!v?.iv)return'';try{const d=crypto.createDecipheriv('aes-256-gcm',machineKey(),Buffer.from(v.iv,'base64url'));d.setAuthTag(Buffer.from(v.tag,'base64url'));return Buffer.concat([d.update(Buffer.from(v.data,'base64url')),d.final()]).toString('utf8')}catch{return''}}
  function readSaved(){if(persisted)return persisted.read('aiProvider',{});try{return JSON.parse(fs.readFileSync(configFile,'utf8'))||{}}catch{return{}}}function writeSaved(x){if(persisted)return persisted.write('aiProvider',x);fs.mkdirSync(path.dirname(configFile),{recursive:true});const t=configFile+'.tmp';fs.writeFileSync(t,JSON.stringify(x),{mode:0o600});fs.renameSync(t,configFile)}
  function currentConfig(){const s=readSaved(),env=String(process.env.EVE_AI_API_KEY||process.env.OPENAI_API_KEY||''),saved=decryptSecret(s.apiKey);return{enabled:s.enabled!==undefined?!!s.enabled:true,endpoint:String(s.baseUrl||process.env.EVE_AI_BASE_URL||'https://api.openai.com/v1').replace(/\/+$/,''),apiKey:saved||env,model:String(s.model||process.env.EVE_AI_MODEL||'gpt-5.6'),source:saved?'settings':env?'environment':'none'}}
  function publicConfig(){const c=currentConfig();return{ok:true,enabled:c.enabled,configured:!!c.apiKey,model:c.model,baseUrl:c.endpoint,keyHint:c.apiKey?`••••${c.apiKey.slice(-4)}`:'',source:c.source}}
  function roleOrLocal(req,res,role){return authConfigured()?requireRole(req,res,role):{local:true,membership:{role:'admin'}}}

  async function callProvider(instructions, input) {
    const cfg=currentConfig();if(!cfg.enabled)throw Object.assign(new Error('AI is disabled in global settings.'),{status:403,code:'ai_disabled_globally'});if(!cfg.apiKey)throw Object.assign(new Error('AI provider is not configured.'),{status:503,code:'ai_not_configured'});const {endpoint,apiKey,model}=cfg;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetch(`${endpoint}/responses`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          store: false,
          instructions,
          input,
          max_output_tokens: 1800,
        }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        const msg = data?.error?.message || `AI provider HTTP ${r.status}`;
        throw Object.assign(new Error(msg), { status: 502, code: 'ai_provider_error' });
      }
      return parseJsonText(outputText(data));
    } catch (err) {
      if (err?.name === 'AbortError') throw Object.assign(new Error('AI provider timed out.'), { status: 504, code: 'ai_timeout' });
      throw err;
    } finally { clearTimeout(timer); }
  }
  function policyPayload(permission, payload) {
    const p = String(permission || 'off').toLowerCase();
    if (p === 'off') throw Object.assign(new Error('AI is disabled for this study.'), { status: 403, code: 'ai_disabled_by_study' });
    if (!['anonymous','full'].includes(p)) throw Object.assign(new Error('Invalid AI permission.'), { status: 400, code: 'invalid_ai_permission' });
    return { permission: p, payload: p === 'anonymous' ? redact(payload) : redactSecretsOnly(payload) };
  }
  function redactSecretsOnly(value, key = '') {
    if (/(?:relayAdminToken|relayKey|inviteToken|connectorCapability|password|secret|token)$/i.test(key)) return undefined;
    if (Array.isArray(value)) return value.slice(0, 500).map(v => redactSecretsOnly(v, key)).filter(v => v !== undefined);
    if (value && typeof value === 'object') {
      const out = {};
      for (const [k,v] of Object.entries(value)) {
        const clean = redactSecretsOnly(v, k);
        if (clean !== undefined) out[k] = clean;
      }
      return out;
    }
    return value;
  }

  async function handle(req, res, url) {
    if(url.pathname==='/api/ai/config'&&req.method==='GET'){const auth=roleOrLocal(req,res,'admin');if(!auth)return true;return json(res,200,publicConfig())}
    if(url.pathname==='/api/ai/config'&&req.method==='PUT'){const auth=roleOrLocal(req,res,'admin');if(!auth)return true;try{const d=await body(req),s=readSaved();if(d.clearKey===true)delete s.apiKey;else if(typeof d.apiKey==='string'&&d.apiKey.trim())s.apiKey=encryptSecret(d.apiKey.trim());if(d.enabled!==undefined)s.enabled=!!d.enabled;if(typeof d.model==='string'&&d.model.trim())s.model=d.model.trim().slice(0,120);if(typeof d.baseUrl==='string'&&d.baseUrl.trim()){const u=new URL(d.baseUrl.trim());if(!['http:','https:'].includes(u.protocol))throw Object.assign(new Error('AI base URL must use http or https.'),{status:400});s.baseUrl=u.toString().replace(/\/+$/,'')}writeSaved(s);return json(res,200,publicConfig())}catch(err){return json(res,err.status||400,{ok:false,error:'ai_config_invalid',message:err.message})}}
    if (url.pathname === '/api/ai/status' && req.method === 'GET') {
      const auth = roleOrLocal(req,res,'viewer'); if (!auth) return true;const c=publicConfig();
      return json(res, 200, { ok: true, configured:c.configured, enabled:c.enabled, model:c.configured?c.model:null });
    }
    if (url.pathname === '/api/ai/check' && req.method === 'POST') {
      const auth = roleOrLocal(req,res,'researcher'); if (!auth) return true;
      try {
        const data = await body(req);
        const kind = data.kind === 'task' ? 'task' : 'question';
        const safe = policyPayload(data.permission, data.content || {});
        const result = await callProvider(
          `You are Eve's user-research quality reviewer. Review one ${kind}. Be practical and concise.
Return JSON only with exactly:
{"summary":"string","severity":"ok|suggestion|warning","issues":["string"],"suggestion":"string"}.
For questions, check neutrality, clarity, double-barrelling, assumptions and answerability.
For tasks, also check whether wording leaks target/navigation labels or tells the participant how to succeed.
Do not invent problems. If it is good, say so.`,
          boundedJson({ kind, permission: safe.permission, content: safe.payload }, 30000)
        );
        return json(res, 200, { ok: true, result, policy: safe.permission, model: currentConfig().model });
      } catch (err) {
        return json(res, err.status || 500, { ok: false, error: err.code || 'ai_failed', message: err.message });
      }
    }
    if (url.pathname === '/api/ai/researcher' && req.method === 'POST') {
      const auth = roleOrLocal(req,res,'researcher'); if (!auth) return true;
      try {
        const data = await body(req);
        const safe = policyPayload(data.permission, {
          study: data.study || {},
          responses: Array.isArray(data.responses) ? data.responses : [],
          metrics: data.metrics || {},
          cohort: data.cohort || {},
        });
        const result = await callProvider(
          `You are Eve's AI Researcher. Analyse only the supplied study evidence. Distinguish evidence from interpretation.
Do not claim statistical significance. Do not infer protected characteristics or identity.
Prioritise actionable UX/research findings and call out uncertainty or small samples.
Return JSON only:
{"summary":"string","insights":[{"title":"string","summary":"string","evidence":"string","confidence":"low|moderate|high","tags":["string"]}],"followUps":["string"]}.
Return at most 6 insights and 4 follow-ups.`,
          boundedJson({ permission: safe.permission, ...safe.payload })
        );
        if (!Array.isArray(result.insights)) result.insights = [];
        result.insights = result.insights.slice(0, 6);
        if (!Array.isArray(result.followUps)) result.followUps = [];
        result.followUps = result.followUps.slice(0, 4);
        return json(res, 200, { ok: true, result, policy: safe.permission, model: currentConfig().model });
      } catch (err) {
        return json(res, err.status || 500, { ok: false, error: err.code || 'ai_failed', message: err.message });
      }
    }
    return false;
  }
  return { handle, redact, configured: !!currentConfig().apiKey, model: currentConfig().model, publicConfig };
}

module.exports = { createAiGateway, redact, redactString };
