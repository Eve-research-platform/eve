'use strict';
const assert=require('assert'),path=require('path'),os=require('os'),fs=require('fs'),net=require('net');
const {spawn}=require('child_process');
const root=path.join(__dirname,'..');

function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?reject(e):resolve(p))})})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(url,child){const end=Date.now()+8000;while(Date.now()<end){if(child.exitCode!==null)throw new Error(`server exited ${child.exitCode}`);try{const r=await fetch(url);if(r.ok)return}catch{}await sleep(100)}throw new Error('timeout')}
async function req(base,path,method='GET',headers={},body){return fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)})}

(async()=>{
  const port=await freePort(),data=fs.mkdtempSync(path.join(os.tmpdir(),'eve-v60-index-'));
  const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),RESEARCHOS_RELAY_DATA:data},stdio:'ignore'});
  try{
    const base=`http://127.0.0.1:${port}`;await waitFor(`${base}/api/health`,child);
    let r=await req(base,'/api/studies/index-study','PUT',{'content-type':'application/json'},{
      envelope:{v:1,iv:'s',data:'cipher'},adminToken:'admin-secret',
      metadata:{studyId:'study-1',version:1,status:'live',closeAtUtc:'',participantHash:'participant-proof'}
    });assert.equal(r.status,200);

    for(const id of ['r-one','r-two']){
      r=await req(base,'/api/studies/index-study/responses','POST',{'content-type':'application/json','x-eve-participant':'participant-proof'},{
        id,envelope:{v:1,iv:id,data:'cipher'},routing:{version:1,source:'direct'}
      });assert.equal(r.status,201);
    }

    r=await req(base,'/api/studies/index-study/responses?offset=0&limit=1','GET',{'x-researchos-admin':'admin-secret'});
    let page=await r.json();assert.equal(page.total,2);assert.equal(page.responses.length,1);assert.equal(page.hasMore,true);assert.equal(page.nextOffset,1);
    r=await req(base,'/api/studies/index-study/responses?offset=1&limit=1','GET',{'x-researchos-admin':'admin-secret'});
    page=await r.json();assert.equal(page.responses.length,1);assert.equal(page.responses[0].id,'r-two');assert.equal(page.hasMore,false);

    const idx=JSON.parse(fs.readFileSync(path.join(data,'responses','index-study','_index.json'),'utf8'));
    assert.deepEqual(idx.map(x=>x.id),['r-one','r-two']);
    console.log('v60 Node relay response-index pagination passed');
  }finally{
    child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),sleep(1000)]);
    if(child.exitCode===null)child.kill('SIGKILL');fs.rmSync(data,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exit(1)});
