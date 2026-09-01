'use strict';

const fs=require('fs');
const path=require('path');

function truthy(v){return ['1','true','yes','on'].includes(String(v||'').trim().toLowerCase())}
function cleanOrigin(v){return String(v||'').trim().replace(/\/+$/,'')}

function createLiveSecurity({dataDir,control,json,stateStore=null}={}){
  if(!dataDir||!control||typeof json!=='function')throw new Error('live security requires dataDir, control and json');
  const liveMode=truthy(process.env.EVE_LIVE_MODE);
  const trustProxy=truthy(process.env.EVE_TRUST_PROXY);
  const buckets=new Map();
  let requestCount=0;

  function secureRequest(req){
    return !!(req.socket&&req.socket.encrypted)||
      String(req.headers['x-forwarded-proto']||'').split(',')[0].trim().toLowerCase()==='https';
  }

  function clientIp(req){
    if(trustProxy){
      const forwarded=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();
      if(forwarded)return forwarded.slice(0,120);
    }
    return String(req.socket?.remoteAddress||'unknown').slice(0,120);
  }

  function applyHeaders(req,res){
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Cross-Origin-Opener-Policy','same-origin-allow-popups');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    res.setHeader('Permissions-Policy','camera=(self), microphone=(self), display-capture=(self), geolocation=()');
    res.setHeader('Content-Security-Policy',[
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob:",
      "connect-src 'self' https:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'"
    ].join('; '));
    if(secureRequest(req))res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  }

  function prune(now){
    if(++requestCount%250!==0)return;
    for(const [key,row] of buckets)if(row.resetAt<=now)buckets.delete(key);
  }

  function limit(req,res,key,max,windowMs){
    const now=Date.now();prune(now);
    const bucketKey=`${clientIp(req)}|${key}`;
    let row=buckets.get(bucketKey);
    if(!row||row.resetAt<=now){row={count:0,resetAt:now+windowMs};buckets.set(bucketKey,row)}
    row.count++;
    if(row.count<=max)return false;
    res.setHeader('Retry-After',String(Math.max(1,Math.ceil((row.resetAt-now)/1000))));
    json(res,429,{ok:false,error:'rate_limited',reason:'Too many requests. Please wait and try again.'});
    return true;
  }

  function routeLimited(req,res,url){
    const p=url.pathname,method=req.method||'GET';
    if(p==='/api/auth/login'&&method==='POST')return limit(req,res,'auth-login',10,15*60_000);
    if(/^\/api\/connectors\/(google|microsoft)\/start$/.test(p)&&method==='GET')return limit(req,res,'connector-start',20,15*60_000);
    let m=p.match(/^\/api\/studies\/([A-Za-z0-9_-]+)$/);
    if(m&&method==='GET')return limit(req,res,`study-get:${m[1]}`,180,60_000);
    if(m&&method==='PUT')return limit(req,res,'study-publish',Math.max(5,Number(process.env.EVE_STUDY_PUBLISH_RATE_PER_10_MINUTES||30)),10*60_000);
    if(p==='/api/panel/join'&&method==='POST')return limit(req,res,'panel-join',Math.max(3,Number(process.env.EVE_PANEL_JOIN_RATE_PER_10_MINUTES||20)),10*60_000);
    if(p==='/api/panel/participation'&&method==='POST')return limit(req,res,'panel-participation',Math.max(10,Number(process.env.EVE_PANEL_PARTICIPATION_RATE_PER_MINUTE||60)),60_000);
    m=p.match(/^\/api\/studies\/([A-Za-z0-9_-]+)\/responses$/);
    if(m&&method==='POST')return limit(req,res,`response:${m[1]}`,Math.max(5,Number(process.env.EVE_RESPONSE_RATE_PER_MINUTE||30)),60_000);
    m=p.match(/^\/api\/studies\/([A-Za-z0-9_-]+)\/recordings$/);
    if(m&&method==='POST')return limit(req,res,`recording:${m[1]}`,Math.max(3,Number(process.env.EVE_RECORDING_RATE_PER_10_MINUTES||30)),10*60_000);
    return false;
  }

  function writable(){
    try{
      fs.mkdirSync(dataDir,{recursive:true});
      const file=path.join(dataDir,`.eve-write-probe-${process.pid}-${Date.now()}`);
      fs.writeFileSync(file,'ok',{mode:0o600});fs.rmSync(file,{force:true});return true;
    }catch{return false}
  }

  function freeBytes(){
    try{
      const stat=fs.statfsSync(dataDir);
      return Number(stat.bavail)*Number(stat.bsize);
    }catch{return null}
  }

  function readiness(){
    const origin=cleanOrigin(process.env.EVE_PUBLIC_ORIGIN);
    const originHttps=origin.startsWith('https://');
    const persistentDataPathConfigured=!!String(process.env.RESEARCHOS_RELAY_DATA||'').trim();
    const dbInfo=stateStore?.info?.()||{backend:'file',postgres:false};
    const checks={authentication:!!control.isConfigured?.(),persistentDataPathConfigured,persistentStorageWritable:writable(),publicHttpsOrigin:originHttps,databaseStateReady:!dbInfo.postgres||!!stateStore?.isReady?.(),externalFontDependency:false};
    const required=liveMode?['authentication','persistentDataPathConfigured','persistentStorageWritable','publicHttpsOrigin','databaseStateReady']:['persistentStorageWritable'];
    const ready=required.every(k=>checks[k]===true);
    return {
      liveMode,ready,checks,
      publicOriginConfigured:!!origin,
      trustProxy,
      stateBackend:(stateStore?.info?.().backend||'file'),
      concurrentControlPlane:!!stateStore?.info?.().concurrent,
      freeBytes:freeBytes(),
      nodeEnv:String(process.env.NODE_ENV||'development')
    };
  }

  function enforceStartup(){
    const status=readiness();
    if(!liveMode||status.ready)return status;
    const required=new Set(['authentication','persistentDataPathConfigured','persistentStorageWritable','publicHttpsOrigin','databaseStateReady']);
    const failed=Object.entries(status.checks).filter(([k,v])=>required.has(k)&&v!==true).map(([k])=>k);
    throw new Error(`EVE_LIVE_MODE readiness failed: ${failed.join(', ')}. Configure authentication, set RESEARCHOS_RELAY_DATA to a persistent mounted path, confirm that path is writable, and use an HTTPS EVE_PUBLIC_ORIGIN before live use.`);
  }

  return {liveMode,trustProxy,applyHeaders,routeLimited,readiness,enforceStartup,clientIp};
}

module.exports={createLiveSecurity,truthy};
