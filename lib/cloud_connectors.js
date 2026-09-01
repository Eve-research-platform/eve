'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';
const GOOGLE_DRIVE = 'https://www.googleapis.com/drive/v3';
const GOOGLE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const MAX_CONNECTOR_BODY = 128 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20000;
const PENDING_TTL_MS = 10 * 60 * 1000;

function sha(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('base64url');
}
function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }
function pkceChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}
function timingSafeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJsonAtomic(file, value, mode = 0o600) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value), { mode });
  fs.renameSync(tmp, file);
  try { fs.chmodSync(file, mode); } catch {}
}
function safeCloudPath(input, { allowEmpty = false } = {}) {
  const raw = String(input || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!raw) {
    if (allowEmpty) return '';
    throw Object.assign(new Error('Cloud path is required.'), { status: 400, code: 'invalid_cloud_path' });
  }
  const parts = raw.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || p.includes('\0'))) {
    throw Object.assign(new Error('Cloud path contains an invalid segment.'), { status: 400, code: 'invalid_cloud_path' });
  }
  if (parts.length > 24 || raw.length > 1000) {
    throw Object.assign(new Error('Cloud path is too long.'), { status: 400, code: 'invalid_cloud_path' });
  }
  return parts.join('/');
}
function providerId(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'google' || v === 'google drive' || v === 'google-drive' || v === 'googledrive') return 'google';
  if (v === 'microsoft' || v === 'sharepoint' || v === 'microsoft sharepoint' || v === 'microsoft-sharepoint') return 'microsoft';
  return '';
}
function providerLabel(provider) { return provider === 'google' ? 'Google Drive' : 'Microsoft SharePoint'; }
function encodeODataString(value) { return String(value || '').replace(/'/g, "''"); }
function encodeGraphName(value) { return encodeURIComponent(String(value || '')).replace(/%2F/gi, '%252F'); }
function requestOrigin(req) {
  const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwarded || (req.socket?.encrypted ? 'https' : 'http');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:8787').split(',')[0].trim();
  return `${protocol}://${host}`;
}
function sendHtml(res, status, html) {
  const body = Buffer.from(String(html));
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  });
  res.end(body);
  return true;
}
function redirect(res, location) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
  return true;
}
function callbackHtml({ ok, provider, capability = '', connection = null, message = '' }) {
  const data = JSON.stringify({ source: 'eve-cloud-connector', type: ok ? 'EVE_CONNECTOR_CONNECTED' : 'EVE_CONNECTOR_ERROR', provider, capability, connection, message })
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  const title = ok ? `${providerLabel(provider)} connected` : 'Connection failed';
  const copy = ok ? 'You can return to Eve. This window should close automatically.' : String(message || 'The cloud connection could not be completed.');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font:16px system-ui,sans-serif;margin:0;background:#f7f8fb;color:#202534}main{max-width:560px;margin:12vh auto;padding:28px;background:#fff;border:1px solid #e2e6ee;border-radius:18px;box-shadow:0 20px 60px #1e2a4415}h1{font-size:24px;margin:0 0 10px}p{line-height:1.55;color:#59647a}.ok{color:#16734a}.err{color:#9b3434}</style></head><body><main><h1 class="${ok ? 'ok' : 'err'}">${title}</h1><p>${copy.replace(/[<>]/g, '')}</p></main><script>const data=${data};try{window.opener&&window.opener.postMessage(data,location.origin)}catch{};${ok ? 'setTimeout(()=>window.close(),450);' : ''}</script></body></html>`;
}

