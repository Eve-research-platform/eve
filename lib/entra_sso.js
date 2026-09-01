'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATE_TTL_MS = 10 * 60 * 1000;

function sha(v) { return crypto.createHash('sha256').update(String(v || '')).digest('base64url'); }
function random(n = 32) { return crypto.randomBytes(n).toString('base64url'); }
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
function safeNext(v) {
  const s = String(v || '/');
  return s.startsWith('/') && !s.startsWith('//') && !/[\r\n]/.test(s) ? s.slice(0, 3000) : '/';
}
function redirect(res, location) {
  res.writeHead(302, { 'Location': location, 'Cache-Control': 'no-store', 'Pragma': 'no-cache' });
  res.end();
  return true;
}

function createEntraSso({ dataDir, json, control, fetchImpl = global.fetch, stateStore = null }) {
  const tenant = String(process.env.EVE_ENTRA_TENANT_ID || process.env.EVE_M365_TENANT_ID || 'organizations').trim();
  const clientId = String(process.env.EVE_ENTRA_CLIENT_ID || process.env.EVE_MICROSOFT_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.EVE_ENTRA_CLIENT_SECRET || process.env.EVE_MICROSOFT_CLIENT_SECRET || '');
  const publicOrigin = String(process.env.EVE_PUBLIC_ORIGIN || '').trim().replace(/\/+$/, '');
  const graphBase = String(process.env.EVE_GRAPH_BASE_URL || 'https://graph.microsoft.com/v1.0').replace(/\/+$/, '');
  const stateFile = path.join(dataDir, 'control-plane', 'entra-auth-states.json');
  const persisted=stateStore?.scope('entra-sso',{states:{legacyFile:stateFile,fallback:[]}});
  const loadStates=()=>persisted?persisted.read('states',[]):readJson(stateFile,[]);
  const saveStates=rows=>persisted?persisted.write('states',rows):atomicWrite(stateFile,rows);

  function status() {
    return {
      configured: !!(tenant && clientId && clientSecret && publicOrigin),
      provider: 'microsoft_entra',
      tenant,
      redirectUri: publicOrigin ? `${publicOrigin}/api/auth/microsoft/callback` : null,
    };
  }

  async function handle(req, res, url) {
    if (url.pathname === '/api/auth/microsoft/status' && req.method === 'GET') {
      return json(res, 200, { ok: true, ...status() });
    }
    if (url.pathname === '/api/auth/microsoft/start' && req.method === 'GET') {
      if (!status().configured) return json(res, 503, { ok: false, error: 'entra_not_configured' });

      const rawState = random(32), verifier = random(48), challenge = sha(verifier);
      const now = Date.now();
      let rows = loadStates().filter(x => Number(x.expiresAt) > now).slice(-500);
      rows.push({
        stateHash: sha(rawState), verifier, next: safeNext(url.searchParams.get('next')),
        createdAt: now, expiresAt: now + STATE_TTL_MS,
      });
      saveStates(rows);

      const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: `${publicOrigin}/api/auth/microsoft/callback`,
        response_mode: 'query',
        scope: 'openid profile email User.Read',
        state: rawState,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      });
      return redirect(res, `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize?${params.toString()}`);
    }
    if (url.pathname === '/api/auth/microsoft/callback' && req.method === 'GET') {
      if (!status().configured) return json(res, 503, { ok: false, error: 'entra_not_configured' });
      const rawState = String(url.searchParams.get('state') || '');
      const code = String(url.searchParams.get('code') || '');
      const providerError = String(url.searchParams.get('error') || '');
      const now = Date.now();
      let rows = loadStates().filter(x => Number(x.expiresAt) > now);
      const row = rows.find(x => x.stateHash === sha(rawState));
      rows = rows.filter(x => x !== row);
      saveStates(rows);

      const next = safeNext(row?.next || '/');
      if (providerError) return redirect(res, `/?authError=${encodeURIComponent(providerError)}`);
      if (!row || !code) return json(res, 400, { ok: false, error: 'invalid_or_expired_auth_state' });

      const form = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${publicOrigin}/api/auth/microsoft/callback`,
        scope: 'openid profile email User.Read',
        code_verifier: row.verifier,
      });
      const tokenRes = await fetchImpl(
        `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form.toString(),
        }
      );
      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokenData.access_token) {
        return json(res, 502, {
          ok: false, error: 'entra_token_exchange_failed',
          message: tokenData.error_description || tokenData.error || `HTTP ${tokenRes.status}`,
        });
      }

      const meRes = await fetchImpl(`${graphBase}/me?$select=id,displayName,mail,userPrincipalName`, {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}`, 'Accept': 'application/json' },
      });
      const me = await meRes.json().catch(() => ({}));
      if (!meRes.ok || !me.id) {
        return json(res, 502, { ok: false, error: 'entra_profile_failed', message: me?.error?.message || `HTTP ${meRes.status}` });
      }
      const email = String(me.mail || me.userPrincipalName || '').trim().toLowerCase();
      try {
        control.externalSignIn(req, res, {
          provider: 'microsoft_entra',
          subject: String(me.id),
          email,
          name: String(me.displayName || email),
        });
      } catch (err) {
        return json(res, err.status || 403, { ok: false, error: err.code || 'entra_sign_in_failed', message: err.message });
      }
      return redirect(res, next);
    }
    return false;
  }

  return { handle, status };
}

module.exports = { createEntraSso, safeNext };
