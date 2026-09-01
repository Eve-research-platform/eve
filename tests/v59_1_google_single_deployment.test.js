'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');

let nextId=1;
class File{
  constructor(name,content=''){this.id='f'+nextId++;this.name=name;this.content=String(content);this.updated=new Date();this.trashed=false}
  getId(){return this.id} getName(){return this.name}
  getBlob(){return{getDataAsString:()=>this.content}} getLastUpdated(){return this.updated}
  setContent(v){this.content=String(v);this.updated=new Date();return this} setTrashed(v){this.trashed=!!v}
}
class Iter{constructor(items){this.items=items.filter(x=>!x.trashed);this.i=0}hasNext(){return this.i<this.items.length}next(){return this.items[this.i++]}}
class Folder{
  constructor(name){this.id='d'+nextId++;this.name=name;this.folders=[];this.files=[];this.trashed=false}
  getId(){return this.id} createFolder(name){const f=new Folder(name);this.folders.push(f);driveById.set(f.id,f);return f}
  createFile(name,content){const f=new File(name,content);this.files.push(f);driveById.set(f.id,f);return f}
  getFoldersByName(name){return new Iter(this.folders.filter(x=>x.name===name))}
  getFilesByName(name){return new Iter(this.files.filter(x=>x.name===name))}
  getFiles(){return new Iter(this.files)} getFolders(){return new Iter(this.folders)} setTrashed(v){this.trashed=!!v}
}
const driveById=new Map(),driveRoot=new Folder('My Drive');driveById.set(driveRoot.id,driveRoot);
const scriptProps=new Map(),userProps=new Map();
let activeEmail='owner@example.gov.uk',boundId='sheet-copy-1';
const propApi=map=>({getProperty:k=>map.get(k)||null,setProperty:(k,v)=>map.set(k,String(v)),deleteProperty:k=>map.delete(k)});
const digest=value=>[...crypto.createHash('sha256').update(String(value),'utf8').digest()].map(x=>x>127?x-256:x);
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
  console,__EVE_TEST_DRIVE__:testDrive,Date,JSON,Object,String,Number,Boolean,Array,Math,RegExp,isFinite,decodeURIComponent,encodeURIComponent,
  PropertiesService:{getScriptProperties:()=>propApi(scriptProps),getUserProperties:()=>propApi(userProps)},
  Session:{getActiveUser:()=>({getEmail:()=>activeEmail})},
  Utilities:{
    DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF_8'},
    computeDigest:(_alg,value)=>digest(value),
    getUuid:(()=>{let i=0;return()=>`uuid-${++i}-0123456789`})(),
    base64EncodeWebSafe:bytes=>Buffer.from(bytes.map(x=>(x+256)%256)).toString('base64url')
  },
  DriveApp:{createFolder:name=>driveRoot.createFolder(name),getFolderById:id=>{const x=driveById.get(id);if(!x||!(x instanceof Folder)||x.trashed)throw new Error('folder missing');return x}},
  MimeType:{PLAIN_TEXT:'text/plain'},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  ScriptApp:{getScriptId:()=> 'script-project-1',getService:()=>({getUrl:()=> 'https://script.google.com/macros/s/eve-one/exec'})},
  SpreadsheetApp:{
    getActiveSpreadsheet:()=>({getId:()=>boundId}),
    getUi:()=>({createMenu:()=>({addItem(){return this},addToUi(){}}),showModalDialog(){}})
  },
  HtmlService:{
    createTemplateFromFile:()=>({evaluate:()=>({setWidth(){return this},setHeight(){return this}})}),
    createHtmlOutputFromFile:()=>({getContent:()=>'',setTitle(){return this},setXFrameOptionsMode(){return this}}),
    XFrameOptionsMode:{DEFAULT:'DEFAULT'}
  }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','google-workspace','Code.gs'),'utf8'),context,{filename:'Code.gs'});

const prepared=context.evePrepareInstallation();
assert.equal(prepared.prepared,true);
assert.equal(prepared.deploymentReady,true);
assert(prepared.secureOpenUrl.startsWith('https://script.google.com/macros/s/eve-one/exec#/install?o='));
assert.equal(scriptProps.get('EVE_OWNER_EMAIL'),'owner@example.gov.uk');
assert(scriptProps.get('EVE_OWNER_HASH'));
assert(userProps.get('EVE_OWNER_KEY_LOCAL'));
assert.equal(prepared.driveReady,true);

const ownerKey=userProps.get('EVE_OWNER_KEY_LOCAL');
// The web app may be anonymous. Capability, not participant Google identity,
// protects researcher Drive operations in the single-deployment architecture.
activeEmail='';
const boot=context.eveBootstrap(ownerKey);
assert.equal(boot.singleDeployment,true);
assert.equal(boot.participantUrl,'https://script.google.com/macros/s/eve-one/exec');
assert.equal(context.eveStorageInfo(ownerKey).connected,true);
assert.throws(()=>context.eveStorageInfo('wrong-key'),/owner capability rejected/);

// A copied template that inherited script properties must reset the old owner.
activeEmail='new-owner@example.gov.uk';
boundId='sheet-copy-2';
context.ensureCopyIdentity_();
assert.equal(scriptProps.get('EVE_OWNER_HASH'),undefined);
assert.equal(scriptProps.get('EVE_OWNER_EMAIL'),undefined);
assert.equal(userProps.get('EVE_OWNER_KEY_LOCAL'),undefined);

console.log('v59.1 Google Sheet launcher + single-deployment tests passed');
