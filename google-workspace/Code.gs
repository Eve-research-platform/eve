/**
 * Eve Google Workspace runtime v59.2.
 *
 * One copied Google Sheet + bound Apps Script project uses one web-app
 * deployment. Researcher functions are protected by Eve's private owner
 * capability; participant functions use per-study/version capabilities.
 *
 * Durable workspace files and encrypted participant transport live in the
 * deploying researcher's Google Drive. Research payload encryption remains in
 * the browser; this script stores opaque envelopes and routing metadata.
 */

const EVE_VERSION = '59.2.0';
const EVE_ROOT_NAME = 'Eve';
const EVE_PROP_ROOT = 'EVE_ROOT_FOLDER_ID';
const EVE_PROP_OWNER_EMAIL = 'EVE_OWNER_EMAIL';
const EVE_PROP_OWNER_HASH = 'EVE_OWNER_HASH';
const EVE_PROP_BOUND_FILE = 'EVE_BOUND_FILE_ID';
const EVE_USER_OWNER_KEY = 'EVE_OWNER_KEY_LOCAL';
const EVE_PROP_UPDATE_URL = 'EVE_UPDATE_MANIFEST_URL';
const EVE_MAX_RESPONSES = 10000;
const EVE_MAX_RECORDINGS = 5000;
const EVE_MAX_RECORDING_CHARS = 8000000; // retained for relay compatibility; Google HTMLService recording is capability-gated off


function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Eve')
      .addItem('Set up / open Eve', 'eveShowSetup')
      .addToUi();
  } catch (err) {
    console.log('Eve menu unavailable outside a bound Google Sheet', err);
  }
}

function eveShowSetup() {
  ensureCopyIdentity_();
  const html = HtmlService.createTemplateFromFile('Launcher').evaluate()
    .setWidth(620)
    .setHeight(590);
  SpreadsheetApp.getUi().showModalDialog(html, 'Eve setup');
}

function evePrepareInstallation() {
  return withScriptLock_(function () {
    ensureCopyIdentity_();
    const email = activeResearcherEmail_();
    if (!email) throw new Error('Open your copied Eve Google Sheet while signed into Google Workspace, then try again.');

    const props = PropertiesService.getScriptProperties();
    const userProps = PropertiesService.getUserProperties();
    let ownerKey = String(userProps.getProperty(EVE_USER_OWNER_KEY) || '').trim();
    if (!ownerKey) {
      ownerKey = newOwnerKey_();
      userProps.setProperty(EVE_USER_OWNER_KEY, ownerKey);
    }

    const existingEmail = props.getProperty(EVE_PROP_OWNER_EMAIL) || '';
    const existingHash = props.getProperty(EVE_PROP_OWNER_HASH) || '';
    const candidateHash = sha256Hex_(ownerKey);

    if (existingEmail && normaliseEmail_(existingEmail) !== normaliseEmail_(email)) {
      throw new Error('This Eve copy is already owned by a different Google Workspace account.');
    }
    if (existingHash && !safeEqual_(existingHash, candidateHash)) {
      throw new Error('This Google account does not have the owner capability for this Eve copy.');
    }

    props.setProperty(EVE_PROP_OWNER_EMAIL, email);
    props.setProperty(EVE_PROP_OWNER_HASH, candidateHash);

    const root = eveRootFolder_();
    ensureChildFolder_(root, 'Workspace');
    ensureChildFolder_(root, 'Relay');

    return launcherState_(ownerKey, email, root);
  });
}

function eveLauncherState() {
  ensureCopyIdentity_();
  const email = activeResearcherEmail_();
  if (!email) throw new Error('Open your copied Eve Google Sheet while signed into Google Workspace.');
  const props = PropertiesService.getScriptProperties();
  const ownerEmail = props.getProperty(EVE_PROP_OWNER_EMAIL) || '';
  if (ownerEmail && normaliseEmail_(ownerEmail) !== normaliseEmail_(email)) {
    throw new Error('This Eve copy belongs to a different Google Workspace account.');
  }
  const ownerKey = String(PropertiesService.getUserProperties().getProperty(EVE_USER_OWNER_KEY) || '').trim();
  return launcherState_(ownerKey, email, null);
}

function launcherState_(ownerKey, email, root) {
  const appUrl = ScriptApp.getService().getUrl() || '';
  const projectId = ScriptApp.getScriptId();
  return {
    ok: true,
    prepared: !!ownerKey && !!PropertiesService.getScriptProperties().getProperty(EVE_PROP_OWNER_HASH),
    ownerEmail: email || '',
    ownerFingerprint: ownerKey ? sha256Hex_(ownerKey).slice(0,12) : '',
    driveReady: !!(root || PropertiesService.getScriptProperties().getProperty(EVE_PROP_ROOT)),
    deploymentUrl: appUrl,
    deploymentReady: !!appUrl,
    deploymentPage: 'https://script.google.com/home/projects/' + encodeURIComponent(projectId) + '/deployments',
    secureOpenUrl: appUrl && ownerKey ? appUrl + '#/install?o=' + encodeURIComponent(ownerKey) : '',
    version: EVE_VERSION,
    updateCheckConfigured: !!PropertiesService.getScriptProperties().getProperty(EVE_PROP_UPDATE_URL)
  };
}

