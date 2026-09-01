'use strict';
const assert=require('assert'),path=require('path'),os=require('os'),fs=require('fs'),net=require('net');
const {spawn}=require('child_process');
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

(async()=>{
  const port=await freePort();
  const data=fs.mkdtempSync(path.join(os.tmpdir(),'eve-v56-smoke-'));
  const child=spawn(process.execPath,['server.js'],{
    cwd:root,
    env:{...process.env,HOST:'127.0.0.1',PORT:String(port),RESEARCHOS_RELAY_DATA:data},
    stdio:['ignore','pipe','pipe']
  });
  let stderr='';
  child.stderr.on('data',d=>stderr+=String(d));
  try{
    const base=`http://127.0.0.1:${port}`;
    const health=await waitFor(`${base}/api/health`,child);
    const healthJson=await health.json();
    assert.equal(healthJson.ok,true);
    assert.equal(healthJson.mode,'zero-access-relay');

    const index=await (await fetch(`${base}/`)).text();
    assert(index.includes('eve-v54-theme.css'));
    assert(index.includes('eve-transactions.js'));
    assert(index.includes('eve-study-lifecycle.js'));
    assert(index.includes('eve-archive-ops.js'));
    assert(index.includes('eve-participant-delivery.js'));
    assert(index.includes('eve-participant-submit.js'));
    assert(index.indexOf('eve-transactions.js')<index.indexOf('eve-study-lifecycle.js'));
    assert(index.indexOf('eve-study-lifecycle.js')<index.indexOf('eve-archive-ops.js'));
    assert(index.indexOf('eve-archive-ops.js')<index.indexOf('eve-participant-delivery.js'));
    assert(index.indexOf('eve-participant-delivery.js')<index.indexOf('eve-participant-submit.js'));
    assert(index.indexOf('eve-participant-submit.js')<index.indexOf('app.js'));

    for(const asset of ['app.js','eve-transactions.js','eve-study-lifecycle.js','eve-archive-ops.js','eve-participant-delivery.js','eve-participant-submit.js','cloud-storage.js','eve-v53-runtime.js','styles.css','eve-v54-theme.css','eve-v56-polish.css','manifest.webmanifest']){
      const r=await fetch(`${base}/${asset}`);
      assert.equal(r.status,200,`${asset} should be served`);
      const body=await r.text();
      assert(body.length>20,`${asset} should not be empty`);
      assert.equal(r.headers.get('x-content-type-options'),'nosniff');
    }

    const missing=await fetch(`${base}/api/definitely-not-real`);
    assert.equal(missing.status,404);

    console.log('v56 runtime HTTP smoke test passed');
  }finally{
    child.kill('SIGTERM');
    await Promise.race([new Promise(r=>child.once('exit',r)),sleep(1500)]);
    if(child.exitCode===null)child.kill('SIGKILL');
    fs.rmSync(data,{recursive:true,force:true});
    if(stderr.trim())process.stderr.write(stderr);
  }
})().catch(err=>{console.error(err);process.exit(1)});
