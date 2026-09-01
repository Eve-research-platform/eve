'use strict';
const assert=require('assert'),path=require('path'),os=require('os'),fs=require('fs'),net=require('net');
const {spawn}=require('child_process');
const root=path.join(__dirname,'..');

function freePort(){return new Promise((resolve,reject)=>{const srv=net.createServer();srv.once('error',reject);srv.listen(0,'127.0.0.1',()=>{const {port}=srv.address();srv.close(err=>err?reject(err):resolve(port))})})}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
async function waitFor(url,child){const deadline=Date.now()+8000;while(Date.now()<deadline){if(child.exitCode!==null)throw new Error(`server exited ${child.exitCode}`);try{const r=await fetch(url);if(r.ok)return}catch{}await sleep(100)}throw new Error('server timeout')}

(async()=>{
 const port=await freePort(),data=fs.mkdtempSync(path.join(os.tmpdir(),'eve-v562-relay-'));
 const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),RESEARCHOS_RELAY_DATA:data},stdio:['ignore','pipe','pipe']});
 try{
  const base=`http://127.0.0.1:${port}`;await waitFor(`${base}/api/health`,child);
  const token='admin-secret',headers={'Content-Type':'application/json','X-ResearchOS-Admin':token};
  const body=v=>JSON.stringify({envelope:{iv:`iv${v}`,data:`cipher${v}`,tag:`tag${v}`},adminToken:token,metadata:{studyId:'s1',version:v,status:'live',closeAtUtc:'',publishedAt:1000+v}});

  let r=await fetch(`${base}/api/studies/idempotent-study`,{method:'PUT',headers,body:body(1)});
  assert.equal(r.status,200);
  let j=await r.json();assert.equal(j.idempotent,false);

  // Same immutable version can be retried after an interrupted browser response.
  r=await fetch(`${base}/api/studies/idempotent-study`,{method:'PUT',headers,body:body(1)});
  assert.equal(r.status,200);
  j=await r.json();assert.equal(j.idempotent,true);assert.equal(j.version,1);

  r=await fetch(`${base}/api/studies/idempotent-study/status`,{headers:{'X-ResearchOS-Admin':token}});
  assert.equal(r.status,200);
  j=await r.json();assert.equal(j.latestVersion,1);assert.equal(j.lifecycle.status,'live');assert.deepEqual(j.versions,[1]);

  r=await fetch(`${base}/api/studies/idempotent-study/status`,{headers:{'X-ResearchOS-Admin':'wrong'}});
  assert.equal(r.status,403,'relay status must remain administrator-only');

  r=await fetch(`${base}/api/studies/idempotent-study`,{method:'PUT',headers,body:body(2)});
  assert.equal(r.status,200);
  j=await r.json();assert.equal(j.idempotent,false);assert.equal(j.version,2);

  r=await fetch(`${base}/api/studies/idempotent-study`,{method:'PUT',headers,body:body(1)});
  assert.equal(r.status,409,'older versions must never overwrite the relay latest version');

  r=await fetch(`${base}/api/studies/idempotent-study`,{method:'PATCH',headers,body:JSON.stringify({status:'closed',version:2})});
  assert.equal(r.status,200);
  r=await fetch(`${base}/api/studies/idempotent-study/status`,{headers:{'X-ResearchOS-Admin':token}});
  j=await r.json();assert.equal(j.lifecycle.status,'closed');assert.equal(j.latestVersion,2);

  console.log('v56.2 relay idempotence/reconciliation tests passed');
 }finally{
  child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),sleep(1200)]);
  if(child.exitCode===null)child.kill('SIGKILL');
  fs.rmSync(data,{recursive:true,force:true});
 }
})().catch(err=>{console.error(err);process.exit(1)});
