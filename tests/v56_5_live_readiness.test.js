'use strict';

const assert=require('assert');
const path=require('path');
const os=require('os');
const fs=require('fs');
const net=require('net');
const crypto=require('crypto');
const {spawn}=require('child_process');
const {createLiveSecurity}=require('../lib/live_security.js');

const root=path.join(__dirname,'..');

function freePort(){
  return new Promise((resolve,reject)=>{
    const srv=net.createServer();
    srv.once('error',reject);
    srv.listen(0,'127.0.0.1',()=>{
      const {port}=srv.address();
      srv.close(err=>err?reject(err):resolve(port));
    });
  });
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
async function waitFor(url,child){
  const deadline=Date.now()+8000;
  while(Date.now()<deadline){
    if(child.exitCode!==null)throw new Error(`Eve server exited early with ${child.exitCode}`);
    try{const r=await fetch(url);if(r.ok)return r}catch{}
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}
function proof(value){
  return crypto.createHash('sha256').update(String(value||'')).digest('base64url');
}

(async()=>{
  // Unit-level readiness: live mode is not satisfied by a writable directory alone.
  {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eve-live-readiness-unit-'));
    const old={
      live:process.env.EVE_LIVE_MODE,
      origin:process.env.EVE_PUBLIC_ORIGIN,
      data:process.env.RESEARCHOS_RELAY_DATA
    };
    try{
      process.env.EVE_LIVE_MODE='true';
      process.env.EVE_PUBLIC_ORIGIN='https://eve.example.test';
      delete process.env.RESEARCHOS_RELAY_DATA;
      const sec=createLiveSecurity({
        dataDir:dir,
        control:{isConfigured:()=>true},
        json:()=>{throw new Error('not used')}
      });
      const status=sec.readiness();
      assert.equal(status.liveMode,true);
      assert.equal(status.checks.authentication,true);
      assert.equal(status.checks.publicHttpsOrigin,true);
      assert.equal(status.checks.persistentStorageWritable,true);
      assert.equal(status.checks.persistentDataPathConfigured,false);
      assert.equal(status.ready,false);
      assert.throws(()=>sec.enforceStartup(),/persistentDataPathConfigured/);
    }finally{
      if(old.live===undefined)delete process.env.EVE_LIVE_MODE;else process.env.EVE_LIVE_MODE=old.live;
      if(old.origin===undefined)delete process.env.EVE_PUBLIC_ORIGIN;else process.env.EVE_PUBLIC_ORIGIN=old.origin;
      if(old.data===undefined)delete process.env.RESEARCHOS_RELAY_DATA;else process.env.RESEARCHOS_RELAY_DATA=old.data;
      fs.rmSync(dir,{recursive:true,force:true});
    }
  }

  const port=await freePort();
  const data=fs.mkdtempSync(path.join(os.tmpdir(),'eve-v565-live-'));
  const child=spawn(process.execPath,['server.js'],{
    cwd:root,
    env:{
      ...process.env,
      HOST:'127.0.0.1',
      PORT:String(port),
      NODE_ENV:'production',
      EVE_LIVE_MODE:'true',
      EVE_TRUST_PROXY:'true',
      EVE_PUBLIC_ORIGIN:'https://eve.example.test',
      RESEARCHOS_RELAY_DATA:data,
      EVE_BOOTSTRAP_EMAIL:'admin@example.test',
      EVE_BOOTSTRAP_PASSWORD:'correct-horse-battery-staple',
      EVE_BOOTSTRAP_NAME:'Eve Admin',
      EVE_ORG_NAME:'Live Test'
    },
    stdio:['ignore','pipe','pipe']
  });
  let stderr='';
  child.stderr.on('data',d=>stderr+=String(d));

  try{
    const base=`http://127.0.0.1:${port}`;
    await waitFor(`${base}/api/health`,child);

    let r=await fetch(`${base}/api/health`);
    assert.equal(r.status,200);
    let j=await r.json();
    assert.equal(j.ok,true);
    assert.equal(j.liveMode,true);
    assert.equal(j.mode,'zero-access-relay');
    assert.equal('readiness' in j,false,'public health must not expose detailed deployment state');

    r=await fetch(`${base}/api/readiness`);
    assert.equal(r.status,200);
    j=await r.json();
    assert.equal(j.ready,true);
    assert.equal(j.liveMode,true);

    // Production security headers behind the trusted HTTPS proxy.
    r=await fetch(`${base}/`,{headers:{'X-Forwarded-Proto':'https'}});
    assert.equal(r.status,200);
    assert.equal(r.headers.get('x-frame-options'),'DENY');
    assert.equal(r.headers.get('x-content-type-options'),'nosniff');
    assert.equal(r.headers.get('referrer-policy'),'no-referrer');
    assert(r.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"));
    assert(r.headers.get('permissions-policy')?.includes('geolocation=()'));
    assert(r.headers.get('strict-transport-security')?.includes('max-age=31536000'));

    // Auth is mandatory in live mode and protects researcher connector administration.
    r=await fetch(`${base}/api/auth/config`);
    j=await r.json();
    assert.equal(j.configured,true);

    r=await fetch(`${base}/api/connectors/config`);
    assert.equal(r.status,401);

    r=await fetch(`${base}/api/auth/login`,{
      method:'POST',
      headers:{'Content-Type':'application/json','X-Forwarded-Proto':'https'},
      body:JSON.stringify({email:'admin@example.test',password:'correct-horse-battery-staple'})
    });
    assert.equal(r.status,200);
    const cookie=r.headers.get('set-cookie');
    assert(cookie?.includes('HttpOnly'));
    assert(cookie?.includes('SameSite=Lax'));
    assert(cookie?.includes('Secure'));

    r=await fetch(`${base}/api/connectors/config`,{headers:{Cookie:cookie.split(';')[0]}});
    assert.equal(r.status,200);

    // Publish encrypted study metadata with a one-way participant capability.
    const participantKey='participant-secret-key-material';
    const participantHash=proof(participantKey);
    const admin='relay-admin-capability';
    const publication={
      envelope:{iv:'iv',data:'ciphertext',tag:'tag'},
      adminToken:admin,
      metadata:{
        studyId:'s-live',
        version:1,
        status:'live',
        closeAtUtc:'',
        publishedAt:Date.now(),
        participantHash
      }
    };
    r=await fetch(`${base}/api/studies/live-capability`,{
      method:'PUT',
      headers:{'Content-Type':'application/json','X-ResearchOS-Admin':admin},
      body:JSON.stringify(publication)
    });
    assert.equal(r.status,200);

    // Slug alone is insufficient.
    r=await fetch(`${base}/api/studies/live-capability`);
    assert.equal(r.status,403);
    r=await fetch(`${base}/api/studies/live-capability`,{headers:{'X-Eve-Participant':'wrong'}});
    assert.equal(r.status,403);
    r=await fetch(`${base}/api/studies/live-capability`,{headers:{'X-Eve-Participant':participantHash}});
    assert.equal(r.status,200);

    // Submission requires the same participant capability and remains idempotent.
    const response={
      id:'response-live-1',
      envelope:{iv:'ri',data:'rd',tag:'rt'},
      routing:{source:'direct',version:1}
    };
    r=await fetch(`${base}/api/studies/live-capability/responses`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(response)
    });
    assert.equal(r.status,403);

    r=await fetch(`${base}/api/studies/live-capability/responses`,{
      method:'POST',
      headers:{'Content-Type':'application/json','X-Eve-Participant':participantHash},
      body:JSON.stringify(response)
    });
    assert.equal(r.status,201);
    const first=await r.json();
    assert.equal(first.idempotent,false);

    r=await fetch(`${base}/api/studies/live-capability/responses`,{
      method:'POST',
      headers:{'Content-Type':'application/json','X-Eve-Participant':participantHash},
      body:JSON.stringify(response)
    });
    assert.equal(r.status,200);
    assert.equal((await r.json()).idempotent,true);

    // Relay operational data is owner-only on filesystems that expose POSIX mode bits.
    if(process.platform!=='win32'){
      const studyFile=path.join(data,'studies','live-capability.json');
      const responseFile=path.join(data,'responses','live-capability','response-live-1.json');
      assert.equal(fs.statSync(data).mode&0o777,0o700);
      assert.equal(fs.statSync(studyFile).mode&0o777,0o600);
      assert.equal(fs.statSync(responseFile).mode&0o777,0o600);
    }

    // Login brute force is throttled.
    let saw429=false;
    for(let i=0;i<12;i++){
      r=await fetch(`${base}/api/auth/login`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:'admin@example.test',password:'definitely-wrong'})
      });
      if(r.status===429){saw429=true;assert(r.headers.get('retry-after'));break}
    }
    assert.equal(saw429,true,'live login endpoint must rate-limit repeated attempts');

    console.log('v56.5 live-readiness integration gate passed');
  }finally{
    child.kill('SIGTERM');
    await Promise.race([new Promise(r=>child.once('exit',r)),sleep(1500)]);
    if(child.exitCode===null)child.kill('SIGKILL');
    fs.rmSync(data,{recursive:true,force:true});
    if(stderr.trim())process.stderr.write(stderr);
  }
})().catch(err=>{console.error(err);process.exit(1)});
