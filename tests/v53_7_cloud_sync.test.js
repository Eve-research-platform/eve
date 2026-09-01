'use strict';
const assert=require('assert');

const rawKey=Buffer.alloc(32,7).toString('base64');
global.encoder=new TextEncoder();
global.decoder=new TextDecoder();
global.bytesToB64Url=bytes=>Buffer.from(bytes).toString('base64url');
global.b64UrlToBytes=raw=>new Uint8Array(Buffer.from(String(raw||''),'base64url'));
global.localKeyRaw=()=>rawKey;
global.encrypt=async data=>{
  const key=await crypto.subtle.importKey('raw',Buffer.from(rawKey,'base64'),{name:'AES-GCM'},false,['encrypt']);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(data)));
  return {v:1,iv:[...iv],data:[...new Uint8Array(cipher)]};
};
async function decryptEnvelope(env){
  const key=await crypto.subtle.importKey('raw',Buffer.from(rawKey,'base64'),{name:'AES-GCM'},false,['decrypt']);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(env.iv)},key,new Uint8Array(env.data));
  return JSON.parse(new TextDecoder().decode(plain));
}

const study={
  id:'study-1',slug:'opaque-slug',title:'Highly sensitive pensions study',method:'Mixed',
  createdAt:1,updatedAt:100,version:1,status:'closed',archivedAt:null,
  settings:{storageProvider:'organisation'},
  publishedVersions:{'1':{version:1,publishedAt:90,data:{id:'study-1',title:'Highly sensitive pensions study',blocks:[]}}},
  blocks:[],pages:[]
};
const response={id:'response-1',studyId:'study-1',studyVersion:1,submittedAt:110,answers:{q1:{value:'Sensitive participant answer'}}};
global.state={
  view:'home',workspaceRevision:4,studies:[study],responses:[response],findings:[],participantSegments:[],
  storage:{provider:'Google Drive',location:'My Drive / Eve',permission:'App folder only',lastSync:null,connected:true,cloudSyncState:'idle',cloudSyncError:'',connectors:{
    google:{capability:'opaque-capability',connection:{connected:true,provider:'google',location:{rootFolderId:'eve-root',displayName:'My Drive / Eve'}}},
    microsoft:null
  }}
};
global.workspacePayload=()=>({
  view:'home',workspaceRevision:state.workspaceRevision,studies:JSON.parse(JSON.stringify(state.studies)),
  findings:[],participantSegments:[],globalSettings:{defaultAnonymous:true},storage:JSON.parse(JSON.stringify(state.storage))
});
global.idbGet=async()=>null;
let persistCalls=0;
global.persistWorkspace=async()=>{persistCalls++;return true};
global.render=()=>{};
global.toast=()=>{};
global.relativeDate=()=> 'now';
global.esc=v=>String(v??'');
global.eveFetch=async(url,options={})=>{
  const u=String(url);
  if(u==='/api/connectors/files'&&options.method==='PUT'){
    const d=JSON.parse(options.body);cloud.set(d.path,d.content);
    return new Response(JSON.stringify({ok:true,path:d.path}),{status:200,headers:{'content-type':'application/json'}});
  }
  throw new Error('Unexpected Eve API '+u+' '+(options.method||'GET'));
};
const cloud=new Map();

delete require.cache[require.resolve('../app/cloud-storage.js')];
require('../app/cloud-storage.js');

(async()=>{
  const ok=await global.EveCloud.syncProvider('google',{manual:false});
  assert.equal(ok,true);
  for(const p of [
    'workspace.eve.json',
    'Studies/study-1/draft.eve.json',
    'Studies/study-1/versions/v1.eve.json',
    'Studies/study-1/responses/response-1.eve.json'
  ])assert(cloud.has(p),`missing ${p}`);

  // Customer storage receives ciphertext, not the study/response plaintext.
  const combined=[...cloud.values()].join('\n');
  assert(!combined.includes('Highly sensitive pensions study'));
  assert(!combined.includes('Sensitive participant answer'));
  assert(!combined.includes('opaque-capability'));

  const workspaceDoc=JSON.parse(cloud.get('workspace.eve.json'));
  assert.equal(workspaceDoc.format,'eve-cloud-workspace');
  assert.equal(workspaceDoc.version,2);
  assert.equal(workspaceDoc.provider,'google');
  assert.equal(workspaceDoc.summary.studyCount,1);
  assert.equal(workspaceDoc.summary.responseCount,1);
  assert.deepEqual(workspaceDoc.responsePaths,['Studies/study-1/responses/response-1.eve.json']);

  const payload=await decryptEnvelope(workspaceDoc.envelope);
  assert.equal(payload.workspace.studies[0].title,'Highly sensitive pensions study');
  assert.equal(payload.workspace.storage.connectors.google,null);
  assert.equal(payload.workspace.storage.connectors.microsoft,null);

  assert(study.cloudSyncedProviders.includes('google'));
  assert(persistCalls>=1);
  console.log('v53.7 encrypted cloud sync tests passed');
})().catch(err=>{console.error(err);process.exit(1)});
