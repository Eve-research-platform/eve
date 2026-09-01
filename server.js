'use strict';
const http=require('http');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');

const REPO_ROOT=__dirname;
const STATIC_ROOT=path.join(REPO_ROOT,'app');
const DATA=process.env.RESEARCHOS_RELAY_DATA||path.join(REPO_ROOT,'relay-data');
const PORT=Number(process.env.PORT||8787);
const HOST=process.env.HOST||'127.0.0.1';
const MAX_BODY=2*1024*1024;
const MAX_RECORDING_BODY=128*1024*1024;
const MAX_RESPONSES_PER_STUDY=Math.max(100,Number(process.env.EVE_MAX_RESPONSES_PER_STUDY||10000));
const MAX_RECORDINGS_PER_STUDY=Math.max(50,Number(process.env.EVE_MAX_RECORDINGS_PER_STUDY||5000));

const { createRuntimeConfig } = require('./lib/runtime_config');
const { createRelayResponseIndex } = require('./lib/relay_response_index');
const {createPlatformServices,controlPlanePath}=require('./lib/platform_services');
const {bufferedResponse}=require('./lib/http_buffer');
const eveRuntime=createRuntimeConfig({root:REPO_ROOT});


fs.mkdirSync(DATA,{recursive:true,mode:0o700});
try{fs.chmodSync(DATA,0o700)}catch{}
const studiesDir=path.join(DATA,'studies');
const responsesDir=path.join(DATA,'responses');
const invitesDir=path.join(DATA,'invitations');
const recordingsDir=path.join(DATA,'recordings');
for(const d of [studiesDir,responsesDir,invitesDir,recordingsDir]){fs.mkdirSync(d,{recursive:true,mode:0o700});try{fs.chmodSync(d,0o700)}catch{}}

const safeId=v=>String(v||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,160);
const studyFile=slug=>path.join(studiesDir,`${safeId(slug)}.json`);
const responsePath=slug=>path.join(responsesDir,safeId(slug));
const inviteFile=slug=>path.join(invitesDir,`${safeId(slug)}.json`);
const recordingPath=slug=>path.join(recordingsDir,safeId(slug));
const sha=v=>crypto.createHash('sha256').update(String(v||'')).digest('base64url');

function readJson(file,fallback=null){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}}
function writeJsonAtomic(file,data){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const tmp=`${file}.${process.pid}.${Date.now()}.tmp`;fs.writeFileSync(tmp,JSON.stringify(data),{mode:0o600});fs.renameSync(tmp,file);try{fs.chmodSync(file,0o600)}catch{}}
function json(res,status,data){const payload=JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(payload),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(payload);return true}
function body(req,maxBytes=MAX_BODY){return new Promise((resolve,reject)=>{let size=0,parts=[];req.on('data',c=>{size+=c.length;if(size>maxBytes){reject(Object.assign(new Error('Body too large'),{status:413}));req.destroy();return}parts.push(c)});req.on('end',()=>{try{resolve(parts.length?JSON.parse(Buffer.concat(parts).toString('utf8')):{})}catch{reject(Object.assign(new Error('Invalid JSON'),{status:400}))}});req.on('error',reject)})}
function adminOk(req,record){const token=req.headers['x-researchos-admin'];if(!token||!record?.adminHash)return false;const a=Buffer.from(sha(token)),b=Buffer.from(record.adminHash);return a.length===b.length&&crypto.timingSafeEqual(a,b)}
function equalText(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function participantOk(req,record,version){const pub=publicationFor(record,version),expected=String(pub?.metadata?.participantHash||'');if(!expected)return true;return equalText(req.headers['x-eve-participant'],expected)}
function jsonFileCount(dir){try{return fs.readdirSync(dir).filter(x=>x.endsWith('.json')&&x!=='_index.json').length}catch{return 0}}
const relayResponseIndex=createRelayResponseIndex({responsePath,safeId});
function normalizeRecord(record){
 if(!record)return null;
 if(!record.versions||typeof record.versions!=='object')record.versions={};
 if(record.envelope&&record.metadata?.version&&!record.versions[String(record.metadata.version)])record.versions[String(record.metadata.version)]={envelope:record.envelope,metadata:{...record.metadata}};
 const versions=Object.keys(record.versions).map(Number).filter(Number.isFinite);
 record.latestVersion=versions.length?Math.max(...versions):Number(record.latestVersion||record.metadata?.version||0);
 record.lifecycle=record.lifecycle||{status:record.metadata?.status||'closed',closeAtUtc:record.metadata?.closeAtUtc||''};
 return record;
}
function publicationFor(record,version=null){record=normalizeRecord(record);if(!record)return null;const v=Number(version||record.latestVersion);return record.versions?.[String(v)]||null}
function isClosed(record){record=normalizeRecord(record);if(!record)return 'Study not found';if(record.lifecycle?.status!=='live')return 'This study is not currently accepting responses.';const close=Date.parse(record.lifecycle?.closeAtUtc||'');if(Number.isFinite(close)&&Date.now()>close)return 'This study has reached its closing time.';return ''}

function staticFile(req,res){
 let rel;try{rel=decodeURIComponent(new URL(req.url,'http://x').pathname)}catch{return json(res,400,{error:'Bad request'})}if(rel==='/'||!rel)rel='/index.html';
 rel=rel.replace(/^\/+/, '/');
 const file=path.normalize(path.join(STATIC_ROOT,rel)),relative=path.relative(STATIC_ROOT,file);
 if(relative.startsWith('..')||path.isAbsolute(relative)||file===DATA||file.startsWith(DATA+path.sep))return json(res,404,{error:'Not found'});
 fs.stat(file,(err,st)=>{if(err||!st.isFile())return json(res,404,{error:'Not found'});const ext=path.extname(file).toLowerCase(),types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json','.png':'image/png','.ico':'image/x-icon'};res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':ext==='.html'?'no-cache':'public, max-age=300','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Opener-Policy':'same-origin-allow-popups'});fs.createReadStream(file).pipe(res)})
}