function eveCheckForUpdates() {
  const current=EVE_VERSION,url=String(PropertiesService.getScriptProperties().getProperty(EVE_PROP_UPDATE_URL)||'').trim();
  if(!url)return{ok:true,configured:false,currentVersion:current,updateAvailable:false};
  try{
    const response=UrlFetchApp.fetch(url,{muteHttpExceptions:true,followRedirects:true}),status=response.getResponseCode();
    if(status<200||status>=300)throw new Error('Update manifest HTTP '+status);
    const manifest=JSON.parse(response.getContentText('UTF-8')||'{}'),latest=String(manifest.version||'').trim();
    return{
      ok:true,configured:true,currentVersion:current,latestVersion:latest,
      updateAvailable:!!latest&&compareVersions_(latest,current)>0,
      releaseUrl:String(manifest.releaseUrl||''),
      notes:String(manifest.notes||'')
    };
  }catch(err){
    return{ok:false,configured:true,currentVersion:current,updateAvailable:false,error:String(err&&err.message||err)};
  }
}

function compareVersions_(a,b){
  const aa=String(a||'').split('.').map(function(x){return Number(x)||0}),bb=String(b||'').split('.').map(function(x){return Number(x)||0}),n=Math.max(aa.length,bb.length);
  for(let i=0;i<n;i++){const d=(aa[i]||0)-(bb[i]||0);if(d)return d>0?1:-1}
  return 0;
}

function ensureCopyIdentity_() {
  const props = PropertiesService.getScriptProperties();
  let currentId = '';
  try { currentId = SpreadsheetApp.getActiveSpreadsheet().getId(); } catch (err) {}
  if (!currentId) return;
  const stored = props.getProperty(EVE_PROP_BOUND_FILE) || '';
  if (stored && stored !== currentId) {
    [EVE_PROP_ROOT,EVE_PROP_OWNER_EMAIL,EVE_PROP_OWNER_HASH].forEach(function (key) { props.deleteProperty(key); });
    try { PropertiesService.getUserProperties().deleteProperty(EVE_USER_OWNER_KEY); } catch (err) {}
  }
  props.setProperty(EVE_PROP_BOUND_FILE, currentId);
}

function newOwnerKey_() {
  const seed = Utilities.getUuid() + ':' + Utilities.getUuid() + ':' + Date.now();
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed, Utilities.Charset.UTF_8)
  ).replace(/=+$/,'');
}

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Eve')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function eveBootstrap(ownerKey) {
  return withScriptLock_(function () {
    if (!String(ownerKey || '').trim()) throw new Error('Eve owner capability is missing.');

    const props = PropertiesService.getScriptProperties();
    const existingHash = props.getProperty(EVE_PROP_OWNER_HASH) || '';
    const candidateHash = sha256Hex_(ownerKey);

    // Backward compatibility for early v59 projects that were initialised from
    // a private researcher deployment before the single-deployment launcher.
    if (!existingHash) {
      const email = activeResearcherEmail_();
      if (!email) throw new Error('Open the copied Eve Google Sheet and choose Eve → Set up / open Eve first.');
      props.setProperty(EVE_PROP_OWNER_EMAIL, email);
      props.setProperty(EVE_PROP_OWNER_HASH, candidateHash);
    } else if (!safeEqual_(existingHash, candidateHash)) {
      throw new Error('This browser does not have the owner capability for this Eve project. Re-open Eve from the copied Google Sheet or restore your recovery backup.');
    }

    const root = eveRootFolder_();
    ensureChildFolder_(root, 'Workspace');
    ensureChildFolder_(root, 'Relay');
    const appUrl = ScriptApp.getService().getUrl() || '';

    return {
      ok: true,
      connected: true,
      ownerEmail: props.getProperty(EVE_PROP_OWNER_EMAIL) || '',
      rootFolderId: root.id,
      location: driveOwnership_(root)+' / Eve',
      storageOwnership: driveOwnership_(root),
      researcherUrl: appUrl,
      participantUrl: appUrl,
      singleDeployment: true
    };
  });
}

function eveStorageInfo(ownerKey) {
  requireResearcherOwner_(ownerKey);
  const root = eveRootFolder_();
  return {ok:true,connected:true,rootFolderId:root.id,location:driveOwnership_(root)+' / Eve',storageOwnership:driveOwnership_(root)};
}

