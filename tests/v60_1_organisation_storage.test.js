'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),http=require('http');
const {createOrganisationStorage}=require('../lib/organisation_storage');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eve-org-store-'));
const json=(res,status,payload)=>{res.status=status;res.body=payload;return true};
const body=async req=>req._body||{};
const svc=createOrganisationStorage({
  dataDir:dir,json,body,requireRole:()=>({role:'researcher'}),authConfigured:()=>true,
  enabled:true,label:'Test organisation storage'
});
function res(){return{}}
async function call(method,url,bodyValue){
  const req={method,headers:{},_body:bodyValue};
  const u=new URL(url,'http://localhost');
  const r=res();const handled=await svc.handle(req,r,u);assert.equal(handled,true);return r;
}
(async()=>{
  let r=await call('GET','/api/organisation-storage/status');
  assert.equal(r.status,200);assert.equal(r.body.connected,true);assert.equal(r.body.label,'Test organisation storage');

  r=await call('PUT','/api/organisation-storage/files',{path:'workspace/workspace.eve.json',content:'{"cipher":"abc"}'});
  assert.equal(r.status,200);

  r=await call('GET','/api/organisation-storage/files?path=workspace%2Fworkspace.eve.json');
  assert.equal(r.status,200);assert.equal(r.body.content,'{"cipher":"abc"}');

  r=await call('GET','/api/organisation-storage/files/list?prefix=workspace');
  assert.equal(r.status,200);assert.equal(r.body.files.length,1);assert.equal(r.body.files[0].path,'workspace/workspace.eve.json');

  r=await call('DELETE','/api/organisation-storage/files',{path:'workspace/workspace.eve.json'});
  assert.equal(r.status,200);assert.equal(r.body.deleted,true);

  r=await call('GET','/api/organisation-storage/files?path=workspace%2Fworkspace.eve.json');
  assert.equal(r.status,404);

  r=await call('PUT','/api/organisation-storage/files',{path:'../escape',content:'x'});
  assert.equal(r.status,400);

  fs.rmSync(dir,{recursive:true,force:true});
  console.log('v60.1 organisation-owned storage service tests passed');
})().catch(e=>{console.error(e);process.exit(1)});
