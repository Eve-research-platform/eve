'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const COOKIE = 'eve_session';
const SESSION_TTL_MS = Math.max(60_000, Number(process.env.EVE_SESSION_TTL_MS || 12 * 60 * 60 * 1000));
const MAX_SESSIONS_PER_USER = 10;
const PRESENCE_TTL_MS = Math.max(15_000, Math.min(120_000, Number(process.env.EVE_PRESENCE_TTL_MS || 45_000)));
const LEASE_TTL_MS = Math.max(30_000, Math.min(5 * 60_000, Number(process.env.EVE_EDIT_LEASE_TTL_MS || 90_000)));
const AUDIT_LIMIT = 5000;
const ROLES = Object.freeze({ viewer: 1, researcher: 2, admin: 3 });

function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function cleanEmail(v) {
  const s = String(v || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
}
function cleanName(v, fallback = '') {
  return String(v || fallback).trim().replace(/\s+/g, ' ').slice(0, 120);
}
function cleanText(v, max = 240) {
  return String(v == null ? '' : v).replace(/\u0000/g, '').trim().slice(0, max);
}
function safeId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString('base64url')}`;
}
function token() { return crypto.randomBytes(32).toString('base64url'); }
function sha(v) { return crypto.createHash('sha256').update(String(v || '')).digest('base64url'); }
function equalHash(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function passwordRecord(password) {
  const raw = String(password || '');
  if (raw.length < 10) throw Object.assign(new Error('Password must be at least 10 characters.'), { status: 400 });
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(raw, salt, 64);
  return { scheme: 'scrypt-v1', salt: salt.toString('base64url'), hash: hash.toString('base64url') };
}
function verifyPassword(password, rec) {
  if (!rec || rec.scheme !== 'scrypt-v1') return false;
  try {
    const salt = Buffer.from(rec.salt, 'base64url');
    const expected = Buffer.from(rec.hash, 'base64url');
    const actual = crypto.scryptSync(String(password || ''), salt, expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch { return false; }
}
function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const k = part.slice(0, i).trim();
    const raw = part.slice(i + 1).trim();
    try { out[k] = decodeURIComponent(raw); } catch { out[k] = raw; }
  }
  return out;
}
function secureRequest(req) {
  return !!(req.socket && req.socket.encrypted) ||
    String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase() === 'https';
}
function setSessionCookie(req, res, value, maxAgeSec) {
  const bits = [
    `${COOKIE}=${encodeURIComponent(value || '')}`,
    'Path=/', 'HttpOnly', 'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSec || 0))}`,
  ];
  if (secureRequest(req) || String(process.env.NODE_ENV || '').toLowerCase() === 'production') bits.push('Secure');
  res.setHeader('Set-Cookie', bits.join('; '));
}
function requestOrigin(req) {
  const configured = String(process.env.EVE_PUBLIC_ORIGIN || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const proto = String(req.headers['x-forwarded-proto'] || (secureRequest(req) ? 'https' : 'http')).split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
}

function createControlPlane({ dataDir, json, body, mailer = null, stateStore = null }) {
  if (!dataDir) throw new Error('control plane requires dataDir');
  const dir = path.join(dataDir, 'control-plane');
  fs.mkdirSync(dir, { recursive: true });
  const files = {
    users: path.join(dir, 'users.json'),
    orgs: path.join(dir, 'organisations.json'),
    memberships: path.join(dir, 'memberships.json'),
    sessions: path.join(dir, 'sessions.json'),
    invitations: path.join(dir, 'team-invitations.json'),
    revisions: path.join(dir, 'collaboration-revisions.json'),
    presence: path.join(dir, 'collaboration-presence.json'),
    leases: path.join(dir, 'collaboration-leases.json'),
    audit: path.join(dir, 'activity-audit.json'),
  };

  const persisted=stateStore?.scope('control-plane',Object.fromEntries(Object.entries(files).map(([k,file])=>[k,{legacyFile:file,fallback:[]}])));
  const load = key => persisted ? persisted.read(key,[]) : readJson(files[key], []);
  const save = (key, value) => persisted ? persisted.write(key,value) : atomicWrite(files[key], value);
  function compactSessions(rows) {
    const now = Date.now();
    return rows.filter(x => x && Number(x.expiresAt) > now).slice(-5000);
  }
  function compactPresence(rows) {
    const cutoff = Date.now() - PRESENCE_TTL_MS;
    return rows.filter(x => x && Number(x.seenAt) >= cutoff).slice(-5000);
  }
  function compactLeases(rows) {
    const now = Date.now();
    return rows.filter(x => x && Number(x.expiresAt) > now).slice(-5000);
  }
  function appendAudit(auth, event, data = {}) {
    if (!auth?.org?.id || !auth?.user?.id) return;
    const allow = new Set([
      'login','logout','member_invited','member_joined','member_role_changed','member_removed',
      'profile_updated','password_changed','study_opened','edit_acquired','edit_released',
      'study_saved','study_published','recruitment_sent','panel_study_registered','panel_member_removed'
    ]);
    if (!allow.has(event)) return;
    const rows = load('audit');
    rows.push({
      id: safeId('evt'), orgId: auth.org.id, userId: auth.user.id, event,
      studyId: cleanText(data.studyId, 180) || null,
      count: Number.isFinite(Number(data.count)) ? Number(data.count) : undefined,
      createdAt: Date.now(),
    });
    save('audit', rows.slice(-AUDIT_LIMIT));
  }
  function orgForUser(userId, preferredOrgId = '') {
    const memberships = load('memberships').filter(m => m.userId === userId && m.status === 'active');
    const mem = memberships.find(m => m.orgId === preferredOrgId) || memberships[0];
    if (!mem) return null;
    const org = load('orgs').find(o => o.id === mem.orgId) || null;
    return org ? { org, membership: mem } : null;
  }
  function publicUser(u) {
    return u ? {
      id: u.id,
      email: u.email,
      name: u.name,
      createdAt: u.createdAt,
      hasPassword: !!u.password,
      providers: Array.isArray(u.identities) ? [...new Set(u.identities.map(x => x && x.provider).filter(Boolean))] : [],
    } : null;
  }
  function publicMembership(m) {
    return m ? { id: m.id, userId: m.userId, orgId: m.orgId, role: m.role, status: m.status, createdAt: m.createdAt } : null;
  }
  function bootstrap() {
    const email = cleanEmail(process.env.EVE_BOOTSTRAP_EMAIL);
    const password = String(process.env.EVE_BOOTSTRAP_PASSWORD || '');
    if (!email || !password) return { configured: load('users').length > 0, bootstrapped: false };
    const users = load('users');
    if (users.length) return { configured: true, bootstrapped: false };
    const now = Date.now();
    const user = {
      id: safeId('usr'), email,
      name: cleanName(process.env.EVE_BOOTSTRAP_NAME, email.split('@')[0]),
      password: passwordRecord(password), createdAt: now, updatedAt: now,
    };
    const org = {
      id: safeId('org'), name: cleanName(process.env.EVE_ORG_NAME, 'Eve workspace'),
      createdAt: now, updatedAt: now,
    };
    const membership = {
      id: safeId('mem'), userId: user.id, orgId: org.id, role: 'admin', status: 'active',
      createdAt: now, updatedAt: now,
    };
    save('users', [user]); save('orgs', [org]); save('memberships', [membership]);
    return { configured: true, bootstrapped: true };
  }
  bootstrap();

  function sessionFromReq(req) {
    const raw = cookies(req)[COOKIE];
    if (!raw) return null;
    const hash = sha(raw);
    let sessions = compactSessions(load('sessions'));
    const sess = sessions.find(s => equalHash(s.tokenHash, hash));
    if (!sess) { save('sessions', sessions); return null; }
    const user = load('users').find(u => u.id === sess.userId);
    if (!user) return null;
    const orgState = orgForUser(user.id, sess.orgId);
    if (!orgState) return null;
    return { token: raw, session: sess, user, ...orgState };
  }
  function requireRole(req, res, minimum = 'viewer') {
    const auth = sessionFromReq(req);
    if (!auth) { json(res, 401, { ok: false, error: 'authentication_required' }); return null; }
    if ((ROLES[auth.membership.role] || 0) < (ROLES[minimum] || 0)) {
      json(res, 403, { ok: false, error: 'insufficient_role', requiredRole: minimum, role: auth.membership.role });
      return null;
    }
    return auth;
  }
  function collaborationSnapshot(auth, studyId) {
    const users = new Map(load('users').map(u => [u.id, u]));
    const presence = compactPresence(load('presence'))
      .filter(x => x.orgId === auth.org.id && x.studyId === studyId)
      .map(x => ({
        userId: x.userId, clientId: x.clientId, view: x.view, seenAt: x.seenAt,
        user: publicUser(users.get(x.userId)),
      }));
    const leaseRaw = compactLeases(load('leases')).find(x => x.orgId === auth.org.id && x.studyId === studyId) || null;
    const lease = leaseRaw ? {
      userId: leaseRaw.userId, clientId: leaseRaw.clientId, acquiredAt: leaseRaw.acquiredAt,
      expiresAt: leaseRaw.expiresAt, user: publicUser(users.get(leaseRaw.userId)),
    } : null;
    const revision = load('revisions').find(x => x.orgId === auth.org.id && x.studyId === studyId) || null;
    return { presence, lease, revision, presenceTtlMs: PRESENCE_TTL_MS, leaseTtlMs: LEASE_TTL_MS };
  }


  function createSessionFor(req, res, user, orgState) {
    const raw = token();
    let sessions = compactSessions(load('sessions'))
      .filter(s => s.userId !== user.id || Number(s.createdAt) > Date.now() - SESSION_TTL_MS * 2);
    const userSessions = sessions.filter(s => s.userId === user.id).sort((a,b) => a.createdAt - b.createdAt);
    while (userSessions.length >= MAX_SESSIONS_PER_USER) {
      const drop = userSessions.shift();
      sessions = sessions.filter(s => s.id !== drop.id);
    }
    const sess = {
      id: safeId('ses'),
      userId: user.id,
      orgId: orgState.org.id,
      tokenHash: sha(raw),
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
    sessions.push(sess);
    save('sessions', sessions);
    setSessionCookie(req, res, raw, SESSION_TTL_MS / 1000);
    return sess;
  }

  function activeInvitationFor(email) {
    const now = Date.now();
    return load('invitations').find(x =>
      !x.acceptedAt &&
      Number(x.expiresAt) > now &&
      x.email === email
    ) || null;
  }

  function activateInvitationForUser(user, invitation) {
    if (!user || !invitation) return null;
    const now = Date.now();
    let memberships = load('memberships');
    let membership = memberships.find(m => m.userId === user.id && m.orgId === invitation.orgId);
    if (membership) {
      membership.status = 'active';
      membership.role = invitation.role;
      membership.updatedAt = now;
    } else {
      membership = {
        id: safeId('mem'),
        userId: user.id,
        orgId: invitation.orgId,
        role: invitation.role,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      memberships.push(membership);
    }
    save('memberships', memberships);

    const invitations = load('invitations');
    const row = invitations.find(x => x.id === invitation.id);
    if (row) {
      row.acceptedAt = now;
      row.acceptedBy = user.id;
      save('invitations', invitations);
    }
    const org = load('orgs').find(x => x.id === invitation.orgId) || null;
    if (org) appendAudit({ user, org }, 'member_joined');
    return org ? { org, membership } : null;
  }

  function firstOrganisation() {
    const org = load('orgs')[0] || null;
    return org;
  }

  function externalSignIn(req, res, profile) {
    const provider = cleanText(profile && profile.provider, 50).toLowerCase();
    const subject = cleanText(profile && profile.subject, 240);
    const email = cleanEmail(profile && profile.email);
    const name = cleanName(profile && profile.name, email ? email.split('@')[0] : 'Researcher');
    if (!provider || !subject || !email) {
      throw Object.assign(new Error('External identity is incomplete.'), { status: 400, code: 'external_identity_invalid' });
    }

    let users = load('users');
    let user = users.find(u =>
      Array.isArray(u.identities) &&
      u.identities.some(i => i && i.provider === provider && i.subject === subject)
    ) || users.find(u => u.email === email);

    const now = Date.now();
    if (!user) {
      const invitation = activeInvitationFor(email);
      const isFirstUser = users.length === 0;
      const allowAutoJoin = String(process.env.EVE_ENTRA_AUTO_JOIN || '').toLowerCase() === 'true';

      if (!isFirstUser && !invitation && !allowAutoJoin) {
        throw Object.assign(new Error('Your Microsoft account has not been invited to this Eve organisation.'), {
          status: 403, code: 'sso_user_not_invited'
        });
      }

      user = {
        id: safeId('usr'),
        email,
        name,
        password: null,
        identities: [{ provider, subject, linkedAt: now }],
        createdAt: now,
        updatedAt: now,
      };
      users.push(user);
      save('users', users);

      if (isFirstUser) {
        const org = {
          id: safeId('org'),
          name: cleanName(process.env.EVE_ORG_NAME, 'Eve workspace'),
          createdAt: now,
          updatedAt: now,
        };
        const membership = {
          id: safeId('mem'), userId: user.id, orgId: org.id, role: 'admin', status: 'active',
          createdAt: now, updatedAt: now,
        };
        save('orgs', [org]);
        save('memberships', [membership]);
      } else if (invitation) {
        activateInvitationForUser(user, invitation);
      } else if (allowAutoJoin) {
        const org = firstOrganisation();
        if (!org) throw Object.assign(new Error('No Eve organisation exists.'), { status: 409, code: 'organisation_missing' });
        const memberships = load('memberships');
        memberships.push({
          id: safeId('mem'), userId: user.id, orgId: org.id,
          role: String(process.env.EVE_ENTRA_AUTO_JOIN_ROLE || 'researcher') === 'viewer' ? 'viewer' : 'researcher',
          status: 'active', createdAt: now, updatedAt: now,
        });
        save('memberships', memberships);
      }
    } else {
      user.identities = Array.isArray(user.identities) ? user.identities : [];
      if (!user.identities.some(i => i && i.provider === provider && i.subject === subject)) {
        user.identities.push({ provider, subject, linkedAt: now });
      }
      user.name = name || user.name;
      user.email = email;
      user.updatedAt = now;
      save('users', users);

      let orgState = orgForUser(user.id);
      if (!orgState) {
        const invitation = activeInvitationFor(email);
        if (invitation) orgState = activateInvitationForUser(user, invitation);
      }
      if (!orgState && String(process.env.EVE_ENTRA_AUTO_JOIN || '').toLowerCase() === 'true') {
        const org = firstOrganisation();
        if (org) {
          const memberships = load('memberships');
          const membership = {
            id: safeId('mem'), userId: user.id, orgId: org.id,
            role: String(process.env.EVE_ENTRA_AUTO_JOIN_ROLE || 'researcher') === 'viewer' ? 'viewer' : 'researcher',
            status: 'active', createdAt: now, updatedAt: now,
          };
          memberships.push(membership);
          save('memberships', memberships);
          orgState = { org, membership };
        }
      }
      if (!orgState) {
        throw Object.assign(new Error('Your Microsoft account is not a member of an Eve organisation.'), {
          status: 403, code: 'sso_user_not_member'
        });
      }
    }

    const orgState = orgForUser(user.id);
    if (!orgState) {
      throw Object.assign(new Error('No active Eve organisation membership was found.'), {
        status: 403, code: 'no_active_organisation'
      });
    }
    createSessionFor(req, res, user, orgState);
    appendAudit({ user, ...orgState }, 'login');
    return {
      ok: true,
      user: publicUser(user),
      organisation: orgState.org,
      membership: publicMembership(orgState.membership),
    };
  }

  async function handle(req, res, url) {
    if (url.pathname === '/api/auth/config' && req.method === 'GET') {
      return json(res, 200, { ok: true, configured: load('users').length > 0 });
    }
    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      const data = await body(req);
      const email = cleanEmail(data.email);
      const user = load('users').find(u => u.email === email);
      if (!user || !verifyPassword(data.password, user.password)) {
        return json(res, 401, { ok: false, error: 'invalid_credentials' });
      }
      const orgState = orgForUser(user.id, String(data.orgId || ''));
      if (!orgState) return json(res, 403, { ok: false, error: 'no_active_organisation' });
      const raw = token();
      let sessions = compactSessions(load('sessions')).filter(s => s.userId !== user.id || Number(s.createdAt) > Date.now() - SESSION_TTL_MS * 2);
      const userSessions = sessions.filter(s => s.userId === user.id).sort((a,b) => a.createdAt - b.createdAt);
      while (userSessions.length >= MAX_SESSIONS_PER_USER) {
        const drop = userSessions.shift();
        sessions = sessions.filter(s => s.id !== drop.id);
      }
      const sess = {
        id: safeId('ses'), userId: user.id, orgId: orgState.org.id, tokenHash: sha(raw),
        createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS,
      };
      sessions.push(sess); save('sessions', sessions);
      setSessionCookie(req, res, raw, SESSION_TTL_MS / 1000);
      const auth = { user, ...orgState };
      appendAudit(auth, 'login');
      return json(res, 200, {
        ok: true, user: publicUser(user), organisation: orgState.org,
        membership: publicMembership(orgState.membership),
      });
    }
    if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
      const auth = sessionFromReq(req);
      const raw = cookies(req)[COOKIE];
      if (raw) save('sessions', compactSessions(load('sessions')).filter(s => !equalHash(s.tokenHash, sha(raw))));
      if (auth) appendAudit(auth, 'logout');
      setSessionCookie(req, res, '', 0);
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/api/auth/me' && req.method === 'GET') {
      const auth = requireRole(req, res, 'viewer'); if (!auth) return true;
      return json(res, 200, {
        ok: true, user: publicUser(auth.user), organisation: auth.org,
        membership: publicMembership(auth.membership),
      });
    }
    if (url.pathname === '/api/auth/profile' && req.method === 'PATCH') {
      const auth = requireRole(req, res, 'viewer'); if (!auth) return true;
      const data = await body(req);
      const name = cleanName(data.name, auth.user.name);
      const users = load('users');
      const row = users.find(x => x.id === auth.user.id);
      if (!row) return json(res, 404, { ok:false, error:'user_not_found' });
      row.name = name; row.updatedAt = Date.now(); save('users', users);
      appendAudit(auth, 'profile_updated');
      return json(res, 200, { ok:true, user:publicUser(row) });
    }
    if (url.pathname === '/api/auth/password' && req.method === 'POST') {
      const auth = requireRole(req, res, 'viewer'); if (!auth) return true;
      const data = await body(req);
      if (!verifyPassword(data.currentPassword, auth.user.password)) return json(res, 401, { ok:false, error:'current_password_incorrect' });
      const users = load('users'); const row = users.find(x => x.id === auth.user.id);
      row.password = passwordRecord(data.newPassword); row.updatedAt = Date.now(); save('users', users);
      // Revoke other sessions after a password change.
      save('sessions', compactSessions(load('sessions')).filter(s => s.userId !== auth.user.id || s.id === auth.session.id));
      appendAudit(auth, 'password_changed');
      return json(res, 200, { ok:true });
    }
    if (url.pathname === '/api/org' && req.method === 'PATCH') {
      const auth = requireRole(req, res, 'admin'); if (!auth) return true;
      const data = await body(req); const orgs = load('orgs');
      const org = orgs.find(x => x.id === auth.org.id);
      if (!org) return json(res, 404, { ok:false, error:'organisation_not_found' });
      org.name = cleanName(data.name, org.name); org.updatedAt = Date.now(); save('orgs', orgs);
      return json(res, 200, { ok:true, organisation:org });
    }
    if (url.pathname === '/api/org/members' && req.method === 'GET') {
      const auth = requireRole(req, res, 'viewer'); if (!auth) return true;
      const users = new Map(load('users').map(u => [u.id, u]));
      const members = load('memberships')
        .filter(m => m.orgId === auth.org.id && m.status === 'active')
        .map(m => ({ ...publicMembership(m), user: publicUser(users.get(m.userId)) }));
      return json(res, 200, { ok: true, organisation: auth.org, members, mail: mailer?.status?.() || { configured:false } });
    }
    if (url.pathname === '/api/mail/status' && req.method === 'GET') {
      const auth = requireRole(req, res, 'viewer'); if (!auth) return true;
      return json(res, 200, { ok:true, ...(mailer?.status?.() || { configured:false, provider:null }) });
    }
    if (url.pathname === '/api/org/invitations' && req.method === 'POST') {
      const auth = requireRole(req, res, 'admin'); if (!auth) return true;
      const data = await body(req);
      const email = cleanEmail(data.email);
      const role = ['viewer','researcher','admin'].includes(data.role) ? data.role : 'researcher';
      if (!email) return json(res, 400, { ok: false, error: 'valid_email_required' });
      const raw = token(), now = Date.now(), expiresAt = now + 7 * 24 * 60 * 60 * 1000;
      let invitations = load('invitations').filter(x => Number(x.expiresAt) > now && !x.acceptedAt);
      invitations = invitations.filter(x => !(x.orgId === auth.org.id && x.email === email));
      invitations.push({
        id: safeId('inv'), orgId: auth.org.id, email, role, tokenHash: sha(raw),
        invitedBy: auth.user.id, createdAt: now, expiresAt, acceptedAt: null,
      });
      save('invitations', invitations); appendAudit(auth, 'member_invited');
      const origin = requestOrigin(req);
      const inviteUrl = origin ? `${origin}/?eveInvite=${encodeURIComponent(raw)}` : '';
      let delivery = { ok:false, reason:'not_requested' };
      if (data.sendEmail !== false && mailer?.status?.().configured && inviteUrl) {
        try {
          const tpl = mailer.teamInvitationTemplate({
            organisation: auth.org.name, inviter: auth.user.name || auth.user.email, role, inviteUrl
          });
          delivery = await mailer.sendOne({ to: email, ...tpl });
        } catch (err) {
          delivery = { ok:false, reason:err.code || 'send_failed', error:err.message };
        }
      } else if (!mailer?.status?.().configured) {
        delivery = { ok:false, reason:'mail_not_configured' };
      }
      return json(res, 201, {
        ok: true, invitation: { email, role, expiresAt },
        delivery,
        // Raw token is exposed only as a fallback when it was not successfully emailed.
        ...(delivery.ok ? {} : { token: raw, inviteUrl }),
      });
    }
    if (url.pathname === '/api/org/invitations/accept' && req.method === 'POST') {
      const data = await body(req), raw = String(data.token || '');
      const invitations = load('invitations');
      const inv = invitations.find(x => !x.acceptedAt && Number(x.expiresAt) > Date.now() && equalHash(x.tokenHash, sha(raw)));
      if (!inv) return json(res, 404, { ok: false, error: 'invitation_invalid_or_expired' });
      let users = load('users');
      let user = users.find(u => u.email === inv.email);
      const now = Date.now();
      if (!user) {
        user = {
          id: safeId('usr'), email: inv.email, name: cleanName(data.name, inv.email.split('@')[0]),
          password: passwordRecord(data.password), createdAt: now, updatedAt: now,
        };
        users.push(user); save('users', users);
      } else if (!verifyPassword(data.password, user.password)) {
        return json(res, 401, { ok: false, error: 'existing_account_password_required' });
      }
      let memberships = load('memberships');
      const existing = memberships.find(m => m.userId === user.id && m.orgId === inv.orgId);
      if (existing) {
        existing.status = 'active'; existing.role = inv.role; existing.updatedAt = now;
      } else {
        memberships.push({
          id: safeId('mem'), userId: user.id, orgId: inv.orgId, role: inv.role,
          status: 'active', createdAt: now, updatedAt: now,
        });
      }
      inv.acceptedAt = now; inv.acceptedBy = user.id;
      save('memberships', memberships); save('invitations', invitations);
      const org = load('orgs').find(x => x.id === inv.orgId);
      appendAudit({ user, org }, 'member_joined');
      return json(res, 200, { ok: true, user: publicUser(user) });
    }

    let m = url.pathname.match(/^\/api\/org\/members\/([A-Za-z0-9_-]+)$/);
    if (m && req.method === 'PATCH') {
      const auth = requireRole(req, res, 'admin'); if (!auth) return true;
      const data = await body(req), role = String(data.role || '');
      if (!['viewer','researcher','admin'].includes(role)) return json(res, 400, { ok: false, error: 'invalid_role' });
      const memberships = load('memberships');
      const target = memberships.find(x => x.id === m[1] && x.orgId === auth.org.id && x.status === 'active');
      if (!target) return json(res, 404, { ok: false, error: 'member_not_found' });
      const admins = memberships.filter(x => x.orgId === auth.org.id && x.status === 'active' && x.role === 'admin');
      if (target.role === 'admin' && role !== 'admin' && admins.length <= 1) return json(res, 409, { ok: false, error: 'organisation_requires_admin' });
      target.role = role; target.updatedAt = Date.now(); save('memberships', memberships);
      appendAudit(auth, 'member_role_changed');
      return json(res, 200, { ok: true, membership: publicMembership(target) });
    }
    if (m && req.method === 'DELETE') {
      const auth = requireRole(req, res, 'admin'); if (!auth) return true;
      const memberships = load('memberships');
      const target = memberships.find(x => x.id === m[1] && x.orgId === auth.org.id && x.status === 'active');
      if (!target) return json(res, 404, { ok:false, error:'member_not_found' });
      const admins = memberships.filter(x => x.orgId === auth.org.id && x.status === 'active' && x.role === 'admin');
      if (target.role === 'admin' && admins.length <= 1) return json(res, 409, { ok:false, error:'organisation_requires_admin' });
      target.status = 'removed'; target.updatedAt = Date.now(); save('memberships', memberships);
      save('sessions', compactSessions(load('sessions')).filter(s => s.userId !== target.userId || s.orgId !== auth.org.id));
      appendAudit(auth, 'member_removed');
      return json(res, 200, { ok:true });
    }

    // Collaboration status: presence + edit lease + optimistic revision.
    m = url.pathname.match(/^\/api\/collaboration\/([A-Za-z0-9_-]+)\/status$/);
    if (m && req.method === 'GET') {
      const auth = requireRole(req, res, 'viewer'); if (!auth) return true;
      const p = compactPresence(load('presence')); save('presence', p);
      const l = compactLeases(load('leases')); save('leases', l);
      return json(res, 200, { ok:true, ...collaborationSnapshot(auth, m[1]) });
    }
    m = url.pathname.match(/^\/api\/collaboration\/([A-Za-z0-9_-]+)\/presence$/);
    if (m && req.method === 'POST') {
      const auth = requireRole(req, res, 'viewer'); if (!auth) return true;
      const data = await body(req), clientId = cleanText(data.clientId, 180);
      if (!clientId) return json(res, 400, { ok:false, error:'client_id_required' });
      let rows = compactPresence(load('presence'));
      const existing = rows.find(x => x.orgId === auth.org.id && x.studyId === m[1] && x.userId === auth.user.id && x.clientId === clientId);
      const next = {
        orgId: auth.org.id, studyId: m[1], userId: auth.user.id, clientId,
        view: ['builder','settings','send','review'].includes(data.view) ? data.view : 'view',
        seenAt: Date.now(),
      };
      if (existing) Object.assign(existing, next); else rows.push(next);
      save('presence', rows);
      if (data.opened === true) appendAudit(auth, 'study_opened', { studyId:m[1] });
      return json(res, 200, { ok:true, ...collaborationSnapshot(auth, m[1]) });
    }
    m = url.pathname.match(/^\/api\/collaboration\/([A-Za-z0-9_-]+)\/lease$/);
    if (m && req.method === 'POST') {
      const auth = requireRole(req, res, 'researcher'); if (!auth) return true;
      const data = await body(req), clientId = cleanText(data.clientId, 180);
      if (!clientId) return json(res, 400, { ok:false, error:'client_id_required' });
      let rows = compactLeases(load('leases'));
      const current = rows.find(x => x.orgId === auth.org.id && x.studyId === m[1]);
      const canForce = data.force === true && auth.membership.role === 'admin';
      if (current && !(current.userId === auth.user.id && current.clientId === clientId) && !canForce) {
        const users = new Map(load('users').map(u => [u.id,u]));
        return json(res, 409, {
          ok:false, error:'study_edit_locked',
          lease:{ userId:current.userId, clientId:current.clientId, acquiredAt:current.acquiredAt, expiresAt:current.expiresAt, user:publicUser(users.get(current.userId)) }
        });
      }
      const now = Date.now();
      if (current) {
        const sameOwner = current.userId === auth.user.id && current.clientId === clientId;
        current.userId = auth.user.id; current.clientId = clientId;
        if (!sameOwner) current.acquiredAt = now;
        current.expiresAt = now + LEASE_TTL_MS;
      } else {
        rows.push({ orgId:auth.org.id, studyId:m[1], userId:auth.user.id, clientId, acquiredAt:now, expiresAt:now + LEASE_TTL_MS });
      }
      save('leases', rows); appendAudit(auth, 'edit_acquired', { studyId:m[1] });
      return json(res, 200, { ok:true, ...collaborationSnapshot(auth, m[1]) });
    }
    if (m && req.method === 'PATCH') {
      const auth = requireRole(req, res, 'researcher'); if (!auth) return true;
      const data = await body(req), clientId = cleanText(data.clientId, 180);
      let rows = compactLeases(load('leases'));
      const current = rows.find(x => x.orgId === auth.org.id && x.studyId === m[1] && x.userId === auth.user.id && x.clientId === clientId);
      if (!current) return json(res, 409, { ok:false, error:'edit_lease_lost' });
      current.expiresAt = Date.now() + LEASE_TTL_MS; save('leases', rows);
      return json(res, 200, { ok:true, ...collaborationSnapshot(auth, m[1]) });
    }
    if (m && req.method === 'DELETE') {
      const auth = requireRole(req, res, 'researcher'); if (!auth) return true;
      const data = await body(req).catch(() => ({})); const clientId = cleanText(data.clientId, 180);
      let rows = compactLeases(load('leases'));
      const before = rows.length;
      rows = rows.filter(x => !(x.orgId === auth.org.id && x.studyId === m[1] && x.userId === auth.user.id && (!clientId || x.clientId === clientId)));
      save('leases', rows);
      if (rows.length !== before) appendAudit(auth, 'edit_released', { studyId:m[1] });
      return json(res, 200, { ok:true });
    }

    // Backwards-compatible v50 revision endpoint.
    m = url.pathname.match(/^\/api\/collaboration\/([A-Za-z0-9_-]+)$/);
    if (m && req.method === 'GET') {
      const auth = requireRole(req, res, 'viewer'); if (!auth) return true;
      const row = load('revisions').find(x => x.orgId === auth.org.id && x.studyId === m[1]) || null;
      return json(res, 200, { ok: true, revision: row });
    }
    if (m && req.method === 'PUT') {
      const auth = requireRole(req, res, 'researcher'); if (!auth) return true;
      const data = await body(req);
      if (['content','workspace','answers','responses'].some(k => Object.prototype.hasOwnProperty.call(data, k))) {
        return json(res, 400, { ok: false, error: 'research_content_not_accepted' });
      }
      let rows = load('revisions');
      const existing = rows.find(x => x.orgId === auth.org.id && x.studyId === m[1]);
      const expected = Number(data.expectedRevision || 0);
      if (existing && expected !== Number(existing.revision || 0)) {
        return json(res, 409, { ok: false, error: 'revision_conflict', revision: existing });
      }
      const next = {
        orgId: auth.org.id, studyId: m[1], revision: Number(existing?.revision || 0) + 1,
        updatedAt: Date.now(), updatedBy: auth.user.id,
      };
      if (existing) Object.assign(existing, next); else rows.push(next);
      save('revisions', rows); appendAudit(auth, 'study_saved', { studyId:m[1] });
      return json(res, 200, { ok: true, revision: next });
    }

    m = url.pathname.match(/^\/api\/activity(?:\/([A-Za-z0-9_-]+))?$/);
    if (m && req.method === 'GET') {
      const auth = requireRole(req, res, 'viewer'); if (!auth) return true;
      const users = new Map(load('users').map(u => [u.id,u]));
      let rows = load('audit').filter(x => x.orgId === auth.org.id);
      if (m[1]) rows = rows.filter(x => x.studyId === m[1]);
      rows = rows.slice(-100).reverse().map(x => ({...x, user:publicUser(users.get(x.userId))}));
      return json(res, 200, { ok:true, activity:rows });
    }

    return false;
  }

  return { handle, requireRole, sessionFromReq, bootstrap, appendAudit, externalSignIn, roles: ROLES, isConfigured:()=>load('users').length>0 };
}

module.exports = { createControlPlane, ROLES, PRESENCE_TTL_MS, LEASE_TTL_MS };