function eveStorageWrite(ownerKey, path, content) {
  requireResearcherOwner_(ownerKey);
  const safe = safeStoragePath_(path);
  return withScriptLock_(function () {
    writeTextPath_(workspaceRoot_(), safe, String(content || ''));
    return {ok:true,path:safe,updatedAt:Date.now()};
  });
}

function eveStorageRead(ownerKey, path) {
  requireResearcherOwner_(ownerKey);
  const safe = safeStoragePath_(path);
  const file = fileAtPath_(workspaceRoot_(), safe, false);
  if (!file) throw new Error('File not found: ' + safe);
  return {ok:true,path:safe,content:driveStore_().readText(file.id),updatedAt:modifiedMs_(file.modifiedTime)};
}

function eveStorageDelete(ownerKey, path) {
  requireResearcherOwner_(ownerKey);
  const safe = safeStoragePath_(path);
  return withScriptLock_(function () {
    const file = fileAtPath_(workspaceRoot_(), safe, false);
    if (file) driveStore_().trash(file.id);
    return {ok:true,path:safe,deleted:!!file};
  });
}

function eveStorageList(ownerKey, prefix) {
  requireResearcherOwner_(ownerKey);
  const safe = String(prefix || '').trim().replace(/^\/+|\/+$/g,'');
  const rows = [];
  const root = workspaceRoot_();
  let start = root;
  let base = '';
  if (safe) {
    const parts = safeStoragePath_(safe).split('/');
    try { start = folderForPath_(root,parts,false); base = safe; }
    catch (err) { return {ok:true,files:[]}; }
  }
  collectFiles_(start,base,rows);
  return {ok:true,files:rows};
}

function eveRelayRequest(request) {
  const req = request || {};
  const method = String(req.method || 'GET').toUpperCase();
  const parsed = parseRequestPath_(req.path || '/');
  const path = parsed.path;
  const query = parsed.query;
  const headers = normaliseHeaders_(req.headers || {});

  try {
    if (path === '/api/health' && method === 'GET') return relayJson_(200,{ok:true,mode:'google-workspace-zero-access-relay',storage:'google-drive',now:Date.now()});
    if (path === '/api/owner-check' && method === 'GET') return ownerHeaderOk_(headers)?relayJson_(200,{ok:true,owner:true}):relayJson_(403,{ok:false,reason:'Eve owner capability rejected'});

    let m = path.match(/^\/api\/studies\/([A-Za-z0-9_-]+)$/);
    if (m) return handleStudy_(method,m[1],query,headers,req.body || '');

    m = path.match(/^\/api\/studies\/([A-Za-z0-9_-]+)\/status$/);
    if (m && method === 'GET') return studyStatus_(m[1],headers);

    m = path.match(/^\/api\/studies\/([A-Za-z0-9_-]+)\/responses$/);
    if (m) return handleResponses_(method,m[1],query,headers,req.body || '');

    m = path.match(/^\/api\/studies\/([A-Za-z0-9_-]+)\/recordings$/);
    if (m && method === 'POST') return postRecording_(m[1],headers,req.body || '');

    m = path.match(/^\/api\/studies\/([A-Za-z0-9_-]+)\/recordings\/([A-Za-z0-9_-]+)$/);
    if (m && method === 'GET') return getRecording_(m[1],m[2],headers);

    m = path.match(/^\/api\/studies\/([A-Za-z0-9_-]+)\/invitations$/);
    if (m && method === 'POST') return postInvitations_(m[1],headers,req.body || '');

    if (path.indexOf('/api/panel/') === 0) return relayJson_(501,{reason:'Participant Panel is not available through the standalone Google Workspace response service yet.'});
    return relayJson_(404,{reason:'API route not found'});
  } catch (err) {
    console.error('Eve Apps Script relay error',err);
    return relayJson_(500,{reason:String(err && err.message || err || 'Internal response-service error')});
  }
}

