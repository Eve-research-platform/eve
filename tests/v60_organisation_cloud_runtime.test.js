'use strict';
const assert=require('assert'),path=require('path'),os=require('os'),fs=require('fs'),net=require('net'),vm=require('vm');
const {spawn}=require('child_process');
const root=path.join(__dirname,'..');

function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?reject(e):resolve(p))})})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(url,child){const end=Date.now()+10000;while(Date.now()<end){if(child.exitCode!==null)throw new Error(`Eve exited ${child.exitCode}`);try{const r=await fetch(url);if(r.ok)return r}catch{}await sleep(100)}throw new Error(`Timed out: ${url}`)}

(async()=>{
  const port=await freePort(),data=fs.mkdtempSync(path.join(os.tmpdir(),'eve-v60-cloud-'));
  const child=spawn(process.execPath,['server.js'],{
    cwd:root,
    env:{...process.env,HOST:'127.0.0.1',PORT:String(port),RESEARCHOS_RELAY_DATA:data,NODE_ENV:'production',
      EVE_LIVE_MODE:'true',EVE_TRUST_PROXY:'true',EVE_PUBLIC_ORIGIN:'https://eve.example.gov.uk',
      EVE_BOOTSTRAP_EMAIL:'admin@example.gov.uk',EVE_BOOTSTRAP_PASSWORD:'VeryLongTemporaryPassphrase123!',
      EVE_DEPLOYMENT_MODE:'organisation-cloud',EVE_CLOUD_PROVIDER:'google-cloud',
      EVE_DEFAULT_STORAGE_PROVIDER:'google',EVE_STORAGE_PROFILE:'gcs-fuse-single-instance',
      EVE_MAX_INSTANCES_HINT:'1',EVE_ORG_NAME:'Research Team'},
    stdio:['ignore','pipe','pipe']
  });
  let stderr='';child.stderr.on('data',d=>stderr+=String(d));
  try{
    const base=`http://127.0.0.1:${port}`;
    await waitFor(`${base}/api/health`,child);
    const ready=await (await fetch(`${base}/api/readiness`,{headers:{'x-forwarded-proto':'https'}})).json();
    assert.equal(ready.ready,true);

    const js=await (await fetch(`${base}/eve-runtime-config.js`)).text();
    const ctx={globalThis:null};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(js,ctx);
    const c=ctx.EVE_RUNTIME_CONFIG;
    assert.equal(c.version,'63.0.0');
    assert.equal(c.mode,'organisation-cloud');
    assert.equal(c.cloudProvider,'google-cloud');
    assert.equal(c.defaultStorageProvider,'google');
    assert.equal(c.publicOrigin,'https://eve.example.gov.uk');
    assert.equal(c.fullCapabilities,true);
    assert.equal(c.managedParticipantConnection,true);
    assert.equal(c.maxInstances,1);

    const index=await (await fetch(`${base}/`)).text();
    assert(index.includes('eve-runtime-config.js'));
    assert(index.indexOf('eve-runtime-config.js')<index.indexOf('eve-deployment.js'));
    console.log('v60 organisation-cloud runtime smoke passed');
  }finally{
    child.kill('SIGTERM');
    await Promise.race([new Promise(r=>child.once('exit',r)),sleep(1500)]);
    if(child.exitCode===null)child.kill('SIGKILL');
    fs.rmSync(data,{recursive:true,force:true});
    if(stderr.trim())process.stderr.write(stderr);
  }
})().catch(e=>{console.error(e);process.exit(1)});
