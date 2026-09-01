'use strict';

function clean(v, max = 5000) {
  return String(v == null ? '' : v).replace(/\u0000/g, '').trim().slice(0, max);
}
function allowedParticipantUrl(raw, req) {
  let u;
  try { u = new URL(String(raw || '')); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const configured = String(process.env.EVE_PUBLIC_ORIGIN || '').trim().replace(/\/+$/, '');
  if (configured) {
    let origin; try { origin = new URL(configured).origin; } catch { return null; }
    if (u.origin !== origin) return null;
  } else {
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
    if (host && u.host.toLowerCase() !== host) return null;
  }
  if (!u.hash.startsWith('#/s/')) return null;
  return u.toString();
}

function createRecruitment({ json, body, requireRole, mailer, appendAudit }) {
  async function handle(req, res, url) {
    if (url.pathname === '/api/recruitment/status' && req.method === 'GET') {
      const auth = requireRole(req, res, 'viewer'); if (!auth) return true;
      return json(res, 200, { ok:true, ...(mailer?.status?.() || { configured:false }) });
    }
    if (url.pathname !== '/api/recruitment/send' || req.method !== 'POST') return false;

    const auth = requireRole(req, res, 'researcher'); if (!auth) return true;
    if (!mailer?.status?.().configured) return json(res, 503, { ok:false, error:'mail_not_configured' });

    const data = await body(req);
    const participantUrl = allowedParticipantUrl(data.participantUrl, req);
    if (!participantUrl) return json(res, 400, { ok:false, error:'participant_url_not_allowed' });

    const recipients = Array.isArray(data.recipients) ? data.recipients : [];
    const studyId = clean(data.studyId, 180);
    const studyTitle = clean(data.studyTitle, 220) || 'Research study';
    const message = clean(data.message, 5000);
    const subject = clean(data.subject, 180);

    const tpl = mailer.researchInvitationTemplate({ studyTitle, message, participantUrl });
    const result = await mailer.sendBatch({
      recipients,
      subject: subject || tpl.subject,
      textFor: () => tpl.text,
      htmlFor: () => tpl.htmlBody,
    });

    // Only operational counts are persisted. Participant recipient addresses are not.
    appendAudit(auth, 'recruitment_sent', { studyId, count:result.sent });
    return json(res, result.failed ? 207 : 200, {
      ok: result.failed === 0,
      sent: result.sent,
      failed: result.failed,
      total: result.total,
      failures: result.results.filter(x => !x.ok).map(x => ({ email:x.to, error:x.error, code:x.code })),
    });
  }
  return { handle };
}

module.exports = { createRecruitment, allowedParticipantUrl };
