'use strict';

const fs=require('fs');
const path=require('path');

function createRuntimeConfig({root}={}){
  if(!root)throw new Error('runtime config requires root');
  const version=(()=>{try{return fs.readFileSync(path.join(root,'VERSION'),'utf8').trim()}catch{return'60.0.0'}})();

  function snapshot(){
    const mode=String(process.env.EVE_DEPLOYMENT_MODE||'standard').trim()||'standard';
    const cloudProvider=String(process.env.EVE_CLOUD_PROVIDER||'').trim();
    const defaultStorage=String(process.env.EVE_DEFAULT_STORAGE_PROVIDER||'organisation').trim()||'organisation';
    const publicOrigin=String(process.env.EVE_PUBLIC_ORIGIN||'').trim().replace(/\/+$/,'');
    return {
      version,
      mode,
      cloudProvider,
      defaultStorageProvider:defaultStorage,
      publicOrigin,
      organisationName:String(process.env.EVE_ORG_NAME||'').trim().slice(0,120),
      fullCapabilities:mode==='organisation-cloud'||mode==='standard',
      managedParticipantConnection:mode==='organisation-cloud',
      storageProfile:String(process.env.EVE_STORAGE_PROFILE||'filesystem').trim(),
      organisationStorage:{
        enabled:String(process.env.EVE_ORG_STORAGE_ENABLED||'').toLowerCase()!=='false',
        label:String(process.env.EVE_ORG_STORAGE_LABEL||'Organisation cloud storage').trim()
      },
      maxInstances:Number(process.env.EVE_MAX_INSTANCES_HINT||1)||1,
      stateBackend:String(process.env.EVE_STATE_BACKEND||((process.env.EVE_DATABASE_URL||process.env.DATABASE_URL||process.env.PGHOST)?'postgres':'file')),
      databaseConfigured:!!String(process.env.EVE_DATABASE_URL||process.env.DATABASE_URL||process.env.PGHOST||'').trim()
    };
  }

  function serve(res){
    const payload=`globalThis.EVE_RUNTIME_CONFIG=${JSON.stringify(snapshot()).replace(/</g,'\\u003c')};`;
    res.writeHead(200,{
      'Content-Type':'text/javascript; charset=utf-8',
      'Content-Length':Buffer.byteLength(payload),
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'no-referrer'
    });
    res.end(payload);return true;
  }

  return {version,snapshot,serve};
}

module.exports={createRuntimeConfig};
