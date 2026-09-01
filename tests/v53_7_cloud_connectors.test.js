'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {createCloudConnectorService,safeCloudPath,providerId,pkceChallenge}=require('../lib/cloud_connectors');

assert.equal(safeCloudPath('Studies/a/responses/r.eve.json'),'Studies/a/responses/r.eve.json');
assert.throws(()=>safeCloudPath('../secret'),/invalid/i);
assert.throws(()=>safeCloudPath('a/../secret'),/invalid/i);
assert.equal(providerId('Google Drive'),'google');
assert.equal(providerId('SharePoint'),'microsoft');
assert.match(pkceChallenge('verifier-value'),/^[A-Za-z0-9_-]+$/);

const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'eve-connectors-'));
const envKeys=['EVE_PUBLIC_ORIGIN','EVE_GOOGLE_CLIENT_ID','EVE_GOOGLE_CLIENT_SECRET','EVE_MICROSOFT_CLIENT_ID','EVE_MICROSOFT_CLIENT_SECRET','EVE_MICROSOFT_TENANT_ID'];
const oldEnv=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
process.env.EVE_PUBLIC_ORIGIN='http://eve.test';
process.env.EVE_GOOGLE_CLIENT_ID='google-client';
process.env.EVE_GOOGLE_CLIENT_SECRET='google-secret';
process.env.EVE_MICROSOFT_CLIENT_ID='ms-client';
process.env.EVE_MICROSOFT_CLIENT_SECRET='ms-secret';
process.env.EVE_MICROSOFT_TENANT_ID='organizations';

