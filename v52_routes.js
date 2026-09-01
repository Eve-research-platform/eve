'use strict';

const { createControlPlane } = require('./lib/control_plane');
const { createAiGateway } = require('./lib/ai_gateway');
const { createM365Mailer } = require('./lib/m365_mail');
const { createRecruitment } = require('./lib/recruitment');
const { createCollaborationV2 } = require('./lib/collaboration_v2');
const { createParticipantPanel } = require('./lib/participant_panel');
const { createEntraSso } = require('./lib/entra_sso');

function installV52({ dataDir, json, body, fetchImpl = global.fetch, stateStore = null }) {
  let controlRef=null;
  const mailer = createM365Mailer({
    fetchImpl, dataDir, json, body, stateStore,
    requireRole:(req,res,role)=>controlRef?.requireRole(req,res,role),
    authConfigured:()=>controlRef?.isConfigured?.()||false
  });
  const control = createControlPlane({ dataDir, json, body, mailer, stateStore });
  controlRef=control;
  const entra = createEntraSso({ dataDir, json, control, fetchImpl, stateStore });
  const collaboration = createCollaborationV2({
    dataDir, json, body,
    requireRole: control.requireRole,
    appendAudit: control.appendAudit,
    stateStore,
  });
  const ai = createAiGateway({ json, body, requireRole: control.requireRole, dataDir, authConfigured: control.isConfigured, stateStore });
  const recruitment = createRecruitment({
    json, body, requireRole: control.requireRole, mailer, appendAudit: control.appendAudit, stateStore
  });
  const panel = createParticipantPanel({
    dataDir, json, body, requireRole: control.requireRole, authConfigured: control.isConfigured,
    mailer, appendAudit: control.appendAudit, stateStore
  });

  async function handle(req, res, url) {
    let out = await entra.handle(req, res, url);
    if (out !== false) return true;
    out = await control.handle(req, res, url);
    if (out !== false) return true;
    out = await collaboration.handle(req, res, url);
    if (out !== false) return true;
    out = await mailer.handle(req, res, url);
    if (out !== false) return true;
    out = await recruitment.handle(req, res, url);
    if (out !== false) return true;
    out = await panel.handle(req, res, url);
    if (out !== false) return true;
    out = await ai.handle(req, res, url);
    if (out !== false) return true;
    return false;
  }

  return { handle, control, entra, collaboration, recruitment, panel, ai, mailer };
}

module.exports = { installV52 };