// EVE_V52_FOUNDATION
let stateStore=null,eveV52=null,liveSecurity=null,cloudConnectors=null,organisationStorage=null;

async function api(req,res,url){
 if(controlPlanePath(url.pathname)){
  const buffered=bufferedResponse(res);
  const handled=await stateStore.withControlPlane(async()=>{if(await eveV52.handle(req,buffered,url))return true;if(await cloudConnectors.handle(req,buffered,url))return true;if(await organisationStorage.handle(req,buffered,url))return true;return false});
  if(handled){buffered.commit();return true}
 }
 const relayMatch=url.pathname.match(/^\/api\/studies\/([A-Za-z0-9_-]+)(?:\/|$)/);
 if(relayMatch&&stateStore.info().postgres&&!req.__eveRelayLocked){req.__eveRelayLocked=true;return stateStore.advisoryLock(`relay-study:${safeId(relayMatch[1])}`,()=>api(req,res,url))}

 if(url.pathname==='/api/health'&&req.method==='GET'){const readiness=liveSecurity.readiness(),database=await stateStore.health();return json(res,database.ok?200:503,{ok:database.ok,mode:'zero-access-relay',now:Date.now(),liveMode:readiness.liveMode,stateBackend:database.backend,database})}
 if(url.pathname==='/api/readiness'&&req.method==='GET'){const readiness=liveSecurity.readiness(),database=await stateStore.health(),ready=readiness.ready&&database.ok;return json(res,ready?200:503,{ok:ready,ready,liveMode:readiness.liveMode,stateBackend:database.backend,database})}

 let m=url.pathname.match(/^\/api\/studies\/([A-Za-z0-9_-]+)$/);
 if(m){
  const slug=safeId(m[1]),file=studyFile(slug);let existing=normalizeRecord(readJson(file));
  if(req.method==='PUT'){
   const data=await body(req);if(!data.envelope||!data.adminToken||!data.metadata)return json(res,400,{reason:'Missing encrypted publication fields'});
   const incomingVersion=Number(data.metadata.version||0);if(!Number.isFinite(incomingVersion)||incomingVersion<1)return json(res,400,{reason:'Invalid study version'});
   if(!['live','closed'].includes(data.metadata.status))return json(res,400,{reason:'Invalid study status'});
   if(data.metadata.closeAtUtc&&!Number.isFinite(Date.parse(data.metadata.closeAtUtc)))return json(res,400,{reason:'Invalid closing timestamp'});
   const previousLatest=existing?Number(existing.latestVersion||0):0;
   if(existing){
    if(!adminOk(req,existing))return json(res,403,{reason:'Admin capability rejected'});
    if(incomingVersion<previousLatest)return json(res,409,{reason:`Version must be v${previousLatest} or newer.`});
   }
   const record=existing||{slug,versions:{},latestVersion:0,adminHash:sha(data.adminToken),lifecycle:{status:'closed',closeAtUtc:''}};
   // Same-version PUT is deliberately idempotent for the same administrator.
   // It lets the browser safely retry after an interrupted/ambiguous network response.
   record.versions[String(incomingVersion)]={envelope:data.envelope,metadata:{...data.metadata,version:incomingVersion}};
   record.latestVersion=Math.max(Number(record.latestVersion||0),incomingVersion);record.lifecycle={status:data.metadata.status,closeAtUtc:data.metadata.closeAtUtc||''};record.updatedAt=Date.now();
   writeJsonAtomic(file,record);return json(res,200,{ok:true,updatedAt:record.updatedAt,version:incomingVersion,idempotent:!!existing&&incomingVersion===previousLatest})
  }
  if(req.method==='PATCH'){
   if(!existing)return json(res,404,{reason:'Study not found'});if(!adminOk(req,existing))return json(res,403,{reason:'Admin capability rejected'});
   const data=await body(req);if(data.status!==undefined&&!['live','closed'].includes(data.status))return json(res,400,{reason:'Invalid study status'});if(data.closeAtUtc&&!Number.isFinite(Date.parse(data.closeAtUtc)))return json(res,400,{reason:'Invalid closing timestamp'});
   existing.lifecycle={...existing.lifecycle,...Object.fromEntries(Object.entries(data).filter(([k])=>['status','closeAtUtc'].includes(k)))};existing.updatedAt=Date.now();writeJsonAtomic(file,existing);return json(res,200,{ok:true,version:existing.latestVersion})
  }
  if(req.method==='DELETE'){
   if(!existing)return json(res,404,{reason:'Study not found'});if(!adminOk(req,existing))return json(res,403,{reason:'Admin capability rejected'});
   fs.rmSync(file,{force:true});fs.rmSync(responsePath(slug),{recursive:true,force:true});fs.rmSync(recordingPath(slug),{recursive:true,force:true});fs.rmSync(inviteFile(slug),{force:true});
   return json(res,200,{ok:true,deleted:true,slug})
  }
  if(req.method==='GET'){
   if(!existing)return json(res,404,{reason:'Study not found'});const closed=isClosed(existing);if(closed)return json(res,410,{reason:closed});
   const requested=url.searchParams.get('version'),version=Number(requested||existing.latestVersion),pub=publicationFor(existing,version);if(!pub)return json(res,404,{reason:'Published study version not found'});if(!participantOk(req,existing,version))return json(res,403,{reason:'Participant capability rejected'});
   return json(res,200,{envelope:pub.envelope,metadata:{...pub.metadata,status:existing.lifecycle.status,closeAtUtc:existing.lifecycle.closeAtUtc,latestVersion:existing.latestVersion}})
  }
 }


 m=url.pathname.match(/^\/api\/studies\/([A-Za-z0-9_-]+)\/status$/);
 if(m&&req.method==='GET'){
  const slug=safeId(m[1]),study=normalizeRecord(readJson(studyFile(slug)));
  if(!study)return json(res,404,{reason:'Study not found'});
  if(!adminOk(req,study))return json(res,403,{reason:'Admin capability rejected'});
  return json(res,200,{ok:true,latestVersion:Number(study.latestVersion||0),versions:Object.keys(study.versions||{}).map(Number).filter(Number.isFinite).sort((a,b)=>a-b),lifecycle:{status:study.lifecycle?.status||'closed',closeAtUtc:study.lifecycle?.closeAtUtc||''},updatedAt:Number(study.updatedAt||0)});
 }
 m=url.pathname.match(/^\/api\/studies\/([A-Za-z0-9_-]+)\/recordings$/);
 if(m&&req.method==='POST'){
  const slug=safeId(m[1]),study=normalizeRecord(readJson(studyFile(slug)));if(!study)return json(res,404,{reason:'Study not found'});
  const data=await body(req,MAX_RECORDING_BODY);if(!data.id||!data.envelope||safeId(data.id)!==String(data.id))return json(res,400,{reason:'Invalid encrypted recording'});
  const dir=recordingPath(slug);fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,`${data.id}.json`),existing=readJson(file);
  if(existing){const existingVersion=Number(existing.routing?.version||study.latestVersion);if(!participantOk(req,study,existingVersion))return json(res,403,{reason:'Participant capability rejected'});return json(res,200,{ok:true,receivedAt:existing.receivedAt,version:existingVersion,id:data.id,idempotent:true})}
  const closed=isClosed(study);if(closed)return json(res,410,{reason:closed});
  const routing=data.routing||{},version=Number(routing.version||study.latestVersion);if(!publicationFor(study,version))return json(res,409,{reason:'The referenced study version does not exist.'});if(!participantOk(req,study,version))return json(res,403,{reason:'Participant capability rejected'});if(jsonFileCount(dir)>=MAX_RECORDINGS_PER_STUDY)return json(res,507,{reason:'This study has reached its recording storage limit.'});
  if(routing.segmentId){const invites=readJson(inviteFile(slug),[]),invite=invites.find(x=>x.tokenHash===sha(routing.inviteToken)&&x.segmentId===routing.segmentId&&x.campaignId===routing.campaignId&&Number(x.version||version)===version);if(!invite)return json(res,403,{reason:'This controlled-audience invitation is not valid.'});if(invite.usedAt)return json(res,409,{reason:'This invitation has already been used.'})}
  const receivedAt=Date.now();writeJsonAtomic(file,{id:data.id,envelope:data.envelope,receivedAt,routing:{responseId:safeId(routing.responseId),blockId:safeId(routing.blockId),source:routing.source||'direct',campaignId:routing.campaignId||null,segmentId:routing.segmentId||null,version}});
  return json(res,201,{ok:true,receivedAt,version,id:data.id,idempotent:false})
 }
 m=url.pathname.match(/^\/api\/studies\/([A-Za-z0-9_-]+)\/recordings\/([A-Za-z0-9_-]+)$/);
 if(m&&req.method==='GET'){
  const slug=safeId(m[1]),recordingId=safeId(m[2]),study=normalizeRecord(readJson(studyFile(slug)));if(!study)return json(res,404,{reason:'Study not found'});if(!adminOk(req,study))return json(res,403,{reason:'Admin capability rejected'});
  const file=path.join(recordingPath(slug),`${recordingId}.json`),record=readJson(file);if(!record)return json(res,404,{reason:'Recording not found'});return json(res,200,record)
 }

 m=url.pathname.match(/^\/api\/studies\/([A-Za-z0-9_-]+)\/responses$/);
 if(m){
  const slug=safeId(m[1]),study=normalizeRecord(readJson(studyFile(slug)));if(!study)return json(res,404,{reason:'Study not found'});
  if(req.method==='POST'){
   const data=await body(req);if(!data.id||!data.envelope||safeId(data.id)!==String(data.id))return json(res,400,{reason:'Invalid encrypted response'});
   const dir=responsePath(slug);fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,`${data.id}.json`),existing=readJson(file);
   if(existing){const existingVersion=Number(existing.routing?.version||study.latestVersion);if(!participantOk(req,study,existingVersion))return json(res,403,{reason:'Participant capability rejected'});return json(res,200,{ok:true,receivedAt:existing.receivedAt,version:existingVersion,id:data.id,idempotent:true})}
   const closed=isClosed(study);if(closed)return json(res,410,{reason:closed});
   const routing=data.routing||{},version=Number(routing.version||study.latestVersion);if(!publicationFor(study,version))return json(res,409,{reason:'The referenced study version does not exist.'});if(!participantOk(req,study,version))return json(res,403,{reason:'Participant capability rejected'});if(jsonFileCount(dir)>=MAX_RESPONSES_PER_STUDY)return json(res,507,{reason:'This study has reached its response storage limit.'});
   let invites=null,invite=null;if(routing.segmentId){invites=readJson(inviteFile(slug),[]);invite=invites.find(x=>x.tokenHash===sha(routing.inviteToken)&&x.segmentId===routing.segmentId&&x.campaignId===routing.campaignId&&Number(x.version||version)===version);if(!invite)return json(res,403,{reason:'This controlled-audience invitation is not valid.'});if(invite.usedAt)return json(res,409,{reason:'This invitation has already been used.'});invite.usedAt=Date.now();writeJsonAtomic(inviteFile(slug),invites)}
   const receivedAt=Date.now();try{writeJsonAtomic(file,{id:data.id,envelope:data.envelope,receivedAt,routing:{source:routing.source||'direct',campaignId:routing.campaignId||null,segmentId:routing.segmentId||null,version}});relayResponseIndex.append(slug,data.id,receivedAt)}catch(err){if(invite&&invites){invite.usedAt=null;try{writeJsonAtomic(inviteFile(slug),invites)}catch{}}throw err}
   return json(res,201,{ok:true,receivedAt,version,id:data.id,idempotent:false})
  }
  if(req.method==='GET'){
   if(!adminOk(req,study))return json(res,403,{reason:'Admin capability rejected'});const dir=responsePath(slug);fs.mkdirSync(dir,{recursive:true});const idx=relayResponseIndex.index(slug,true),offset=Math.max(0,Number(url.searchParams.get('offset')||0)||0),limit=Math.max(1,Math.min(500,Number(url.searchParams.get('limit')||250)||250)),wanted=idx.slice(offset,offset+limit),responses=wanted.map(x=>readJson(path.join(dir,`${safeId(x.id)}.json`))).filter(Boolean),nextOffset=offset+wanted.length;return json(res,200,{responses,nextOffset,hasMore:nextOffset<idx.length,total:idx.length})
  }
 }

 m=url.pathname.match(/^\/api\/studies\/([A-Za-z0-9_-]+)\/invitations$/);
 if(m&&req.method==='POST'){
  const slug=safeId(m[1]),study=normalizeRecord(readJson(studyFile(slug)));if(!study)return json(res,404,{reason:'Study not found'});if(!adminOk(req,study))return json(res,403,{reason:'Admin capability rejected'});
  const data=await body(req),existing=readJson(inviteFile(slug),[]),seen=new Set(existing.map(x=>x.tokenHash));for(const inv of data.invitations||[]){const tokenHash=sha(inv.token),version=Number(inv.version||study.latestVersion);if(!publicationFor(study,version))return json(res,409,{reason:`Study version ${version} does not exist.`});if(seen.has(tokenHash))continue;existing.push({tokenHash,campaignId:String(inv.campaignId||''),segmentId:String(inv.segmentId||''),version,emailHash:String(inv.emailHash||''),createdAt:Date.now(),usedAt:null});seen.add(tokenHash)}writeJsonAtomic(inviteFile(slug),existing);return json(res,200,{ok:true,count:existing.length})
 }
 return false;
}