function restoreEnv(){for(const [k,v] of Object.entries(oldEnv)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
function response(status,payload,headers={}){return new Response(typeof payload==='string'?payload:JSON.stringify(payload),{status,headers:{'content-type':'application/json',...headers}})}
const calls=[];
const googleFiles=new Map();
const msFiles=new Map();
let nextGoogleId=1,nextMsId=1;
async function mockFetch(url,options={}){
  const u=String(url),method=String(options.method||'GET').toUpperCase();calls.push({url:u,options});
  if(u.includes('oauth2.googleapis.com/token'))return response(200,{access_token:'GOOGLE_ACCESS_PLAINTEXT',refresh_token:'GOOGLE_REFRESH_PLAINTEXT',expires_in:3600,token_type:'Bearer'});
  if(u.includes('openidconnect.googleapis.com/v1/userinfo'))return response(200,{sub:'google-user-1',email:'researcher@example.gov',name:'Researcher'});
  if(u.startsWith('https://www.googleapis.com/drive/v3/files?')&&method==='GET'){
    const q=new URL(u).searchParams.get('q')||'';const parent=(q.match(/'([^']+)' in parents/)||[])[1]||'';
    if(parent==='root')return response(200,{files:[{id:'google-eve-folder',name:'Eve',mimeType:'application/vnd.google-apps.folder'}]});
    if(parent==='google-eve-folder')return response(200,{files:[...googleFiles.entries()].map(([name,x])=>({id:x.id,name,mimeType:'application/json',modifiedTime:x.modified,size:Buffer.byteLength(x.content)}))});
    return response(200,{files:[]});
  }
  if(u.startsWith('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart')&&method==='POST'){
    const body=String(options.body||''),name=(body.match(/\"name\":\"([^\"]+)\"/)||[])[1];
    const marker='Content-Type: application/json; charset=UTF-8\r\n\r\n',idx=body.lastIndexOf(marker);const rest=idx>=0?body.slice(idx+marker.length):'';const end=rest.lastIndexOf('\r\n--');const content=end>=0?rest.slice(0,end):rest;
    const id=`google-file-${nextGoogleId++}`,modified=new Date().toISOString();googleFiles.set(name,{id,content,modified});return response(200,{id,name,modifiedTime:modified,size:Buffer.byteLength(content)});
  }
  const gcontent=u.match(/https:\/\/www\.googleapis\.com\/drive\/v3\/files\/(google-file-\d+)\?alt=media/);
  if(gcontent&&method==='GET'){const found=[...googleFiles.values()].find(x=>x.id===gcontent[1]);return found?new Response(found.content,{status:200,headers:{'content-type':'text/plain'}}):response(404,{error:'not found'})}
  const gdel=u.match(/https:\/\/www\.googleapis\.com\/drive\/v3\/files\/(google-file-\d+)$/);
  if(gdel&&method==='DELETE'){const pair=[...googleFiles.entries()].find(([,x])=>x.id===gdel[1]);if(pair)googleFiles.delete(pair[0]);return new Response(null,{status:204})}

  if(u.includes('login.microsoftonline.com')&&u.includes('/token'))return response(200,{access_token:'MS_ACCESS_PLAINTEXT',refresh_token:'MS_REFRESH_PLAINTEXT',expires_in:3600,token_type:'Bearer'});
  if(u.startsWith('https://graph.microsoft.com/v1.0/me?'))return response(200,{id:'ms-user-1',displayName:'Gov Researcher',mail:'gov.researcher@example.gov',userPrincipalName:'gov.researcher@example.gov'});
  if(u.includes('/sites/department.sharepoint.com:/sites/research?'))return response(200,{id:'site-1',displayName:'Research',name:'research',webUrl:'https://department.sharepoint.com/sites/research'});
  if(u.includes('/sites/site-1/drives?'))return response(200,{value:[{id:'drive-1',name:'Documents',webUrl:'https://department.sharepoint.com/sites/research/Documents',driveType:'documentLibrary'}]});
  if(u.includes('/drives/drive-1/root?'))return response(200,{id:'root-1',name:'root',webUrl:'https://department.sharepoint.com/sites/research/Documents'});
  if(u.includes('/drives/drive-1/items/root-1/children')&&method==='POST')return response(201,{id:'ms-eve-folder',name:'Eve',folder:{},webUrl:'https://department.sharepoint.com/sites/research/Documents/Eve'});
  if(u.includes('/drives/drive-1/items/root-1/children')&&method==='GET')return response(200,{value:[{id:'ms-eve-folder',name:'Eve',folder:{},lastModifiedDateTime:new Date().toISOString(),size:0}]});
  if(u.includes('/drives/drive-1/items/ms-eve-folder/children')&&method==='GET'){
    return response(200,{value:[...msFiles.entries()].map(([name,x])=>({id:x.id,name,file:{},lastModifiedDateTime:x.modified,size:Buffer.byteLength(x.content)}))});
  }
  const upload=u.match(/\/drives\/drive-1\/items\/ms-eve-folder:\/([^?]+):\/content/);
  if(upload&&method==='PUT'){
    const name=decodeURIComponent(upload[1]),content=String(options.body||''),id=`ms-file-${nextMsId++}`,modified=new Date().toISOString();msFiles.set(name,{id,content,modified});
    return response(200,{id,name,lastModifiedDateTime:modified,size:Buffer.byteLength(content)});
  }
  const content=u.match(/\/drives\/drive-1\/items\/(ms-file-\d+)\/content$/);
  if(content&&method==='GET'){
    const found=[...msFiles.values()].find(x=>x.id===content[1]);return found?new Response(found.content,{status:200,headers:{'content-type':'text/plain'}}):response(404,{error:'not found'});
  }
  const del=u.match(/\/drives\/drive-1\/items\/(ms-file-\d+)$/);
  if(del&&method==='DELETE'){
    const pair=[...msFiles.entries()].find(([,x])=>x.id===del[1]);if(pair)msFiles.delete(pair[0]);return new Response(null,{status:204});
  }
  throw new Error('Unexpected outbound URL '+method+' '+u);
}
function json(res,status,data){res.status=status;res.payload=data;res.ended=true;return true}
async function body(req){return req.body||{}}
function makeRes(){return {status:0,headers:{},body:'',writeHead(status,headers){this.status=status;this.headers=headers||{}},end(data=''){this.body+=Buffer.isBuffer(data)?data.toString('utf8'):String(data);this.ended=true}}}
const service=createCloudConnectorService({dataDir,json,body,publicOrigin:'http://eve.test',fetchImpl:mockFetch});

async function oauth(provider){
  let res=makeRes(),req={method:'GET',headers:{host:'eve.test'},socket:{}};
  await service.handle(req,res,new URL(`http://eve.test/api/connectors/${provider}/start`));
  assert.equal(res.status,302);const auth=new URL(res.headers.Location),state=auth.searchParams.get('state');
  assert.equal(auth.searchParams.get('code_challenge_method'),'S256');assert(auth.searchParams.get('code_challenge'));assert(state);
  if(provider==='google'){
    assert.equal(auth.hostname,'accounts.google.com');assert.equal(auth.searchParams.get('client_id'),'google-client');assert.equal(auth.searchParams.get('redirect_uri'),'http://eve.test/api/connectors/google/callback');assert(auth.searchParams.get('scope').includes('https://www.googleapis.com/auth/drive.file'));
  }else{
    assert.equal(auth.hostname,'login.microsoftonline.com');assert(auth.pathname.includes('/organizations/oauth2/v2.0/authorize'));assert.equal(auth.searchParams.get('client_id'),'ms-client');assert.equal(auth.searchParams.get('redirect_uri'),'http://eve.test/api/connectors/microsoft/callback');assert(auth.searchParams.get('scope').includes('Sites.ReadWrite.All'));
  }
  res=makeRes();req={method:'GET',headers:{host:'eve.test'},socket:{}};
  await service.handle(req,res,new URL(`http://eve.test/api/connectors/${provider}/callback?code=auth-code&state=${encodeURIComponent(state)}`));
  assert.equal(res.status,200);assert(res.body.includes('EVE_CONNECTOR_CONNECTED'));const cap=res.body.match(/"capability":"([^"]+)"/)?.[1];assert(cap);return cap;
}

(async()=>{
  const encrypted=service.encryptTokens({access_token:'never-store-me-plain',refresh_token:'nor-me'});assert(!JSON.stringify(encrypted).includes('never-store-me-plain'));assert.deepEqual(service.decryptTokens(encrypted),{access_token:'never-store-me-plain',refresh_token:'nor-me'});

  const googleCap=await oauth('google');
  let out={},req={method:'GET',headers:{},socket:{}};await service.handle(req,out,new URL(`http://eve.test/api/connectors/status?cap=${encodeURIComponent(googleCap)}`));assert.equal(out.status,200);assert.equal(out.payload.connection.provider,'google');assert.equal(out.payload.connection.user.email,'researcher@example.gov');
  out={};req={method:'POST',headers:{},socket:{},body:{capability:googleCap}};await service.handle(req,out,new URL('http://eve.test/api/connectors/test'));assert.equal(out.status,200);assert.equal(out.payload.connection.location.displayName,'My Drive / Eve');
  const googlePayload='{\"ciphertext\":\"google-opaque\"}';
  out={};req={method:'PUT',headers:{},socket:{},body:{capability:googleCap,path:'workspace.eve.json',content:googlePayload}};await service.handle(req,out,new URL('http://eve.test/api/connectors/files'));assert.equal(out.status,200);
  out={};req={method:'GET',headers:{},socket:{}};await service.handle(req,out,new URL(`http://eve.test/api/connectors/files?cap=${encodeURIComponent(googleCap)}&path=${encodeURIComponent('workspace.eve.json')}`));assert.equal(out.status,200);assert.equal(out.payload.content,googlePayload);

  const msCap=await oauth('microsoft');
  out={};req={method:'POST',headers:{},socket:{},body:{capability:msCap,siteUrl:'https://department.sharepoint.com/sites/research'}};await service.handle(req,out,new URL('http://eve.test/api/connectors/microsoft/site'));assert.equal(out.status,200);assert.equal(out.payload.site.id,'site-1');assert.equal(out.payload.drives[0].id,'drive-1');
  out={};req={method:'POST',headers:{},socket:{},body:{capability:msCap,siteId:'site-1',siteUrl:'https://department.sharepoint.com/sites/research',driveId:'drive-1',driveName:'Documents'}};await service.handle(req,out,new URL('http://eve.test/api/connectors/microsoft/location'));assert.equal(out.status,200);assert.equal(out.payload.connection.location.displayName,'Documents / Eve');

  // Actual SharePoint adapter file I/O through unified connector endpoints.
  const cloudPayload='{"ciphertext":"opaque"}';
  out={};req={method:'PUT',headers:{},socket:{},body:{capability:msCap,path:'workspace.eve.json',content:cloudPayload}};await service.handle(req,out,new URL('http://eve.test/api/connectors/files'));assert.equal(out.status,200);
  out={};req={method:'GET',headers:{},socket:{}};await service.handle(req,out,new URL(`http://eve.test/api/connectors/files?cap=${encodeURIComponent(msCap)}&path=${encodeURIComponent('workspace.eve.json')}`));assert.equal(out.status,200);assert.equal(out.payload.content,cloudPayload);
  out={};req={method:'GET',headers:{},socket:{}};await service.handle(req,out,new URL(`http://eve.test/api/connectors/files/list?cap=${encodeURIComponent(msCap)}&prefix=`));assert.equal(out.status,200);assert(out.payload.files.some(x=>x.path==='workspace.eve.json'));
  out={};req={method:'DELETE',headers:{},socket:{},body:{capability:msCap,path:'workspace.eve.json'}};await service.handle(req,out,new URL('http://eve.test/api/connectors/files'));assert.equal(out.status,200);assert.equal(out.payload.deleted,true);

  const vaultRaw=fs.readFileSync(path.join(dataDir,'connectors','vault.json'),'utf8');for(const secret of ['GOOGLE_ACCESS_PLAINTEXT','GOOGLE_REFRESH_PLAINTEXT','MS_ACCESS_PLAINTEXT','MS_REFRESH_PLAINTEXT','google-secret','ms-secret'])assert(!vaultRaw.includes(secret),`vault leaked ${secret}`);

  out={};req={method:'GET',headers:{host:'eve.test'},socket:{}};await service.handle(req,out,new URL('http://eve.test/api/connectors/config'));assert.equal(out.status,200);assert.equal(out.payload.google.configured,true);assert.equal(out.payload.microsoft.configured,true);assert(!JSON.stringify(out.payload).includes('ms-secret'));
  restoreEnv();console.log('v53.7 cloud connector server tests passed');
})().catch(err=>{restoreEnv();console.error(err);process.exit(1)});
