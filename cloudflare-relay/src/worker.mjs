import {scheduleRecordingPurge,purgeExpiredRecordings} from './recording-retention.mjs';
const SAFE=/^[A-Za-z0-9_-]{1,220}$/;
const enc=new TextEncoder();

function corsHeaders(extra={}){
  return {
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type,X-ResearchOS-Admin,X-Eve-Participant,X-Eve-Owner',
    'Access-Control-Max-Age':'86400',
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer',
    ...extra
  };
}
function json(data,status=200,extra={}){
  return new Response(JSON.stringify(data),{status,headers:corsHeaders({'Content-Type':'application/json; charset=utf-8',...extra})});
}
function safe(value){const s=String(value||'');return SAFE.test(s)?s:''}
async function sha(value){
  const digest=await crypto.subtle.digest('SHA-256',enc.encode(String(value||'')));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function equalHash(value,expected){return !!expected&&(await sha(value))===expected}
async function getJson(bucket,key,fallback=null){
  const obj=await bucket.get(key);
  if(!obj)return fallback;
  try{return await obj.json()}catch{return fallback}
}
async function putJson(bucket,key,value){await bucket.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'}})}
function studyKey(slug){return `studies/${slug}/record.json`}
function responsePrefix(slug){return `responses/${slug}/`}
function recordingPrefix(slug){return `recordings/${slug}/`}
function inviteKey(slug){return `invitations/${slug}.json`}
async function ownerOk(request,env){
  const configured=String(env.EVE_RELAY_OWNER_KEY||'');
  if(!configured)return false;
  return equalHash(request.headers.get('X-Eve-Owner')||'',await sha(configured));
}
async function adminOk(request,env,study){
  return (await ownerOk(request,env))&&equalHash(request.headers.get('X-ResearchOS-Admin')||'',study?.adminHash||'');
}
function publicationFor(record,version=null){
  if(!record)return null;
  const v=Number(version||record.latestVersion||0);
  return record.versions?.[String(v)]||null;
}
function closedReason(record){
  if(!record)return'Study not found';
  if(record.lifecycle?.status!=='live')return'This study is not currently accepting responses.';
  const close=Date.parse(record.lifecycle?.closeAtUtc||'');
  if(Number.isFinite(close)&&Date.now()>close)return'This study has reached its closing time.';
  return'';
}
async function participantOk(request,record,version){
  const pub=publicationFor(record,version),expected=String(pub?.metadata?.participantHash||'');
  if(!expected)return true;
  return (request.headers.get('X-Eve-Participant')||'')===expected;
}
async function deletePrefix(bucket,prefix){
  let cursor;
  do{
    const listed=await bucket.list({prefix,cursor,limit:1000});
    if(listed.objects.length)await bucket.delete(listed.objects.map(x=>x.key));
    cursor=listed.truncated?listed.cursor:undefined;
  }while(cursor);
}
async function countPrefix(bucket,prefix,stopAt=Infinity){
  let cursor,count=0;
  do{
    const listed=await bucket.list({prefix,cursor,limit:1000});
    count+=listed.objects.length;
    if(count>=stopAt)return count;
    cursor=listed.truncated?listed.cursor:undefined;
  }while(cursor);
  return count;
}
async function listJson(bucket,prefix){
  let cursor,rows=[];
  do{
    const listed=await bucket.list({prefix,cursor,limit:1000});
    for(const obj of listed.objects){
      const row=await getJson(bucket,obj.key,null);
      if(row)rows.push(row);
    }
    cursor=listed.truncated?listed.cursor:undefined;
  }while(cursor);
  return rows;
}
async function handleStudy(request,env,url,slug){
  const bucket=env.EVE_RELAY;
  const key=studyKey(slug);
  const existing=await getJson(bucket,key,null);

  if(request.method==='PUT'){
    if(!await ownerOk(request,env))return json({reason:'Relay owner capability rejected'},403);
    let data;try{data=await request.json()}catch{return json({reason:'Invalid publication body'},400)}
    if(!data?.envelope||!data?.adminToken||!data?.metadata)return json({reason:'Missing encrypted publication fields'},400);
    const version=Number(data.metadata.version||0);
    if(!Number.isFinite(version)||version<1)return json({reason:'Invalid study version'},400);
    if(!['live','closed'].includes(data.metadata.status))return json({reason:'Invalid study status'},400);
    if(data.metadata.closeAtUtc&&!Number.isFinite(Date.parse(data.metadata.closeAtUtc)))return json({reason:'Invalid closing timestamp'},400);
    const previous=Number(existing?.latestVersion||0);
    if(existing){
      if(!await adminOk(request,env,existing))return json({reason:'Admin capability rejected'},403);
      if(version<previous)return json({reason:`Version must be v${previous} or newer.`},409);
    }
    const record=existing||{slug,versions:{},latestVersion:0,adminHash:await sha(data.adminToken),lifecycle:{status:'closed',closeAtUtc:''}};
    record.versions=record.versions||{};
    record.versions[String(version)]={envelope:data.envelope,metadata:{...data.metadata,version}};
    record.latestVersion=Math.max(Number(record.latestVersion||0),version);
    record.lifecycle={status:data.metadata.status,closeAtUtc:data.metadata.closeAtUtc||''};
    record.updatedAt=Date.now();
    await putJson(bucket,key,record);
    return json({ok:true,updatedAt:record.updatedAt,version,idempotent:!!existing&&version===previous});
  }

  if(request.method==='PATCH'){
    if(!existing)return json({reason:'Study not found'},404);
    if(!await adminOk(request,env,existing))return json({reason:'Admin capability rejected'},403);
    let data;try{data=await request.json()}catch{return json({reason:'Invalid lifecycle body'},400)}
    if(data.status!==undefined&&!['live','closed'].includes(data.status))return json({reason:'Invalid study status'},400);
    if(data.closeAtUtc&&!Number.isFinite(Date.parse(data.closeAtUtc)))return json({reason:'Invalid closing timestamp'},400);
    existing.lifecycle={...existing.lifecycle,...Object.fromEntries(Object.entries(data).filter(([k])=>k==='status'||k==='closeAtUtc'))};
    existing.updatedAt=Date.now();await putJson(bucket,key,existing);
    return json({ok:true,version:existing.latestVersion});
  }

  if(request.method==='DELETE'){
    if(!existing)return json({reason:'Study not found'},404);
    if(!await adminOk(request,env,existing))return json({reason:'Admin capability rejected'},403);
    await bucket.delete(key);await deletePrefix(bucket,responsePrefix(slug));await deletePrefix(bucket,recordingPrefix(slug));await bucket.delete(inviteKey(slug));
    return json({ok:true,deleted:true,slug});
  }

  if(request.method==='GET'){
    if(!existing)return json({reason:'Study not found'},404);
    const reason=closedReason(existing);if(reason)return json({reason},410);
    const version=Number(url.searchParams.get('version')||existing.latestVersion),pub=publicationFor(existing,version);
    if(!pub)return json({reason:'Published study version not found'},404);
    if(!await participantOk(request,existing,version))return json({reason:'Participant capability rejected'},403);
    return json({envelope:pub.envelope,metadata:{...pub.metadata,status:existing.lifecycle.status,closeAtUtc:existing.lifecycle.closeAtUtc,latestVersion:existing.latestVersion}});
  }
  return null;
}

async function handleApi(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders()});
  if(path==='/api/health'&&request.method==='GET')return json({ok:true,mode:'cloudflare-zero-access-relay',now:Date.now(),storage:'r2'});
  if(path==='/api/owner-check'&&request.method==='GET')return await ownerOk(request,env)?json({ok:true,owner:true}):json({ok:false,reason:'Relay owner capability rejected'},403);

  let m=path.match(/^\/api\/studies\/([A-Za-z0-9_-]+)$/);
  if(m){
    const slug=safe(m[1]);if(!slug)return json({reason:'Invalid study slug'},400);
    return await handleStudy(request,env,url,slug);
  }

  m=path.match(/^\/api\/studies\/([A-Za-z0-9_-]+)\/status$/);
  if(m&&request.method==='GET'){
    const slug=safe(m[1]),study=await getJson(env.EVE_RELAY,studyKey(slug),null);
    if(!study)return json({reason:'Study not found'},404);
    if(!await adminOk(request,env,study))return json({reason:'Admin capability rejected'},403);
    return json({ok:true,latestVersion:Number(study.latestVersion||0),versions:Object.keys(study.versions||{}).map(Number).filter(Number.isFinite).sort((a,b)=>a-b),lifecycle:{status:study.lifecycle?.status||'closed',closeAtUtc:study.lifecycle?.closeAtUtc||''},updatedAt:Number(study.updatedAt||0)});
  }

  m=path.match(/^\/api\/studies\/([A-Za-z0-9_-]+)\/responses$/);
  if(m){
    const slug=safe(m[1]),study=await getJson(env.EVE_RELAY,studyKey(slug),null);
    if(!study)return json({reason:'Study not found'},404);
    const prefix=responsePrefix(slug);
    if(request.method==='POST'){
      let data;try{data=await request.json()}catch{return json({reason:'Invalid encrypted response'},400)}
      const id=safe(data?.id);if(!id||!data?.envelope)return json({reason:'Invalid encrypted response'},400);
      const key=`${prefix}${id}.json`,old=await getJson(env.EVE_RELAY,key,null);
      if(old){
        const v=Number(old.routing?.version||study.latestVersion);
        if(!await participantOk(request,study,v))return json({reason:'Participant capability rejected'},403);
        return json({ok:true,receivedAt:old.receivedAt,version:v,id,idempotent:true});
      }
      const reason=closedReason(study);if(reason)return json({reason},410);
      const routing=data.routing||{},version=Number(routing.version||study.latestVersion);
      if(!publicationFor(study,version))return json({reason:'The referenced study version does not exist.'},409);
      if(!await participantOk(request,study,version))return json({reason:'Participant capability rejected'},403);
      const max=Math.max(100,Number(env.EVE_MAX_RESPONSES_PER_STUDY||10000));
      if(await countPrefix(env.EVE_RELAY,prefix,max)>=max)return json({reason:'This study has reached its response storage limit.'},507);
      let invites=null,invite=null;
      if(routing.segmentId){
        invites=await getJson(env.EVE_RELAY,inviteKey(slug),[]);
        const tokenHash=await sha(routing.inviteToken||'');
        invite=invites.find(x=>x.tokenHash===tokenHash&&x.segmentId===routing.segmentId&&x.campaignId===routing.campaignId&&Number(x.version||version)===version);
        if(!invite)return json({reason:'This controlled-audience invitation is not valid.'},403);
        if(invite.usedAt)return json({reason:'This invitation has already been used.'},409);
        invite.usedAt=Date.now();await putJson(env.EVE_RELAY,inviteKey(slug),invites);
      }
      const receivedAt=Date.now();
      await putJson(env.EVE_RELAY,key,{id,envelope:data.envelope,receivedAt,routing:{source:routing.source||'direct',campaignId:routing.campaignId||null,segmentId:routing.segmentId||null,version}});
      return json({ok:true,receivedAt,version,id,idempotent:false},201);
    }
    if(request.method==='GET'){
      if(!await adminOk(request,env,study))return json({reason:'Admin capability rejected'},403);
      const rows=(await listJson(env.EVE_RELAY,prefix)).sort((a,b)=>a.receivedAt-b.receivedAt||String(a.id).localeCompare(String(b.id)));
      const offset=Math.max(0,Number(url.searchParams.get('offset')||0)||0),limit=Math.max(1,Math.min(500,Number(url.searchParams.get('limit')||250)||250));
      const responses=rows.slice(offset,offset+limit),nextOffset=offset+responses.length;
      return json({responses,nextOffset,hasMore:nextOffset<rows.length,total:rows.length});
    }
  }

  m=path.match(/^\/api\/studies\/([A-Za-z0-9_-]+)\/recordings$/);
  if(m&&request.method==='POST'){
    const slug=safe(m[1]),study=await getJson(env.EVE_RELAY,studyKey(slug),null);
    if(!study)return json({reason:'Study not found'},404);
    const contentLength=Number(request.headers.get('content-length')||0),maxBytes=Math.max(1024*1024,Number(env.EVE_MAX_RECORDING_REQUEST_BYTES||60000000));
    if(contentLength&&contentLength>maxBytes)return json({reason:'This recording is larger than the configured relay upload limit.'},413);
    let data;try{data=await request.json()}catch{return json({reason:'Invalid encrypted recording'},400)}
    const id=safe(data?.id);if(!id||!data?.envelope)return json({reason:'Invalid encrypted recording'},400);
    const key=`${recordingPrefix(slug)}${id}.json`,old=await getJson(env.EVE_RELAY,key,null);
    if(old){
      const v=Number(old.routing?.version||study.latestVersion);
      if(!await participantOk(request,study,v))return json({reason:'Participant capability rejected'},403);
      return json({ok:true,receivedAt:old.receivedAt,version:v,id,idempotent:true});
    }
    const reason=closedReason(study);if(reason)return json({reason},410);
    const routing=data.routing||{},version=Number(routing.version||study.latestVersion);
    if(!publicationFor(study,version))return json({reason:'The referenced study version does not exist.'},409);
    if(!await participantOk(request,study,version))return json({reason:'Participant capability rejected'},403);
    const max=Math.max(50,Number(env.EVE_MAX_RECORDINGS_PER_STUDY||5000));
    if(await countPrefix(env.EVE_RELAY,recordingPrefix(slug),max)>=max)return json({reason:'This study has reached its recording storage limit.'},507);
    const receivedAt=Date.now();
    await putJson(env.EVE_RELAY,key,{id,envelope:data.envelope,receivedAt,routing:{responseId:safe(routing.responseId),blockId:safe(routing.blockId),source:routing.source||'direct',campaignId:routing.campaignId||null,segmentId:routing.segmentId||null,version}});
    return json({ok:true,receivedAt,version,id,idempotent:false},201);
  }

  m=path.match(/^\/api\/studies\/([A-Za-z0-9_-]+)\/recordings\/([A-Za-z0-9_-]+)$/);
  if(m){
    const slug=safe(m[1]),id=safe(m[2]),study=await getJson(env.EVE_RELAY,studyKey(slug),null);
    if(!study)return json({reason:'Study not found'},404);
    if(!await adminOk(request,env,study))return json({reason:'Admin capability rejected'},403);
    const key=`${recordingPrefix(slug)}${id}.json`;
    if(request.method==='GET'){
      const record=await getJson(env.EVE_RELAY,key,null);
      return record?json(record):json({reason:'Recording not found'},404);
    }
    if(request.method==='POST'){
      const retention=await scheduleRecordingPurge(env.EVE_RELAY,key,env);
      return retention?json({ok:true,retention}):json({reason:'Recording not found'},404);
    }
  }

  m=path.match(/^\/api\/studies\/([A-Za-z0-9_-]+)\/invitations$/);
  if(m&&request.method==='POST'){
    const slug=safe(m[1]),study=await getJson(env.EVE_RELAY,studyKey(slug),null);
    if(!study)return json({reason:'Study not found'},404);
    if(!await adminOk(request,env,study))return json({reason:'Admin capability rejected'},403);
    let data;try{data=await request.json()}catch{return json({reason:'Invalid invitations body'},400)}
    const existing=await getJson(env.EVE_RELAY,inviteKey(slug),[]),seen=new Set(existing.map(x=>x.tokenHash));
    for(const inv of data.invitations||[]){
      const tokenHash=await sha(inv.token||''),version=Number(inv.version||study.latestVersion);
      if(!publicationFor(study,version))return json({reason:`Study version ${version} does not exist.`},409);
      if(seen.has(tokenHash))continue;
      existing.push({tokenHash,campaignId:String(inv.campaignId||''),segmentId:String(inv.segmentId||''),version,emailHash:String(inv.emailHash||''),createdAt:Date.now(),usedAt:null});
      seen.add(tokenHash);
    }
    await putJson(env.EVE_RELAY,inviteKey(slug),existing);
    return json({ok:true,count:existing.length});
  }

  // Panel membership/email is intentionally not implemented in the zero-access
  // relay. It requires a separate public operational service because it handles PII.
  if(path.startsWith('/api/panel/'))return json({reason:'Participant Panel is not available through the standalone Cloudflare relay yet.'},501);

  return json({reason:'API route not found'},404);
}

function secureStatic(response){
  const h=new Headers(response.headers);
  h.set('Access-Control-Allow-Origin','*');
  h.set('X-Content-Type-Options','nosniff');
  h.set('Referrer-Policy','no-referrer');
  h.set('X-Frame-Options','DENY');
  h.set('Permissions-Policy','geolocation=()');
  h.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h});
}

export default {
  async scheduled(controller,env){await purgeExpiredRecordings(env.EVE_RELAY,Number(controller?.scheduledTime)||Date.now())},
  async fetch(request,env){
    const url=new URL(request.url);
    try{
      if(url.pathname.startsWith('/api/'))return await handleApi(request,env);
      if(!env.ASSETS)return json({reason:'Participant assets binding is not configured.'},503);
      return secureStatic(await env.ASSETS.fetch(request));
    }catch(err){
      console.error('Eve relay error',err);
      return json({reason:'Internal relay error'},500);
    }
  }
};