function handleStudy_(method, slug, query, headers, body) {
  const record = readJsonPath_(relayRoot_(), studyPath_(slug), null);

  if (method === 'PUT') {
    if (!ownerHeaderOk_(headers)) return relayJson_(403,{reason:'Eve owner capability rejected'});
    const data = parseJson_(body,'Invalid publication body');
    if (!data.envelope || !data.adminToken || !data.metadata) return relayJson_(400,{reason:'Missing encrypted publication fields'});
    const version = Number(data.metadata.version || 0);
    if (!isFinite(version) || version < 1) return relayJson_(400,{reason:'Invalid study version'});
    if (['live','closed'].indexOf(data.metadata.status) < 0) return relayJson_(400,{reason:'Invalid study status'});
    if (record && !adminOk_(headers,record)) return relayJson_(403,{reason:'Admin capability rejected'});

    return withScriptLock_(function () {
      const current = readJsonPath_(relayRoot_(), studyPath_(slug), null);
      const previous = Number(current && current.latestVersion || 0);
      if (current && version < previous) return relayJson_(409,{reason:'Version must be v' + previous + ' or newer.'});
      const next = current || {slug:slug,versions:{},latestVersion:0,adminHash:sha256Hex_(data.adminToken),lifecycle:{status:'closed',closeAtUtc:''}};
      next.versions = next.versions || {};
      next.versions[String(version)] = {envelope:data.envelope,metadata:Object.assign({},data.metadata,{version:version})};
      next.latestVersion = Math.max(Number(next.latestVersion || 0),version);
      next.lifecycle = {status:data.metadata.status,closeAtUtc:data.metadata.closeAtUtc || ''};
      next.updatedAt = Date.now();
      writeJsonPath_(relayRoot_(),studyPath_(slug),next);
      return relayJson_(200,{ok:true,version:version,updatedAt:next.updatedAt,idempotent:!!current && version === previous});
    });
  }

  if (method === 'PATCH') {
    if (!record) return relayJson_(404,{reason:'Study not found'});
    if (!ownerHeaderOk_(headers) || !adminOk_(headers,record)) return relayJson_(403,{reason:'Admin capability rejected'});
    const data = parseJson_(body,'Invalid lifecycle body');
    if (data.status !== undefined && ['live','closed'].indexOf(data.status) < 0) return relayJson_(400,{reason:'Invalid study status'});
    return withScriptLock_(function () {
      const next = readJsonPath_(relayRoot_(),studyPath_(slug),null);
      next.lifecycle = Object.assign({},next.lifecycle || {},data.status !== undefined?{status:data.status}:{},data.closeAtUtc !== undefined?{closeAtUtc:data.closeAtUtc || ''}:{});
      next.updatedAt = Date.now();
      writeJsonPath_(relayRoot_(),studyPath_(slug),next);
      return relayJson_(200,{ok:true,version:next.latestVersion});
    });
  }

  if (method === 'DELETE') {
    if (!record) return relayJson_(404,{reason:'Study not found'});
    if (!ownerHeaderOk_(headers) || !adminOk_(headers,record)) return relayJson_(403,{reason:'Admin capability rejected'});
    return withScriptLock_(function () {
      trashPath_(relayRoot_(),'studies/'+slug);
      trashPath_(relayRoot_(),'responses/'+slug);
      trashPath_(relayRoot_(),'recordings/'+slug);
      trashPath_(relayRoot_(),'invitations/'+slug+'.json');
      return relayJson_(200,{ok:true,deleted:true,slug:slug});
    });
  }

  if (method === 'GET') {
    if (!record) return relayJson_(404,{reason:'Study not found'});
    const closed = closedReason_(record); if (closed) return relayJson_(410,{reason:closed});
    const version = Number(query.version || record.latestVersion || 0);
    const pub = publicationFor_(record,version);
    if (!pub) return relayJson_(404,{reason:'Published study version not found'});
    if (!participantOk_(headers,record,version)) return relayJson_(403,{reason:'Participant capability rejected'});
    return relayJson_(200,{envelope:pub.envelope,metadata:Object.assign({},pub.metadata,{status:record.lifecycle.status,closeAtUtc:record.lifecycle.closeAtUtc,latestVersion:record.latestVersion})});
  }

  return relayJson_(405,{reason:'Method not allowed'});
}

function studyStatus_(slug,headers) {
  const study = readJsonPath_(relayRoot_(),studyPath_(slug),null);
  if (!study) return relayJson_(404,{reason:'Study not found'});
  if (!ownerHeaderOk_(headers) || !adminOk_(headers,study)) return relayJson_(403,{reason:'Admin capability rejected'});
  return relayJson_(200,{ok:true,latestVersion:Number(study.latestVersion||0),versions:Object.keys(study.versions||{}).map(Number).filter(function(x){return isFinite(x)}).sort(function(a,b){return a-b}),lifecycle:{status:study.lifecycle && study.lifecycle.status || 'closed',closeAtUtc:study.lifecycle && study.lifecycle.closeAtUtc || ''},updatedAt:Number(study.updatedAt||0)});
}