async function start(){
 ({stateStore,eveV52,liveSecurity,cloudConnectors,organisationStorage}=await createPlatformServices({dataDir:DATA,json,body,publicOrigin:process.env.EVE_PUBLIC_ORIGIN||''}));
 const server=http.createServer(async(req,res)=>{try{liveSecurity.applyHeaders(req,res);const url=new URL(req.url,'http://localhost');if(liveSecurity.routeLimited(req,res,url))return;if(url.pathname==='/eve-runtime-config.js'&&req.method==='GET')return eveRuntime.serve(res);if(url.pathname.startsWith('/api/')){const handled=await api(req,res,url);if(handled!==false)return;return json(res,404,{reason:'API route not found'})}staticFile(req,res)}catch(err){console.error(err);if(!res.headersSent)json(res,err.status||500,{reason:err.status?err.message:'Internal relay error'})}});
 server.listen(PORT,HOST,()=>{const r=liveSecurity.readiness();console.log(`Eve running at http://${HOST==='0.0.0.0'?'localhost':HOST}:${PORT}${r.liveMode?' · LIVE MODE':''} · state=${stateStore.info().backend}`)});
 const shutdown=async()=>{try{await stateStore.close()}catch{};server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref()};process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);return server;
}
if(require.main===module)start().catch(err=>{console.error(err);process.exit(1)});
module.exports={start};
