'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');

let nextId=1;
class File{
  constructor(name,content=''){this.id='f'+nextId++;this.name=name;this.content=String(content);this.updated=new Date();this.trashed=false}
  getId(){return this.id} getName(){return this.name}
  getBlob(){return{getDataAsString:()=>this.content}}
  getLastUpdated(){return this.updated}
  setContent(v){this.content=String(v);this.updated=new Date();return this}
  setTrashed(v){this.trashed=!!v}
}
class Iter{constructor(items){this.items=items.filter(x=>!x.trashed);this.i=0}hasNext(){return this.i<this.items.length}next(){return this.items[this.i++]}}
class Folder{
  constructor(name){this.id='d'+nextId++;this.name=name;this.folders=[];this.files=[];this.trashed=false}
  getId(){return this.id} getName(){return this.name}
  createFolder(name){const f=new Folder(name);this.folders.push(f);driveById.set(f.id,f);return f}
  createFile(name,content){const f=new File(name,content);this.files.push(f);driveById.set(f.id,f);return f}
  getFoldersByName(name){return new Iter(this.folders.filter(x=>x.name===name))}
  getFilesByName(name){return new Iter(this.files.filter(x=>x.name===name))}
  getFiles(){return new Iter(this.files)}
  getFolders(){return new Iter(this.folders)}
  setTrashed(v){this.trashed=!!v}
}
const driveById=new Map(),driveRoot=new Folder('My Drive');driveById.set(driveRoot.id,driveRoot);
const props=new Map();
let activeEmail='researcher@example.com';
const FOLDER_MIME='application/vnd.google-apps.folder';
const testDrive={
  get(id){const x=driveById.get(id);if(!x||x.trashed)return null;return this.meta(x)},
  meta(x){return{id:x.id,name:x.name,mimeType:x instanceof Folder?FOLDER_MIME:'text/plain',modifiedTime:(x.updated||new Date()).toISOString(),trashed:!!x.trashed}},
  parent(id){return id==='root'?driveRoot:driveById.get(id)},
  find(parentId,name,mimeType){const p=this.parent(parentId);if(!p)return null;const xs=[...p.folders,...p.files].filter(x=>!x.trashed&&x.name===name);const x=xs.find(x=>!mimeType||(x instanceof Folder?FOLDER_MIME:'text/plain')===mimeType);return x?this.meta(x):null},
  list(parentId){const p=this.parent(parentId);if(!p)return[];return[...p.folders,...p.files].filter(x=>!x.trashed).map(x=>this.meta(x))},
  createFolder(parentId,name){const p=this.parent(parentId);if(!p)throw new Error('parent missing');return this.meta(p.createFolder(name))},
  writeText(parentId,name,content,existingId){let f=existingId?driveById.get(existingId):null;const p=this.parent(parentId);if(!f)f=p.createFile(name,content);else f.setContent(content);return this.meta(f)},
  readText(id){const f=driveById.get(id);if(!f||f.trashed)throw new Error('file missing');return f.content},
  trash(id){const x=driveById.get(id);if(x)x.setTrashed(true);return true}
};
const context={
  console,__EVE_TEST_DRIVE__:testDrive,
  Date,
  JSON,
  Object,
  String,
  Number,
  Boolean,
  Array,
  Math,
  RegExp,
  isFinite,
  decodeURIComponent,
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,String(v)),deleteProperty:k=>props.delete(k)})},
  Session:{getActiveUser:()=>({getEmail:()=>activeEmail})},
  Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF_8'},computeDigest:(_alg,value)=>[...crypto.createHash('sha256').update(String(value),'utf8').digest()].map(x=>x>127?x-256:x)},
  DriveApp:{createFolder:name=>driveRoot.createFolder(name),getFolderById:id=>{const x=driveById.get(id);if(!x||!(x instanceof Folder)||x.trashed)throw new Error('folder missing');return x}},
  MimeType:{PLAIN_TEXT:'text/plain'},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  ScriptApp:{getService:()=>({getUrl:()=> 'https://script.google.com/macros/s/researcher/exec'})},
  HtmlService:{createHtmlOutputFromFile:()=>({setTitle(){return this},setXFrameOptionsMode(){return this}}),XFrameOptionsMode:{DEFAULT:'DEFAULT'}}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','google-workspace','Code.gs'),'utf8'),context,{filename:'Code.gs'});