function handleResponses_(method,slug,query,headers,body) {
  const study = readJsonPath_(relayRoot_(),studyPath_(slug),null);
  if (!study) return relayJson_(404,{reason:'Study not found'});

  if (method === 'POST') {
    const data = parseJson_(body,'Invalid encrypted response');
    const id = safeId_(data.id);
    if (!id || !data.envelope) return relayJson_(400,{reason:'Invalid encrypted response'});
    const path = 'responses/'+slug+'/'+id+'.json';
    const old = readJsonPath_(relayRoot_(),path,null);
    if (old) {
      const v = Number(old.routing && old.routing.version || study.latestVersion);
      if (!participantOk_(headers,study,v)) return relayJson_(403,{reason:'Participant capability rejected'});
      return relayJson_(200,{ok:true,receivedAt:old.receivedAt,version:v,id:id,idempotent:true});
    }
    const reason = closedReason_(study); if (reason) return relayJson_(410,{reason:reason});
    const routing = data.routing || {}, version = Number(routing.version || study.latestVersion);
    if (!publicationFor_(study,version)) return relayJson_(409,{reason:'The referenced study version does not exist.'});
    if (!participantOk_(headers,study,version)) return relayJson_(403,{reason:'Participant capability rejected'});

    return withScriptLock_(function () {
      const duplicate = readJsonPath_(relayRoot_(),path,null);
      if (duplicate) return relayJson_(200,{ok:true,receivedAt:duplicate.receivedAt,version:version,id:id,idempotent:true});
      const index=responseIndex_(slug,true);
      if (index.length >= EVE_MAX_RESPONSES) return relayJson_(507,{reason:'This study has reached its response storage limit.'});
      if (routing.segmentId) {
        const invitations = readJsonPath_(relayRoot_(),'invitations/'+slug+'.json',[]);
        const tokenHash = sha256Hex_(routing.inviteToken || '');
        const invite = invitations.find(function(x){return x.tokenHash===tokenHash && x.segmentId===routing.segmentId && x.campaignId===routing.campaignId && Number(x.version||version)===version});
        if (!invite) return relayJson_(403,{reason:'This controlled-audience invitation is not valid.'});
        if (invite.usedAt) return relayJson_(409,{reason:'This invitation has already been used.'});
        invite.usedAt = Date.now();
        writeJsonPath_(relayRoot_(),'invitations/'+slug+'.json',invitations);
      }
      const receivedAt = Date.now();
      writeJsonPath_(relayRoot_(),path,{id:id,envelope:data.envelope,receivedAt:receivedAt,routing:{source:routing.source||'direct',campaignId:routing.campaignId||null,segmentId:routing.segmentId||null,version:version}});
      index.push({id:id,receivedAt:receivedAt});
      writeJsonPath_(relayRoot_(),responseIndexPath_(slug),index);
      return relayJson_(201,{ok:true,receivedAt:receivedAt,version:version,id:id,idempotent:false});
    });
  }

  if (method === 'GET') {
    if (!ownerHeaderOk_(headers) || !adminOk_(headers,study)) return relayJson_(403,{reason:'Admin capability rejected'});
    const index = responseIndex_(slug,true);
    const offset = Math.max(0,Number(query.offset||0)||0), limit = Math.max(1,Math.min(500,Number(query.limit||250)||250));
    const wanted=index.slice(offset,offset+limit),responses=[];
    wanted.forEach(function(item){const row=readJsonPath_(relayRoot_(),'responses/'+slug+'/'+safeId_(item.id)+'.json',null);if(row)responses.push(row)});
    const nextOffset = offset+wanted.length;
    return relayJson_(200,{responses:responses,nextOffset:nextOffset,hasMore:nextOffset<index.length,total:index.length});
  }

  return relayJson_(405,{reason:'Method not allowed'});
}

function responseIndexPath_(slug){return 'responses/'+safeId_(slug)+'/index.json'}
function responseIndex_(slug,repair){
  const path=responseIndexPath_(slug),existing=readJsonPath_(relayRoot_(),path,null);
  if(Array.isArray(existing))return existing;
  if(!repair)return[];
  const rows=listJsonFolder_('responses/'+safeId_(slug)).filter(function(x){return x&&x.id});
  const index=rows.map(function(x){return{id:safeId_(x.id),receivedAt:Number(x.receivedAt||0)}}).filter(function(x){return x.id}).sort(function(a,b){return a.receivedAt-b.receivedAt||a.id.localeCompare(b.id)});
  writeJsonPath_(relayRoot_(),path,index);
  return index;
}

