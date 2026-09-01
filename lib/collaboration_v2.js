'use strict';

const fs = require('fs');
const path = require('path');

const LEASE_TTL_MS = Math.max(30_000, Math.min(5 * 60_000, Number(process.env.EVE_RESOURCE_LEASE_TTL_MS || 75_000)));
const PRESENCE_TTL_MS = Math.max(15_000, Math.min(2 * 60_000, Number(process.env.EVE_RESOURCE_PRESENCE_TTL_MS || 45_000)));

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
function cleanId(v, max = 180) {
  const s = String(v || '').trim().slice(0, max);
  return /^[A-Za-z0-9_.:-]+$/.test(s) ? s : '';
}
function resourceKind(resourceId) {
  if (['study:meta','study:structure','settings','send','review'].includes(resourceId)) return resourceId;
  if (/^page:[A-Za-z0-9_.-]+$/.test(resourceId)) return 'page';
  if (/^block:[A-Za-z0-9_.-]+$/.test(resourceId)) return 'block';
  return '';
}
function validResource(resourceId) {
  return !!resourceKind(resourceId);
}
function identity(auth) {
  return { id: auth.user.id, name: auth.user.name || '', email: auth.user.email || '' };
}
function conflict(a, b) {
  if (!a || !b) return false;
  if (a.resourceId === b.resourceId) return true;

  const ak = resourceKind(a.resourceId), bk = resourceKind(b.resourceId);
  if (ak === 'study:structure' && ['study:meta','page','block'].includes(bk)) return true;
  if (bk === 'study:structure' && ['study:meta','page','block'].includes(ak)) return true;

  if (ak === 'page' && bk === 'block' && b.parentResourceId === a.resourceId) return true;
  if (bk === 'page' && ak === 'block' && a.parentResourceId === b.resourceId) return true;

  return false;
}

