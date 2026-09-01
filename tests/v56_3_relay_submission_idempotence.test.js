'use strict';
const assert=require('assert'),path=require('path'),os=require('os'),fs=require('fs'),net=require('net'),crypto=require('crypto');
const {spawn}=require('child_process');
const root=path.join(__dirname,'..');
function freePort(){return new Promise((resolve,reject)=>{const srv=net.createServer();srv.once('error',reject);srv.listen(0,'127.0.0.1',()=>{const {port}=srv.address();srv.close(err=>err?reject(err):resolve(port))})})}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
async function waitFor(url,child){const end=Date.now()+8000;while(Date.now()<end){if(child.exitCode!==null)throw new Error(`server exited ${child.exitCode}`);try{const r=await fetch(url);if(r.ok)return}catch{}await sleep(100)}throw new Error('server timeout')}
(async()=>{
 const port=await freePort(),data=fs.mkdtempSync(path.join(os.tmpdir(),'eve-v563-relay-')),child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),RESEARCHOS_RELAY_DATA:data},stdio:['ignore','pipe','pipe']});
 try{
  const base=`http://127.0.0.1:${port}`;await waitFor(`${base}/api/health`,child);
  const admin='admin-token',adminHeaders={'Content-Type':'application/json','X-ResearchOS-Admin':admin};
  const publication={envelope:{iv:'i',data:'d',tag:'t'},adminToken:admin,metadata:{studyId:'s1',version:1,status:'live',closeAtUtc:'',publishedAt:1}};
  let r=await fetch(`${base}/api/studies/submission-test`,{method:'PUT',headers:adminHeaders,body:JSON.stringify(publication)});assert.equal(r.status,200);

  const recording={id:'recording-1',envelope:{iv:'ri',data:'rd',tag:'rt'},routing:{responseId:'response-1',blockId:'block-1',source:'direct',version:1}};
  r=await fetch(`${base}/api/studies/submission-test/recordings`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(recording)});assert.equal(r.status,201);let j=await r.json();const recordingReceived=j.receivedAt;assert.equal(j.idempotent,false);
  r=await fetch(`${base}/api/studies/submission-test/recordings`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(recording)});assert.equal(r.status,200);j=await r.json();assert.equal(j.idempotent,true);assert.equal(j.receivedAt,recordingReceived);

  const response={id:'response-1',envelope:{iv:'xi',data:'xd',tag:'xt'},routing:{source:'direct',version:1}};
  r=await fetch(`${base}/api/studies/submission-test/responses`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(response)});assert.equal(r.status,201);j=await r.json();const responseReceived=j.receivedAt;assert.equal(j.idempotent,false);
  r=await fetch(`${base}/api/studies/submission-test/responses`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(response)});assert.equal(r.status,200);j=await r.json();assert.equal(j.idempotent,true);assert.equal(j.receivedAt,responseReceived);

  // Once stored, retries remain acknowledgements even if the researcher turns the study off.
  r=await fetch(`${base}/api/studies/submission-test`,{method:'PATCH',headers:adminHeaders,body:JSON.stringify({status:'closed',version:1})});assert.equal(r.status,200);
  r=await fetch(`${base}/api/studies/submission-test/responses`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(response)});assert.equal(r.status,200);assert.equal((await r.json()).idempotent,true);
  r=await fetch(`${base}/api/studies/submission-test/recordings`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(recording)});assert.equal(r.status,200);assert.equal((await r.json()).idempotent,true);

  // A genuinely new response still cannot enter a study after it is Off.
  r=await fetch(`${base}/api/studies/submission-test/responses`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...response,id:'response-2'})});assert.equal(r.status,410);

  // Controlled-audience retry: same response id succeeds after invitation is consumed; a different id does not.
  r=await fetch(`${base}/api/studies/submission-test`,{method:'PATCH',headers:adminHeaders,body:JSON.stringify({status:'live',version:1})});assert.equal(r.status,200);
  const inviteToken='invite-one',tokenHash=crypto.createHash('sha256').update(inviteToken).digest('base64url');
  r=await fetch(`${base}/api/studies/submission-test/invitations`,{method:'POST',headers:adminHeaders,body:JSON.stringify({invitations:[{token:inviteToken,campaignId:'c1',segmentId:'seg1',version:1,emailHash:'h'}]})});assert.equal(r.status,200);
  const controlled={id:'controlled-1',envelope:{iv:'ci',data:'cd',tag:'ct'},routing:{source:'email',campaignId:'c1',segmentId:'seg1',inviteToken,version:1}};
  r=await fetch(`${base}/api/studies/submission-test/responses`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(controlled)});assert.equal(r.status,201);
  r=await fetch(`${base}/api/studies/submission-test/responses`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(controlled)});assert.equal(r.status,200);assert.equal((await r.json()).idempotent,true);
  r=await fetch(`${base}/api/studies/submission-test/responses`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...controlled,id:'controlled-2'})});assert.equal(r.status,409);

  console.log('v56.3 relay submission/recording idempotence tests passed');
 }finally{child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),sleep(1200)]);if(child.exitCode===null)child.kill('SIGKILL');fs.rmSync(data,{recursive:true,force:true})}
})().catch(err=>{console.error(err);process.exit(1)});