function postRecording_(slug,headers,body) {
  if (String(body||'').length > EVE_MAX_RECORDING_CHARS) return relayJson_(413,{reason:'This recording is larger than the Google Workspace response-service limit.'});
  const study = readJsonPath_(relayRoot_(),studyPath_(slug),null);
  if (!study) return relayJson_(404,{reason:'Study not found'});
  const data = parseJson_(body,'Invalid encrypted recording');
  const id = safeId_(data.id); if (!id || !data.envelope) return relayJson_(400,{reason:'Invalid encrypted recording'});
  const path = 'recordings/'+slug+'/'+id+'.json', old = readJsonPath_(relayRoot_(),path,null);
  if (old) {
    const v = Number(old.routing && old.routing.version || study.latestVersion);
    if (!participantOk_(headers,study,v)) return relayJson_(403,{reason:'Participant capability rejected'});
    return relayJson_(200,{ok:true,receivedAt:old.receivedAt,version:v,id:id,idempotent:true});
  }
  const reason = closedReason_(study); if (reason) return relayJson_(410,{reason:reason});
  const routing = data.routing || {}, version = Number(routing.version || study.latestVersion);
  if (!publicationFor_(study,version)) return relayJson_(409,{reason:'The referenced study version does not exist.'});
  if (!participantOk_(headers,study,version)) return relayJson_(403,{reason:'Participant capability rejected'});

  return withScriptLock_(function () {
    if (countJsonFiles_('recordings/'+slug) >= EVE_MAX_RECORDINGS) return relayJson_(507,{reason:'This study has reached its recording storage limit.'});
    const receivedAt = Date.now();
    writeJsonPath_(relayRoot_(),path,{id:id,envelope:data.envelope,receivedAt:receivedAt,routing:{responseId:safeId_(routing.responseId),blockId:safeId_(routing.blockId),source:routing.source||'direct',campaignId:routing.campaignId||null,segmentId:routing.segmentId||null,version:version}});
    return relayJson_(201,{ok:true,receivedAt:receivedAt,version:version,id:id,idempotent:false});
  });
}

function getRecording_(slug,id,headers) {
  const study = readJsonPath_(relayRoot_(),studyPath_(slug),null);
  if (!study) return relayJson_(404,{reason:'Study not found'});
  if (!ownerHeaderOk_(headers) || !adminOk_(headers,study)) return relayJson_(403,{reason:'Admin capability rejected'});
  const record = readJsonPath_(relayRoot_(),'recordings/'+slug+'/'+safeId_(id)+'.json',null);
  return record?relayJson_(200,record):relayJson_(404,{reason:'Recording not found'});
}

function postInvitations_(slug,headers,body) {
  const study = readJsonPath_(relayRoot_(),studyPath_(slug),null);
  if (!study) return relayJson_(404,{reason:'Study not found'});
  if (!ownerHeaderOk_(headers) || !adminOk_(headers,study)) return relayJson_(403,{reason:'Admin capability rejected'});
  const data = parseJson_(body,'Invalid invitations body');
  return withScriptLock_(function () {
    const path = 'invitations/'+slug+'.json', existing = readJsonPath_(relayRoot_(),path,[]), seen = {};
    existing.forEach(function(x){seen[x.tokenHash]=true});
    (data.invitations||[]).forEach(function(inv){
      const tokenHash=sha256Hex_(inv.token||''),version=Number(inv.version||study.latestVersion);
      if (!publicationFor_(study,version)) throw new Error('Study version '+version+' does not exist.');
      if (seen[tokenHash]) return;
      existing.push({tokenHash:tokenHash,campaignId:String(inv.campaignId||''),segmentId:String(inv.segmentId||''),version:version,emailHash:String(inv.emailHash||''),createdAt:Date.now(),usedAt:null});
      seen[tokenHash]=true;
    });
    writeJsonPath_(relayRoot_(),path,existing);
    return relayJson_(200,{ok:true,count:existing.length});
  });
}

function requireResearcherOwner_(ownerKey) {
  const props = PropertiesService.getScriptProperties();
  const ownerHash = props.getProperty(EVE_PROP_OWNER_HASH)||'';
  if (!ownerHash) throw new Error('Run Eve setup from the copied Google Sheet first.');
  if (!safeEqual_(ownerHash,sha256Hex_(ownerKey||''))) throw new Error('Eve owner capability rejected.');
}

function ownerHeaderOk_(headers) {
  const expected = PropertiesService.getScriptProperties().getProperty(EVE_PROP_OWNER_HASH)||'';
  return !!expected && safeEqual_(expected,sha256Hex_(header_(headers,'x-eve-owner')||''));
}
function adminOk_(headers,record){return safeEqual_(String(record&&record.adminHash||''),sha256Hex_(header_(headers,'x-researchos-admin')||''))}
function participantOk_(headers,record,version){const pub=publicationFor_(record,version),expected=String(pub&&pub.metadata&&pub.metadata.participantHash||'');return !expected || safeEqual_(expected,header_(headers,'x-eve-participant')||'')}
function publicationFor_(record,version){return record && record.versions && record.versions[String(Number(version||record.latestVersion||0))] || null}
function closedReason_(record){if(!record)return'Study not found';if(!record.lifecycle||record.lifecycle.status!=='live')return'This study is not currently accepting responses.';const close=Date.parse(record.lifecycle.closeAtUtc||'');if(isFinite(close)&&Date.now()>close)return'This study has reached its closing time.';return''}
function studyPath_(slug){return 'studies/'+safeId_(slug)+'/record.json'}