const bootstrap=context.eveBootstrap('owner-key');
assert.equal(bootstrap.connected,true);assert.equal(bootstrap.location,'My Drive / Eve');assert.equal(props.get('EVE_OWNER_EMAIL'),'researcher@example.com');
context.eveStorageWrite('owner-key','Studies/test/draft.eve.json','ciphertext');
assert.equal(context.eveStorageRead('owner-key','Studies/test/draft.eve.json').content,'ciphertext');
assert.equal(context.eveStorageList('owner-key','Studies').files.length,1);

const call=(path,method='GET',headers={},body='')=>context.eveRelayRequest({path,method,headers,body});
let r=call('/api/health');assert.equal(r.status,200);assert.equal(JSON.parse(r.body).mode,'google-workspace-zero-access-relay');
r=call('/api/owner-check','GET',{'X-Eve-Owner':'wrong'});assert.equal(r.status,403);
r=call('/api/owner-check','GET',{'X-Eve-Owner':'owner-key'});assert.equal(r.status,200);

const publication={envelope:{v:1,iv:'x',data:'cipher'},adminToken:'study-admin',metadata:{studyId:'s1',version:1,status:'live',closeAtUtc:'',participantHash:'participant-proof'}};
r=call('/api/studies/study-one','PUT',{'X-Eve-Owner':'owner-key','X-ResearchOS-Admin':'study-admin'},JSON.stringify(publication));assert.equal(r.status,200);
r=call('/api/studies/study-one');assert.equal(r.status,403);
r=call('/api/studies/study-one','GET',{'X-Eve-Participant':'participant-proof'});assert.equal(r.status,200);

const response={id:'response-one',envelope:{v:1,iv:'r',data:'cipher-response'},routing:{version:1,source:'direct'}};
r=call('/api/studies/study-one/responses','POST',{'X-Eve-Participant':'participant-proof'},JSON.stringify(response));assert.equal(r.status,201);assert.equal(JSON.parse(r.body).idempotent,false);
r=call('/api/studies/study-one/responses','POST',{'X-Eve-Participant':'participant-proof'},JSON.stringify(response));assert.equal(r.status,200);assert.equal(JSON.parse(r.body).idempotent,true);
r=call('/api/studies/study-one/responses','GET',{'X-Eve-Owner':'owner-key','X-ResearchOS-Admin':'study-admin'});assert.equal(JSON.parse(r.body).total,1);
const response2={id:'response-two',envelope:{v:1,iv:'r2',data:'cipher-response-2'},routing:{version:1,source:'direct'}};
r=call('/api/studies/study-one/responses','POST',{'X-Eve-Participant':'participant-proof'},JSON.stringify(response2));assert.equal(r.status,201);
r=call('/api/studies/study-one/responses?offset=0&limit=1','GET',{'X-Eve-Owner':'owner-key','X-ResearchOS-Admin':'study-admin'});
let page=JSON.parse(r.body);assert.equal(page.total,2);assert.equal(page.responses.length,1);assert.equal(page.hasMore,true);assert.equal(page.nextOffset,1);
r=call('/api/studies/study-one/responses?offset=1&limit=1','GET',{'X-Eve-Owner':'owner-key','X-ResearchOS-Admin':'study-admin'});
page=JSON.parse(r.body);assert.equal(page.responses.length,1);assert.equal(page.hasMore,false);assert.equal(page.responses[0].id,'response-two');

// The single public web app does not grant Drive access by origin/identity.
// Researcher Drive calls require the private owner capability.
activeEmail='';
assert.equal(context.eveStorageInfo('owner-key').connected,true);
assert.throws(()=>context.eveStorageInfo('wrong-owner'),/owner capability rejected/);
r=call('/api/studies/study-one','GET',{'X-Eve-Participant':'participant-proof'});assert.equal(r.status,200);

console.log('v59 Google Apps Script/Drive zero-install integration test passed');
