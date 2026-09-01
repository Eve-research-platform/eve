'use strict';
const assert=require('assert'),path=require('path');

const calls=[];
const handlers={
  eveRelayRequest:req=>({status:200,headers:{'Content-Type':'application/json'},body:JSON.stringify({ok:true,path:req.path})}),
  eveBootstrap:key=>({ok:true,rootFolderId:'root-1',location:'My Drive / Eve',ownerKeySeen:key}),
  eveStorageWrite:(key,p,c)=>({ok:true,key,path:p,content:c}),
  eveStorageRead:(key,p)=>({ok:true,path:p,content:'encrypted'}),
  eveStorageDelete:(key,p)=>({ok:true,path:p,deleted:true}),
  eveStorageList:(key,p)=>({ok:true,files:[{path:p+'/x.eve.json'}]}),
  eveStorageInfo:key=>({ok:true,connected:true,rootFolderId:'root-1',location:'My Drive / Eve'})
};
function makeRunner(success,failure){
  return new Proxy({
    withSuccessHandler(fn){return makeRunner(fn,failure)},
    withFailureHandler(fn){return makeRunner(success,fn)}
  },{get(target,prop){
    if(prop in target)return target[prop];
    return (...args)=>{calls.push([String(prop),args]);try{success(handlers[prop](...args))}catch(err){failure(err)}};
  }});
}
global.google={script:{get run(){return makeRunner(()=>{},()=>{})}}};
delete global.EveDeployment;
require(path.join(__dirname,'..','app','eve-deployment.js'));

(async()=>{
  assert.equal(EveDeployment.isGoogleWorkspace(),true);
  assert.equal(EveDeployment.mode(),'google-workspace');
  const r=await EveDeployment.relayFetch('/api/health');
  assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,path:'/api/health'});
  const b=await EveDeployment.bootstrap('owner-key');assert.equal(b.rootFolderId,'root-1');
  assert.equal((await EveDeployment.storageRead('owner-key','workspace.eve.json')).content,'encrypted');
  assert.equal((await EveDeployment.storageDelete('owner-key','a')).deleted,true);
  assert.equal((await EveDeployment.storageList('owner-key','Studies')).files.length,1);
  assert(calls.some(x=>x[0]==='eveRelayRequest'));
  assert(calls.some(x=>x[0]==='eveBootstrap'));
  console.log('v59 Google Workspace deployment adapter tests passed');
})().catch(err=>{console.error(err);process.exit(1)});