function createCollaborationV2({ dataDir, json, body, requireRole, appendAudit, stateStore = null }) {
  const dir = path.join(dataDir, 'control-plane');
  const files = {
    leases: path.join(dir, 'resource-leases.json'),
    presence: path.join(dir, 'resource-presence.json'),
    revisions: path.join(dir, 'resource-revisions.json'),
  };
  const persisted=stateStore?.scope('collaboration-v2',Object.fromEntries(Object.entries(files).map(([k,file])=>[k,{legacyFile:file,fallback:[]}])));
  const load = k => persisted ? persisted.read(k,[]) : readJson(files[k], []);
  const save = (k, v) => persisted ? persisted.write(k,v) : atomicWrite(files[k], v);
  const compactLeases = rows => rows.filter(x => x && Number(x.expiresAt) > Date.now()).slice(-10000);
  const compactPresence = rows => rows.filter(x => x && Number(x.seenAt) >= Date.now() - PRESENCE_TTL_MS).slice(-10000);

  function snapshot(auth, studyId) {
    const leases = compactLeases(load('leases')).filter(x => x.orgId === auth.org.id && x.studyId === studyId);
    const presence = compactPresence(load('presence')).filter(x => x.orgId === auth.org.id && x.studyId === studyId);
    const revisions = load('revisions').filter(x => x.orgId === auth.org.id && x.studyId === studyId);
    return { leases, presence, revisions, leaseTtlMs: LEASE_TTL_MS, presenceTtlMs: PRESENCE_TTL_MS };
  }

  async function handle(req, res, url) {
    let m = url.pathname.match(/^\/api\/collaboration-v2\/([A-Za-z0-9_.-]+)\/status$/);
    if (m && req.method === 'GET') {
      const auth = requireRole(req, res, 'viewer'); if (!auth) return true;
      const leases = compactLeases(load('leases')); save('leases', leases);
      const presence = compactPresence(load('presence')); save('presence', presence);
      return json(res, 200, { ok: true, ...snapshot(auth, m[1]) });
    }

    m = url.pathname.match(/^\/api\/collaboration-v2\/([A-Za-z0-9_.-]+)\/presence$/);
    if (m && req.method === 'POST') {
      const auth = requireRole(req, res, 'viewer'); if (!auth) return true;
      const data = await body(req);
      const clientId = cleanId(data.clientId);
      const resourceId = validResource(cleanId(data.resourceId)) ? cleanId(data.resourceId) : 'review';
      const parentResourceId = validResource(cleanId(data.parentResourceId)) ? cleanId(data.parentResourceId) : null;
      if (!clientId) return json(res, 400, { ok: false, error: 'client_id_required' });
      let rows = compactPresence(load('presence'));
      const row = rows.find(x => x.orgId === auth.org.id && x.studyId === m[1] && x.userId === auth.user.id && x.clientId === clientId);
      const next = {
        orgId: auth.org.id, studyId: m[1], userId: auth.user.id, user: identity(auth),
        clientId, resourceId, parentResourceId,
        view: ['builder','settings','send','review'].includes(data.view) ? data.view : 'review',
        seenAt: Date.now(),
      };
      if (row) Object.assign(row, next); else rows.push(next);
      save('presence', rows);
      return json(res, 200, { ok: true, ...snapshot(auth, m[1]) });
    }

    m = url.pathname.match(/^\/api\/collaboration-v2\/([A-Za-z0-9_.-]+)\/resources\/([^/]+)\/lease$/);
    if (m) {
      const auth = requireRole(req, res, 'researcher'); if (!auth) return true;
      const studyId = m[1], resourceId = cleanId(decodeURIComponent(m[2]));
      if (!validResource(resourceId)) return json(res, 400, { ok: false, error: 'invalid_resource' });

      if (req.method === 'POST') {
        const data = await body(req), clientId = cleanId(data.clientId);
        const parentResourceId = validResource(cleanId(data.parentResourceId)) ? cleanId(data.parentResourceId) : null;
        if (!clientId) return json(res, 400, { ok: false, error: 'client_id_required' });
        let rows = compactLeases(load('leases'));
        const requested = { resourceId, parentResourceId };
        const conflicts = rows.filter(x =>
          x.orgId === auth.org.id && x.studyId === studyId &&
          !(x.userId === auth.user.id && x.clientId === clientId) &&
          conflict(requested, x)
        );
        const force = data.force === true && auth.membership.role === 'admin';
        if (conflicts.length && !force) {
          return json(res, 409, { ok: false, error: 'resource_edit_locked', conflicts });
        }
        if (force && conflicts.length) {
          const ids = new Set(conflicts.map(x => x.id));
          rows = rows.filter(x => !ids.has(x.id));
        }
        const now = Date.now();
        let row = rows.find(x =>
          x.orgId === auth.org.id && x.studyId === studyId &&
          x.resourceId === resourceId && x.userId === auth.user.id && x.clientId === clientId
        );
        if (row) {
          row.parentResourceId = parentResourceId;
          row.expiresAt = now + LEASE_TTL_MS;
        } else {
          row = {
            id: `rlease_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
            orgId: auth.org.id, studyId, resourceId, parentResourceId,
            userId: auth.user.id, user: identity(auth), clientId,
            acquiredAt: now, expiresAt: now + LEASE_TTL_MS,
          };
          rows.push(row);
        }
        save('leases', rows);
        appendAudit(auth, 'edit_acquired', { studyId });
        return json(res, 200, { ok: true, lease: row, ...snapshot(auth, studyId) });
      }

      if (req.method === 'PATCH') {
        const data = await body(req), clientId = cleanId(data.clientId);
        let rows = compactLeases(load('leases'));
        const row = rows.find(x =>
          x.orgId === auth.org.id && x.studyId === studyId && x.resourceId === resourceId &&
          x.userId === auth.user.id && x.clientId === clientId
        );
        if (!row) return json(res, 409, { ok: false, error: 'resource_lease_lost' });
        row.expiresAt = Date.now() + LEASE_TTL_MS;
        save('leases', rows);
        return json(res, 200, { ok: true, lease: row });
      }

      if (req.method === 'DELETE') {
        const data = await body(req).catch(() => ({})), clientId = cleanId(data.clientId);
        let rows = compactLeases(load('leases'));
        const before = rows.length;
        rows = rows.filter(x => !(
          x.orgId === auth.org.id && x.studyId === studyId && x.resourceId === resourceId &&
          x.userId === auth.user.id && (!clientId || x.clientId === clientId)
        ));
        save('leases', rows);
        if (rows.length !== before) appendAudit(auth, 'edit_released', { studyId });
        return json(res, 200, { ok: true });
      }
    }

    m = url.pathname.match(/^\/api\/collaboration-v2\/([A-Za-z0-9_.-]+)\/resources\/([^/]+)\/revision$/);
    if (m && req.method === 'PUT') {
      const auth = requireRole(req, res, 'researcher'); if (!auth) return true;
      const studyId = m[1], resourceId = cleanId(decodeURIComponent(m[2]));
      if (!validResource(resourceId)) return json(res, 400, { ok: false, error: 'invalid_resource' });
      const data = await body(req);
      for (const forbidden of ['content','workspace','answers','responses','payload','plaintext']) {
        if (Object.prototype.hasOwnProperty.call(data, forbidden)) {
          return json(res, 400, { ok: false, error: 'research_content_not_accepted' });
        }
      }
      let rows = load('revisions');
      let row = rows.find(x => x.orgId === auth.org.id && x.studyId === studyId && x.resourceId === resourceId);
      const expected = Math.max(0, Number(data.expectedRevision || 0));
      if (row && expected !== Number(row.revision || 0)) {
        return json(res, 409, { ok: false, error: 'resource_revision_conflict', revision: row });
      }
      const next = {
        orgId: auth.org.id, studyId, resourceId,
        parentResourceId: validResource(cleanId(data.parentResourceId)) ? cleanId(data.parentResourceId) : null,
        revision: Number(row?.revision || 0) + 1,
        digest: cleanId(data.digest, 128) || null,
        updatedAt: Date.now(), updatedBy: auth.user.id,
      };
      if (row) Object.assign(row, next); else rows.push(next);
      save('revisions', rows);
      appendAudit(auth, 'study_saved', { studyId });
      return json(res, 200, { ok: true, revision: next });
    }

    return false;
  }

  return { handle, conflict, validResource, resourceKind };
}

module.exports = { createCollaborationV2, conflict, validResource, resourceKind, LEASE_TTL_MS, PRESENCE_TTL_MS };