function createCloudConnectorService({ dataDir, json, body, publicOrigin = '', fetchImpl = globalThis.fetch, requireRole = null, authConfigured = () => false, stateStore = null }) {
  if (typeof fetchImpl !== 'function') throw new Error('Cloud connectors require fetch support.');
  const root = path.join(dataDir, 'connectors');
  const vaultFile = path.join(root, 'vault.json');
  const localKeyFile = path.join(root, '.connector-key');
  const persisted=stateStore?.scope('connectors',{vault:{legacyFile:vaultFile,fallback:{version:1,records:[]}},pending:{legacyFile:path.join(root,'pending-oauth.json'),fallback:[]}});
  const pending = new Map();
  fs.mkdirSync(root, { recursive: true });
  function loadPending(){if(!persisted)return pending;const map=new Map();for(const row of persisted.read('pending',[]))if(row?.state&&row?.value)map.set(row.state,row.value);return map}
  function savePending(map){if(persisted)persisted.write('pending',[...map.entries()].map(([state,value])=>({state,value})).slice(-1000))}

  function configuredSecretKey() {
    const supplied = String(process.env.EVE_CONNECTOR_SECRET || '');
    if (supplied) return crypto.createHash('sha256').update(supplied).digest();
    try {
      const raw = fs.readFileSync(localKeyFile);
      if (raw.length === 32) return raw;
    } catch {}
    const raw = crypto.randomBytes(32);
    fs.writeFileSync(localKeyFile, raw, { mode: 0o600 });
    return raw;
  }
  function encryptTokens(value) {
    const key = configuredSecretKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return { v: 1, iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), data: encrypted.toString('base64url') };
  }
  function decryptTokens(envelope) {
    if (!envelope?.iv || !envelope?.tag || !envelope?.data) throw new Error('Connector token record is invalid.');
    const key = configuredSecretKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
    const plain = Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64url')), decipher.final()]);
    return JSON.parse(plain.toString('utf8'));
  }
  function loadVault() {
    const raw = persisted?persisted.read('vault',{version:1,records:[]}):readJson(vaultFile, { version: 1, records: [] });
    if (!raw || !Array.isArray(raw.records)) return { version: 1, records: [] };
    return raw;
  }
  function saveVault(vault) { if(persisted)return persisted.write('vault',vault);writeJsonAtomic(vaultFile, vault, 0o600); }
  function publicRecord(record) {
    if (!record) return null;
    return {
      id: record.id,
      provider: record.provider,
      label: providerLabel(record.provider),
      connected: true,
      user: record.user || null,
      location: record.location || null,
      createdAt: record.createdAt || null,
      updatedAt: record.updatedAt || null,
      lastUsedAt: record.lastUsedAt || null,
    };
  }
  function findRecordByCapability(capability) {
    const cap = String(capability || '');
    if (!cap) return null;
    const digest = sha(cap);
    const vault = loadVault();
    return vault.records.find(r => timingSafeEqual(r.capabilityHash, digest)) || null;
  }
  function updateRecord(id, mutator) {
    const vault = loadVault();
    const idx = vault.records.findIndex(r => r.id === id);
    if (idx < 0) throw Object.assign(new Error('Connector not found.'), { status: 404, code: 'connector_not_found' });
    const next = { ...vault.records[idx] };
    mutator(next);
    next.updatedAt = Date.now();
    vault.records[idx] = next;
    saveVault(vault);
    return next;
  }
  function saveNewRecord(record) {
    const vault = loadVault();
    vault.records = vault.records.filter(r => r.id !== record.id);
    vault.records.push(record);
    saveVault(vault);
  }
  function deleteRecord(id) {
    const vault = loadVault();
    const before = vault.records.length;
    vault.records = vault.records.filter(r => r.id !== id);
    if (vault.records.length !== before) saveVault(vault);
  }
  function connectorConfig(req) {
    const origin = String(process.env.EVE_PUBLIC_ORIGIN || publicOrigin || requestOrigin(req)).replace(/\/+$/, '');
    return {
      origin,
      google: {
        configured: !!(process.env.EVE_GOOGLE_CLIENT_ID && process.env.EVE_GOOGLE_CLIENT_SECRET),
        clientId: String(process.env.EVE_GOOGLE_CLIENT_ID || ''),
        clientSecret: String(process.env.EVE_GOOGLE_CLIENT_SECRET || ''),
        redirectUri: `${origin}/api/connectors/google/callback`,
        scopes: String(process.env.EVE_GOOGLE_SCOPES || 'openid email profile https://www.googleapis.com/auth/drive.file').trim(),
      },
      microsoft: {
        configured: !!(process.env.EVE_MICROSOFT_CLIENT_ID && process.env.EVE_MICROSOFT_CLIENT_SECRET),
        clientId: String(process.env.EVE_MICROSOFT_CLIENT_ID || ''),
        clientSecret: String(process.env.EVE_MICROSOFT_CLIENT_SECRET || ''),
        tenantId: String(process.env.EVE_MICROSOFT_TENANT_ID || 'organizations').trim() || 'organizations',
        redirectUri: `${origin}/api/connectors/microsoft/callback`,
        scopes: String(process.env.EVE_MICROSOFT_SCOPES || 'openid profile email offline_access User.Read Sites.ReadWrite.All').trim(),
      },
    };
  }
  async function timedFetch(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const external = options.signal;
    let timedOut = false;
    const relay = () => controller.abort(external?.reason);
    if (external) {
      if (external.aborted) relay();
      else external.addEventListener('abort', relay, { once: true });
    }
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal });
      return response;
    } catch (err) {
      if (timedOut) throw Object.assign(new Error('Cloud provider request timed out.'), { status: 504, code: 'provider_timeout', cause: err });
      throw err;
    } finally {
      clearTimeout(timer);
      external?.removeEventListener?.('abort', relay);
    }
  }
  async function jsonFetch(url, options = {}, expected = null) {
    const r = await timedFetch(url, options);
    const text = await r.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
    if (!r.ok || (expected && !expected.includes(r.status))) {
      const message = payload?.error_description || payload?.error?.message || payload?.error || payload?.message || `Provider returned HTTP ${r.status}`;
      throw Object.assign(new Error(typeof message === 'string' ? message : JSON.stringify(message)), { status: r.status >= 400 && r.status < 600 ? r.status : 502, providerStatus: r.status, payload });
    }
    return payload;
  }
  function cleanupPending() {
    const map=persisted?loadPending():pending,cutoff=Date.now()-PENDING_TTL_MS;
    for(const [key,value] of map.entries())if(value.createdAt<cutoff)map.delete(key);
    if(persisted)savePending(map);return map;
  }
  function startOAuth(req, res, provider) {
    const pendingMap=cleanupPending();
    const config = connectorConfig(req)[provider];
    if (!config?.configured) {
      return sendHtml(res, 503, callbackHtml({ ok: false, provider, message: `${providerLabel(provider)} OAuth is not configured on this Eve deployment.` }));
    }
    const state = randomToken(24);
    const verifier = randomToken(48);
    const capability = randomToken(32);
    pendingMap.set(state, { provider, verifier, capability, createdAt: Date.now(), redirectUri: config.redirectUri });if(persisted)savePending(pendingMap);
    if (provider === 'google') {
      const qs = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: config.scopes,
        access_type: 'offline',
        include_granted_scopes: 'true',
        prompt: 'consent',
        state,
        code_challenge: pkceChallenge(verifier),
        code_challenge_method: 'S256',
      });
      return redirect(res, `${GOOGLE_AUTH}?${qs}`);
    }
    const tenant = encodeURIComponent(config.tenantId);
    const qs = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      response_mode: 'query',
      scope: config.scopes,
      state,
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: 'S256',
    });
    return redirect(res, `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${qs}`);
  }
  async function exchangeCode(req, provider, code, state) {
    const pendingMap=cleanupPending();
    const tx = pendingMap.get(state);
    pendingMap.delete(state);if(persisted)savePending(pendingMap);
    if (!tx || tx.provider !== provider || Date.now() - tx.createdAt > PENDING_TTL_MS) {
      throw Object.assign(new Error('OAuth state expired or is invalid.'), { status: 400, code: 'oauth_state_invalid' });
    }
    const config = connectorConfig(req)[provider];
    const form = new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: tx.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: tx.verifier,
    });
    let tokenUrl = GOOGLE_TOKEN;
    if (provider === 'microsoft') {
      tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`;
      form.set('scope', config.scopes);
    }
    const token = await jsonFetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
    const expiresAt = Date.now() + Math.max(60, Number(token.expires_in || 3600)) * 1000;
    const tokens = { accessToken: token.access_token, refreshToken: token.refresh_token || '', tokenType: token.token_type || 'Bearer', scope: token.scope || config.scopes, expiresAt };
    let user;
    if (provider === 'google') {
      user = await jsonFetch(GOOGLE_USERINFO, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
      user = { id: user.sub || '', email: user.email || '', name: user.name || user.email || 'Google user' };
    } else {
      const me = await jsonFetch(`${GRAPH}/me?$select=id,displayName,mail,userPrincipalName`, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
      user = { id: me.id || '', email: me.mail || me.userPrincipalName || '', name: me.displayName || me.mail || 'Microsoft user' };
    }
    const record = {
      id: randomToken(18),
      provider,
      capabilityHash: sha(tx.capability),
      tokenEnvelope: encryptTokens(tokens),
      user,
      location: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastUsedAt: null,
    };
    saveNewRecord(record);
    if (provider === 'google') {
      const folder = await ensureGoogleRoot(record);
      return { capability: tx.capability, record: folder };
    }
    return { capability: tx.capability, record };
  }
  async function refreshAccess(record, force = false) {
    const tokens = decryptTokens(record.tokenEnvelope);
    if (!force && tokens.accessToken && Number(tokens.expiresAt || 0) > Date.now() + 60000) return tokens.accessToken;
    if (!tokens.refreshToken) throw Object.assign(new Error('Cloud connection expired. Reconnect this provider.'), { status: 401, code: 'connector_reauth_required' });
    const cfg = connectorConfig({ headers: {}, socket: {} })[record.provider];
    const form = new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: tokens.refreshToken,
      grant_type: 'refresh_token',
    });
    let url = GOOGLE_TOKEN;
    if (record.provider === 'microsoft') {
      url = `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`;
      form.set('scope', cfg.scopes);
    }
    const fresh = await jsonFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
    const next = {
      ...tokens,
      accessToken: fresh.access_token,
      refreshToken: fresh.refresh_token || tokens.refreshToken,
      scope: fresh.scope || tokens.scope,
      expiresAt: Date.now() + Math.max(60, Number(fresh.expires_in || 3600)) * 1000,
    };
    const updated = updateRecord(record.id, r => { r.tokenEnvelope = encryptTokens(next); r.lastUsedAt = Date.now(); });
    record.tokenEnvelope = updated.tokenEnvelope;
    record.updatedAt = updated.updatedAt;
    return next.accessToken;
  }
  async function authorizedFetch(record, url, options = {}, retry = true) {
    const token = await refreshAccess(record, false);
    let r = await timedFetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` } });
    if (r.status === 401 && retry) {
      const fresh = await refreshAccess(record, true);
      r = await timedFetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${fresh}` } });
    }
    updateRecord(record.id, x => { x.lastUsedAt = Date.now(); });
    return r;
  }
  async function authorizedJson(record, url, options = {}) {
    const r = await authorizedFetch(record, url, options);
    const text = await r.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
    if (!r.ok) {
      const msg = payload?.error?.message || payload?.error_description || payload?.error || `Provider returned HTTP ${r.status}`;
      throw Object.assign(new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)), { status: r.status, payload });
    }
    return payload;
  }

  // ---------- Google Drive adapter ----------
  async function googleList(record, parentId) {
    const q = `'${String(parentId).replace(/'/g, "\\'")}' in parents and trashed=false`;
    const url = `${GOOGLE_DRIVE}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent('files(id,name,mimeType,modifiedTime,size)')}&pageSize=1000&spaces=drive`;
    const data = await authorizedJson(record, url);
    return Array.isArray(data.files) ? data.files : [];
  }
  async function googleFind(record, parentId, name) {
    const files = await googleList(record, parentId);
    return files.find(f => f.name === name) || null;
  }
  async function googleCreateFolder(record, parentId, name) {
    return authorizedJson(record, `${GOOGLE_DRIVE}/files?fields=id,name,mimeType,modifiedTime`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
    });
  }
  async function ensureGoogleRoot(record) {
    if (record.location?.rootFolderId) return record;
    let folder = await googleFind(record, 'root', 'Eve');
    if (!folder) folder = await googleCreateFolder(record, 'root', 'Eve');
    return updateRecord(record.id, r => { r.location = { rootFolderId: folder.id, displayName: 'My Drive / Eve', webUrl: 'https://drive.google.com/drive/my-drive' }; });
  }
  async function googleResolve(record, cloudPath, { createFolders = false, wantParent = false } = {}) {
    record = await ensureGoogleRoot(record);
    const parts = safeCloudPath(cloudPath).split('/');
    const filename = parts.pop();
    let parentId = record.location.rootFolderId;
    for (const segment of parts) {
      let child = await googleFind(record, parentId, segment);
      if (!child && createFolders) child = await googleCreateFolder(record, parentId, segment);
      if (!child || child.mimeType !== 'application/vnd.google-apps.folder') return null;
      parentId = child.id;
    }
    if (wantParent) return { parentId, name: filename };
    return googleFind(record, parentId, filename);
  }
  async function googleWrite(record, cloudPath, content) {
    const resolved = await googleResolve(record, cloudPath, { createFolders: true, wantParent: true });
    const existing = await googleFind(record, resolved.parentId, resolved.name);
    if (existing) {
      const r = await authorizedFetch(record, `${GOOGLE_UPLOAD}/files/${encodeURIComponent(existing.id)}?uploadType=media&fields=id,name,modifiedTime,size`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: String(content)
      });
      const text = await r.text(); if (!r.ok) throw Object.assign(new Error(`Google Drive write failed (${r.status})`), { status: r.status });
      return text ? JSON.parse(text) : { id: existing.id, name: existing.name };
    }
    const boundary = `eve_${randomToken(12)}`;
    const metadata = JSON.stringify({ name: resolved.name, parents: [resolved.parentId], mimeType: 'application/json' });
    const payload = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${String(content)}\r\n--${boundary}--`;
    return authorizedJson(record, `${GOOGLE_UPLOAD}/files?uploadType=multipart&fields=id,name,modifiedTime,size`, {
      method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: payload
    });
  }
  async function googleRead(record, cloudPath) {
    const item = await googleResolve(record, cloudPath);
    if (!item) return null;
    const r = await authorizedFetch(record, `${GOOGLE_DRIVE}/files/${encodeURIComponent(item.id)}?alt=media`);
    if (r.status === 404) return null;
    if (!r.ok) throw Object.assign(new Error(`Google Drive read failed (${r.status})`), { status: r.status });
    return { content: await r.text(), metadata: { id: item.id, name: item.name, modifiedAt: item.modifiedTime || null, size: Number(item.size || 0) || null } };
  }
  async function googleDelete(record, cloudPath) {
    const item = await googleResolve(record, cloudPath);
    if (!item) return false;
    const r = await authorizedFetch(record, `${GOOGLE_DRIVE}/files/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
    if (r.status === 404) return false;
    if (!r.ok) throw Object.assign(new Error(`Google Drive delete failed (${r.status})`), { status: r.status });
    return true;
  }
  async function googleListRecursive(record, prefix = '') {
    record = await ensureGoogleRoot(record);
    let parentId = record.location.rootFolderId;
    let base = '';
    if (prefix) {
      const clean = safeCloudPath(prefix);
      const segments = clean.split('/');
      for (const segment of segments) {
        const child = await googleFind(record, parentId, segment);
        if (!child || child.mimeType !== 'application/vnd.google-apps.folder') return [];
        parentId = child.id;
        base = base ? `${base}/${segment}` : segment;
      }
    }
    const out = [];
    const walk = async (folderId, current) => {
      if (out.length > 5000) throw Object.assign(new Error('Cloud listing exceeded safety limit.'), { status: 413 });
      const children = await googleList(record, folderId);
      for (const child of children) {
        const itemPath = current ? `${current}/${child.name}` : child.name;
        if (child.mimeType === 'application/vnd.google-apps.folder') await walk(child.id, itemPath);
        else out.push({ path: itemPath, modifiedAt: child.modifiedTime || null, size: Number(child.size || 0) || null, id: child.id });
      }
    };
    await walk(parentId, base);
    return out;
  }

  // ---------- Microsoft SharePoint adapter ----------
  async function graphListChildren(record, driveId, parentId) {
    let url = `${GRAPH}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentId)}/children?$select=id,name,folder,file,lastModifiedDateTime,size&$top=999`;
    const out = [];
    while (url) {
      const data = await authorizedJson(record, url);
      if (Array.isArray(data.value)) out.push(...data.value);
      url = data['@odata.nextLink'] || '';
      if (out.length > 5000) throw Object.assign(new Error('SharePoint folder contains too many items.'), { status: 413 });
    }
    return out;
  }
  async function graphFind(record, driveId, parentId, name) {
    const children = await graphListChildren(record, driveId, parentId);
    return children.find(x => x.name === name) || null;
  }
  async function graphCreateFolder(record, driveId, parentId, name) {
    return authorizedJson(record, `${GRAPH}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentId)}/children`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' })
    });
  }
  async function microsoftResolveSite(record, siteUrl) {
    let parsed;
    try { parsed = new URL(String(siteUrl || '').trim()); } catch { throw Object.assign(new Error('Enter a valid SharePoint site URL.'), { status: 400 }); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw Object.assign(new Error('SharePoint site URL must use HTTPS.'), { status: 400 });
    const rel = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
    const endpoint = rel ? `${GRAPH}/sites/${parsed.hostname}:${encodeURI(rel)}` : `${GRAPH}/sites/${parsed.hostname}`;
    const site = await authorizedJson(record, `${endpoint}?$select=id,displayName,name,webUrl`);
    const drives = await authorizedJson(record, `${GRAPH}/sites/${encodeURIComponent(site.id)}/drives?$select=id,name,webUrl,driveType`);
    return { site, drives: Array.isArray(drives.value) ? drives.value : [] };
  }
  async function configureMicrosoftLocation(record, { siteId, siteUrl, driveId, driveName }) {
    if (!siteId || !driveId) throw Object.assign(new Error('Choose a SharePoint document library.'), { status: 400 });
    const drives = await authorizedJson(record, `${GRAPH}/sites/${encodeURIComponent(siteId)}/drives?$select=id,name,webUrl,driveType`);
    const drive = (drives.value || []).find(x => x.id === driveId);
    if (!drive) throw Object.assign(new Error('The selected document library is not available.'), { status: 404 });
    const rootItem = await authorizedJson(record, `${GRAPH}/drives/${encodeURIComponent(driveId)}/root?$select=id,name,webUrl`);
    let folder = await graphFind(record, driveId, rootItem.id, 'Eve');
    if (!folder) folder = await graphCreateFolder(record, driveId, rootItem.id, 'Eve');
    return updateRecord(record.id, r => {
      r.location = { siteId, siteUrl: String(siteUrl || ''), driveId, driveName: driveName || drive.name || 'Documents', rootFolderId: folder.id, displayName: `${driveName || drive.name || 'Documents'} / Eve`, webUrl: folder.webUrl || drive.webUrl || String(siteUrl || '') };
    });
  }
  function assertMicrosoftLocation(record) {
    if (!record.location?.driveId || !record.location?.rootFolderId) throw Object.assign(new Error('Choose a SharePoint site and document library first.'), { status: 409, code: 'sharepoint_location_required' });
  }
  async function microsoftResolve(record, cloudPath, { createFolders = false, wantParent = false } = {}) {
    assertMicrosoftLocation(record);
    const parts = safeCloudPath(cloudPath).split('/');
    const filename = parts.pop();
    let parentId = record.location.rootFolderId;
    for (const segment of parts) {
      let child = await graphFind(record, record.location.driveId, parentId, segment);
      if (!child && createFolders) child = await graphCreateFolder(record, record.location.driveId, parentId, segment);
      if (!child || !child.folder) return null;
      parentId = child.id;
    }
    if (wantParent) return { parentId, name: filename };
    return graphFind(record, record.location.driveId, parentId, filename);
  }
  async function microsoftWrite(record, cloudPath, content) {
    const resolved = await microsoftResolve(record, cloudPath, { createFolders: true, wantParent: true });
    const url = `${GRAPH}/drives/${encodeURIComponent(record.location.driveId)}/items/${encodeURIComponent(resolved.parentId)}:/${encodeGraphName(resolved.name)}:/content`;
    return authorizedJson(record, url, { method: 'PUT', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: String(content) });
  }
  async function microsoftRead(record, cloudPath) {
    const item = await microsoftResolve(record, cloudPath);
    if (!item) return null;
    const r = await authorizedFetch(record, `${GRAPH}/drives/${encodeURIComponent(record.location.driveId)}/items/${encodeURIComponent(item.id)}/content`);
    if (r.status === 404) return null;
    if (!r.ok) throw Object.assign(new Error(`SharePoint read failed (${r.status})`), { status: r.status });
    return { content: await r.text(), metadata: { id: item.id, name: item.name, modifiedAt: item.lastModifiedDateTime || null, size: Number(item.size || 0) || null } };
  }
  async function microsoftDelete(record, cloudPath) {
    const item = await microsoftResolve(record, cloudPath);
    if (!item) return false;
    const r = await authorizedFetch(record, `${GRAPH}/drives/${encodeURIComponent(record.location.driveId)}/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
    if (r.status === 404) return false;
    if (!r.ok) throw Object.assign(new Error(`SharePoint delete failed (${r.status})`), { status: r.status });
    return true;
  }
  async function microsoftListRecursive(record, prefix = '') {
    assertMicrosoftLocation(record);
    let parentId = record.location.rootFolderId;
    let base = '';
    if (prefix) {
      const segments = safeCloudPath(prefix).split('/');
      for (const segment of segments) {
        const child = await graphFind(record, record.location.driveId, parentId, segment);
        if (!child || !child.folder) return [];
        parentId = child.id;
        base = base ? `${base}/${segment}` : segment;
      }
    }
    const out = [];
    const walk = async (folderId, current) => {
      if (out.length > 5000) throw Object.assign(new Error('Cloud listing exceeded safety limit.'), { status: 413 });
      const children = await graphListChildren(record, record.location.driveId, folderId);
      for (const child of children) {
        const itemPath = current ? `${current}/${child.name}` : child.name;
        if (child.folder) await walk(child.id, itemPath);
        else out.push({ path: itemPath, modifiedAt: child.lastModifiedDateTime || null, size: Number(child.size || 0) || null, id: child.id });
      }
    };
    await walk(parentId, base);
    return out;
  }

  async function providerWrite(record, cloudPath, content) { return record.provider === 'google' ? googleWrite(record, cloudPath, content) : microsoftWrite(record, cloudPath, content); }
  async function providerRead(record, cloudPath) { return record.provider === 'google' ? googleRead(record, cloudPath) : microsoftRead(record, cloudPath); }
  async function providerDelete(record, cloudPath) { return record.provider === 'google' ? googleDelete(record, cloudPath) : microsoftDelete(record, cloudPath); }
  async function providerList(record, prefix) { return record.provider === 'google' ? googleListRecursive(record, prefix) : microsoftListRecursive(record, prefix); }
  function capFrom(req, url, data = null) { return String(req.headers['x-eve-connector'] || url.searchParams.get('cap') || data?.capability || data?.cap || ''); }
  function requireRecord(req, url, data = null) {
    const record = findRecordByCapability(capFrom(req, url, data));
    if (!record) throw Object.assign(new Error('Cloud connector capability is invalid or has expired.'), { status: 401, code: 'connector_capability_invalid' });
    return record;
  }

  function roleOrLocal(req, res, role = 'researcher') {
    if (!authConfigured()) return { local: true, membership: { role: 'admin' } };
    return typeof requireRole === 'function' ? requireRole(req, res, role) : null;
  }

  async function handle(req, res, url) {
    if (!url.pathname.startsWith('/api/connectors/')) return false;
    try {
      const role = url.pathname === '/api/connectors/config' ? 'viewer' : 'researcher';
      if (!roleOrLocal(req, res, role)) return true;
      if (url.pathname === '/api/connectors/config' && req.method === 'GET') {
        const c = connectorConfig(req);
        return json(res, 200, { ok: true, google: { configured: c.google.configured, redirectUri: c.google.redirectUri, scopes: c.google.scopes }, microsoft: { configured: c.microsoft.configured, redirectUri: c.microsoft.redirectUri, scopes: c.microsoft.scopes, tenantId: c.microsoft.tenantId } });
      }
      let m = url.pathname.match(/^\/api\/connectors\/(google|microsoft)\/start$/);
      if (m && req.method === 'GET') return startOAuth(req, res, m[1]);
      m = url.pathname.match(/^\/api\/connectors\/(google|microsoft)\/callback$/);
      if (m && req.method === 'GET') {
        const provider = m[1], error = url.searchParams.get('error'), code = url.searchParams.get('code'), state = url.searchParams.get('state');
        if (error) return sendHtml(res, 400, callbackHtml({ ok: false, provider, message: url.searchParams.get('error_description') || error }));
        if (!code || !state) return sendHtml(res, 400, callbackHtml({ ok: false, provider, message: 'OAuth callback is missing required values.' }));
        try {
          const out = await exchangeCode(req, provider, code, state);
          return sendHtml(res, 200, callbackHtml({ ok: true, provider, capability: out.capability, connection: publicRecord(out.record) }));
        } catch (err) {
          return sendHtml(res, err.status || 500, callbackHtml({ ok: false, provider, message: err.message }));
        }
      }
      if (url.pathname === '/api/connectors/status' && req.method === 'GET') {
        const record = requireRecord(req, url);
        return json(res, 200, { ok: true, connection: publicRecord(record) });
      }
      if (url.pathname === '/api/connectors/test' && req.method === 'POST') {
        const data = await body(req, 64 * 1024), record = requireRecord(req, url, data);
        if (record.provider === 'google') await ensureGoogleRoot(record);
        else { assertMicrosoftLocation(record); await graphListChildren(record, record.location.driveId, record.location.rootFolderId); }
        const fresh = findRecordByCapability(capFrom(req, url, data));
        return json(res, 200, { ok: true, connection: publicRecord(fresh), testedAt: Date.now() });
      }
      if (url.pathname === '/api/connectors/disconnect' && req.method === 'POST') {
        const data = await body(req, 64 * 1024), record = requireRecord(req, url, data); deleteRecord(record.id); return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/connectors/microsoft/site' && req.method === 'POST') {
        const data = await body(req, 128 * 1024), record = requireRecord(req, url, data);
        if (record.provider !== 'microsoft') throw Object.assign(new Error('Microsoft connector required.'), { status: 400 });
        const result = await microsoftResolveSite(record, data.siteUrl);
        return json(res, 200, { ok: true, site: result.site, drives: result.drives });
      }
      if (url.pathname === '/api/connectors/microsoft/location' && req.method === 'POST') {
        const data = await body(req, 128 * 1024), record = requireRecord(req, url, data);
        if (record.provider !== 'microsoft') throw Object.assign(new Error('Microsoft connector required.'), { status: 400 });
        const updated = await configureMicrosoftLocation(record, data);
        return json(res, 200, { ok: true, connection: publicRecord(updated) });
      }
      if (url.pathname === '/api/connectors/files' && req.method === 'PUT') {
        const data = await body(req, MAX_CONNECTOR_BODY), record = requireRecord(req, url, data), cloudPath = safeCloudPath(data.path || url.searchParams.get('path'));
        if (typeof data.content !== 'string') throw Object.assign(new Error('Encrypted cloud file content must be a string.'), { status: 400 });
        const result = await providerWrite(record, cloudPath, data.content);
        return json(res, 200, { ok: true, path: cloudPath, provider: record.provider, metadata: result || null });
      }
      if (url.pathname === '/api/connectors/files' && req.method === 'GET') {
        const record = requireRecord(req, url), cloudPath = safeCloudPath(url.searchParams.get('path'));
        const result = await providerRead(record, cloudPath);
        if (!result) return json(res, 404, { ok: false, error: 'cloud_file_not_found', path: cloudPath });
        return json(res, 200, { ok: true, path: cloudPath, provider: record.provider, content: result.content, metadata: result.metadata || null });
      }
      if (url.pathname === '/api/connectors/files' && req.method === 'DELETE') {
        const data = await body(req, 64 * 1024), record = requireRecord(req, url, data), cloudPath = safeCloudPath(data.path || url.searchParams.get('path'));
        const deleted = await providerDelete(record, cloudPath);
        return json(res, 200, { ok: true, deleted, path: cloudPath });
      }
      if (url.pathname === '/api/connectors/files/list' && req.method === 'GET') {
        const record = requireRecord(req, url), prefix = safeCloudPath(url.searchParams.get('prefix') || '', { allowEmpty: true });
        const files = await providerList(record, prefix);
        return json(res, 200, { ok: true, provider: record.provider, prefix, files });
      }
      return false;
    } catch (err) {
      const status = Number(err.status) || 500;
      return json(res, status, { ok: false, error: err.code || 'connector_error', message: status >= 500 && !err.status ? 'Cloud connector failed.' : err.message });
    }
  }

  return {
    handle,
    safeCloudPath,
    encryptTokens,
    decryptTokens,
    _test: { loadVault, saveVault, publicRecord, findRecordByCapability, providerId, connectorConfig, pkceChallenge },
  };
}

module.exports = { createCloudConnectorService, safeCloudPath, providerId, pkceChallenge };