function activeResearcherEmail_(){try{return String(Session.getActiveUser().getEmail()||'').trim()}catch(e){return''}}
function normaliseEmail_(value){return String(value||'').trim().toLowerCase()}
function sha256Hex_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(value||''),Utilities.Charset.UTF_8).map(function(b){const n=(b+256)%256;return ('0'+n.toString(16)).slice(-2)}).join('')}
function safeEqual_(a,b){a=String(a||'');b=String(b||'');if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0}
function safeId_(value){const s=String(value||'');return /^[A-Za-z0-9_-]{1,220}$/.test(s)?s:''}
function safeStoragePath_(path){const parts=String(path||'').replace(/^\/+|\/+$/g,'').split('/').filter(Boolean);if(!parts.length||parts.length>20)throw new Error('Invalid Eve storage path.');parts.forEach(function(x){if(x==='.'||x==='..'||x.length>180||/[\\\0]/.test(x))throw new Error('Invalid Eve storage path.')});return parts.join('/')}
function parseJson_(text,message){try{return JSON.parse(String(text||''))}catch(e){throw new Error(message)}}
function header_(headers,name){return headers[String(name).toLowerCase()]||''}
function normaliseHeaders_(headers){const out={};Object.keys(headers||{}).forEach(function(k){out[String(k).toLowerCase()]=String(headers[k])});return out}
function parseRequestPath_(raw){const value=String(raw||'/');const q=value.indexOf('?');const path=q>=0?value.slice(0,q):value,query={};if(q>=0)value.slice(q+1).split('&').forEach(function(part){if(!part)return;const pair=part.split('=');query[decodeURIComponent(pair[0]||'')]=decodeURIComponent((pair.slice(1).join('=')||'').replace(/\+/g,' '))});return{path:path||'/',query:query}}
function relayJson_(status,data){return{status:status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(data)}}

function driveStore_(){
  if(typeof globalThis!=='undefined'&&globalThis.__EVE_TEST_DRIVE__)return globalThis.__EVE_TEST_DRIVE__;
  return driveRestBackend_();
}

function driveRestBackend_(){
  return {
    get:function(id){try{return driveApiJson_('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?fields=id,name,mimeType,modifiedTime,trashed,parents,driveId&supportsAllDrives=true')}catch(e){if(/\b404\b/.test(String(e.message||e)))return null;throw e}},
    find:function(parentId,name,mimeType){
      const clauses=["'"+driveQueryValue_(parentId)+"' in parents","name = '"+driveQueryValue_(name)+"'","trashed = false"];
      if(mimeType)clauses.push("mimeType = '"+driveQueryValue_(mimeType)+"'");
      const q=encodeURIComponent(clauses.join(' and '));
      const data=driveApiJson_('https://www.googleapis.com/drive/v3/files?q='+q+'&spaces=drive&pageSize=10&fields=files(id,name,mimeType,modifiedTime,parents,driveId)&supportsAllDrives=true&includeItemsFromAllDrives=true');
      return data.files&&data.files[0]||null;
    },
    list:function(parentId){
      const q=encodeURIComponent("'"+driveQueryValue_(parentId)+"' in parents and trashed = false");
      const data=driveApiJson_('https://www.googleapis.com/drive/v3/files?q='+q+'&spaces=drive&pageSize=1000&fields=files(id,name,mimeType,modifiedTime,parents,driveId)&supportsAllDrives=true&includeItemsFromAllDrives=true');
      return data.files||[];
    },
    createFolder:function(parentId,name){
      return driveApiJson_('https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,modifiedTime,parents,driveId&supportsAllDrives=true',{
        method:'post',contentType:'application/json',payload:JSON.stringify({name:name,mimeType:'application/vnd.google-apps.folder',parents:[parentId]})
      });
    },
    writeText:function(parentId,name,content,existingId){
      let id=existingId;
      if(!id){
        const created=driveApiJson_('https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,modifiedTime,parents,driveId&supportsAllDrives=true',{
          method:'post',contentType:'application/json',payload:JSON.stringify({name:name,mimeType:'text/plain',parents:[parentId]})
        });
        id=created.id;
      }
      driveApiRaw_('https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(id)+'?uploadType=media&supportsAllDrives=true',{
        method:'patch',contentType:'text/plain; charset=utf-8',payload:String(content||'')
      });
      return this.get(id)||{id:id,name:name,mimeType:'text/plain',modifiedTime:new Date().toISOString(),parents:[parentId]};
    },
    readText:function(id){
      return driveApiRaw_('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?alt=media&supportsAllDrives=true').getContentText('UTF-8');
    },
    trash:function(id){
      driveApiJson_('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?fields=id,trashed&supportsAllDrives=true',{
        method:'patch',contentType:'application/json',payload:JSON.stringify({trashed:true})
      });
      return true;
    }
  };
}

