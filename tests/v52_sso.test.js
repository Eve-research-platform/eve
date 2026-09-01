'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {createControlPlane}=require('../lib/control_plane');
const {createEntraSso}=require('../lib/entra_sso');

function json(res,status,data){res.status=status;res.data=data;res.headers=res.headers||{};return true}
function body(req){return Promise.resolve(req._body||{})}
function req(method='GET'){return {method,headers:{host:'eve.example.test'},socket:{encrypted:false},_body:{}}}
function res(){return {headers:{},setHeader(k,v){this.headers[k]=v},writeHead(status,h){this.status=status;Object.assign(this.headers,h||{})},end(){this.ended=true}}}

(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eve-v52-sso-'));
 delete process.env.EVE_BOOTSTRAP_EMAIL;delete process.env.EVE_BOOTSTRAP_PASSWORD;
 process.env.EVE_ENTRA_TENANT_ID='tenant-guid';
 process.env.EVE_ENTRA_CLIENT_ID='client-id';
 process.env.EVE_ENTRA_CLIENT_SECRET='secret';
 process.env.EVE_PUBLIC_ORIGIN='https://eve.example.test';
 process.env.EVE_ORG_NAME='SSO Research';

 const calls=[];
 const fakeFetch=async(url,opts={})=>{
   calls.push({url:String(url),opts});
   if(String(url).includes('/oauth2/v2.0/token')){
     assert(String(opts.body).includes('code_verifier='));
     return {ok:true,status:200,json:async()=>({access_token:'token'})};
   }
   if(String(url).includes('/me?')){
     return {ok:true,status:200,json:async()=>({id:'entra-user-1',displayName:'Alex Researcher',mail:'alex@example.test',userPrincipalName:'alex@example.test'})};
   }
   throw new Error('unexpected fetch '+url);
 };

 const cp=createControlPlane({dataDir:dir,json,body});
 const sso=createEntraSso({dataDir:dir,json,control:cp,fetchImpl:fakeFetch});

 let r=res();
 await sso.handle(req(),r,new URL('http://x/api/auth/microsoft/start?next=%2Fstudies'));
 assert.equal(r.status,302);
 assert(r.headers.Location.includes('code_challenge='));
 const authUrl=new URL(r.headers.Location);
 const state=authUrl.searchParams.get('state');
 assert(state);

 r=res();
 await sso.handle(req(),r,new URL(`http://x/api/auth/microsoft/callback?code=abc&state=${encodeURIComponent(state)}`));
 assert.equal(r.status,302);
 assert.equal(r.headers.Location,'/studies');
 assert(String(r.headers['Set-Cookie']||'').includes('eve_session='));

 // First SSO user bootstraps the organisation as admin.
 const cookie=String(r.headers['Set-Cookie']).split(';')[0];
 const meRes=res();
 const meReq=req();meReq.headers.cookie=cookie;
 await cp.handle(meReq,meRes,new URL('http://x/api/auth/me'));
 assert.equal(meRes.status,200);
 assert.equal(meRes.data.membership.role,'admin');
 assert.deepEqual(meRes.data.user.providers,['microsoft_entra']);
 assert.equal(meRes.data.user.hasPassword,false);

 console.log('v52 Microsoft Entra SSO tests passed');
})().catch(e=>{console.error(e);process.exit(1)});