function driveApiRaw_(url,options){
  const opts={muteHttpExceptions:true,...(options||{})};
  opts.headers={Authorization:'Bearer '+ScriptApp.getOAuthToken(),...(opts.headers||{})};
  const res=UrlFetchApp.fetch(url,opts),status=res.getResponseCode();
  if(status<200||status>=300)throw new Error('Google Drive API HTTP '+status+': '+String(res.getContentText()||'').slice(0,500));
  return res;
}
function driveApiJson_(url,options){const text=driveApiRaw_(url,options).getContentText('UTF-8');return text?JSON.parse(text):{}}
function driveQueryValue_(value){return String(value||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'")}
function modifiedMs_(value){const n=Date.parse(String(value||''));return isFinite(n)?n:Date.now()}
function driveOwnership_(root){return root&&root.driveId?'Shared Drive':'My Drive'}

function eveRootFolder_(){
  const props=PropertiesService.getScriptProperties(),store=driveStore_();
  let id=props.getProperty(EVE_PROP_ROOT);
  if(id){const existing=store.get(id);if(existing&&!existing.trashed)return existing;props.deleteProperty(EVE_PROP_ROOT)}
  let root=store.find('root',EVE_ROOT_NAME,'application/vnd.google-apps.folder');
  if(!root)root=store.createFolder('root',EVE_ROOT_NAME);
  props.setProperty(EVE_PROP_ROOT,root.id);return root;
}
function workspaceRoot_(){return ensureChildFolder_(eveRootFolder_(),'Workspace')}
function relayRoot_(){return ensureChildFolder_(eveRootFolder_(),'Relay')}
function ensureChildFolder_(parent,name){const store=driveStore_();return store.find(parent.id,name,'application/vnd.google-apps.folder')||store.createFolder(parent.id,name)}
function findChildFolder_(parent,name){return driveStore_().find(parent.id,name,'application/vnd.google-apps.folder')}
function findChildFile_(parent,name){const item=driveStore_().find(parent.id,name);return item&&item.mimeType!=='application/vnd.google-apps.folder'?item:null}
function folderForPath_(root,segments,create){let folder=root;segments.forEach(function(name){let next=findChildFolder_(folder,name);if(!next&&create)next=ensureChildFolder_(folder,name);if(!next)throw new Error('Folder not found: '+name);folder=next});return folder}
function fileAtPath_(root,path,createFolders){const parts=safeStoragePath_(path).split('/'),name=parts.pop();let folder;try{folder=folderForPath_(root,parts,!!createFolders)}catch(e){return null}return findChildFile_(folder,name)}
function writeTextPath_(root,path,content){const parts=safeStoragePath_(path).split('/'),name=parts.pop(),folder=folderForPath_(root,parts,true),existing=findChildFile_(folder,name);return driveStore_().writeText(folder.id,name,String(content||''),existing&&existing.id)}
function writeJsonPath_(root,path,value){return writeTextPath_(root,path,JSON.stringify(value))}
function readJsonPath_(root,path,fallback){const file=fileAtPath_(root,path,false);if(!file)return fallback;try{return JSON.parse(driveStore_().readText(file.id))}catch(e){return fallback}}
function trashPath_(root,path){const safe=safeStoragePath_(path),parts=safe.split('/'),name=parts.pop(),parent=folderForPath_(root,parts,false),item=findChildFile_(parent,name)||findChildFolder_(parent,name);if(item){driveStore_().trash(item.id);return true}return false}
function listJsonFolder_(path){const parts=safeStoragePath_(path).split('/');let folder;try{folder=folderForPath_(relayRoot_(),parts,false)}catch(e){return[]}const rows=[];for(const f of driveStore_().list(folder.id)){if(f.mimeType==='application/vnd.google-apps.folder'||!/\.json$/i.test(f.name))continue;try{rows.push(JSON.parse(driveStore_().readText(f.id)))}catch(e){}}return rows}
function countJsonFiles_(path){const parts=safeStoragePath_(path).split('/');let folder;try{folder=folderForPath_(relayRoot_(),parts,false)}catch(e){return 0}return driveStore_().list(folder.id).filter(x=>x.mimeType!=='application/vnd.google-apps.folder'&&/\.json$/i.test(x.name)).length}
function collectFiles_(folder,prefix,out){for(const item of driveStore_().list(folder.id)){if(item.mimeType==='application/vnd.google-apps.folder'){const next=(prefix?prefix+'/':'')+item.name;collectFiles_(item,next,out)}else out.push({path:(prefix?prefix+'/':'')+item.name,updatedAt:modifiedMs_(item.modifiedTime)})}}

function withScriptLock_(fn){const lock=LockService.getScriptLock();lock.waitLock(30000);try{return fn()}finally{lock.releaseLock()}}
