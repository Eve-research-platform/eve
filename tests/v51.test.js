'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {createControlPlane}=require('../lib/control_plane');
const {createM365Mailer}=require('../lib/m365_mail');
const {allowedParticipantUrl}=require('../lib/recruitment');

function json(res,status,data){res.status=status;res.data=data;res.headers=res.headers||{}}
function body(req){return Promise.resolve(req._body||{})}
function req(method,pathname,_body={},cookie=''){return {method,headers:{cookie,host:'eve.example.test'},socket:{encrypted:false},_body}}
function res(){return {headers:{},setHeader(k,v){this.headers[k]=v}}}
function cookieFrom(r){return String(r.headers['Set-Cookie']||'').split(';')[0]}

(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eve-v51-'));
  process.env.EVE_BOOTSTRAP_EMAIL='admin@example.test';
  process.env.EVE_BOOTSTRAP_PASSWORD='correct horse battery staple';
  process.env.EVE_ORG_NAME='Example Research';

  const sent=[];
  const fakeMailer={
    status:()=>({configured:true,provider:'fake',sender:'research@example.test'}),
    teamInvitationTemplate:({inviteUrl})=>({subject:'Invite',text:'Invite '+inviteUrl,htmlBody:'<a>'+inviteUrl+'</a>'}),
    sendOne:async msg=>{sent.push(msg);return {ok:true,accepted:true}},
  };
  const cp=createControlPlane({dataDir:dir,json,body,mailer:fakeMailer});

  let r=res();
  await cp.handle(req('POST','/api/auth/login',{email:'admin@example.test',password:'correct horse battery staple'}),r,new URL('http://x/api/auth/login'));
  assert.equal(r.status,200);const cookie=cookieFrom(r);

  r=res();
  await cp.handle(req('POST','/api/org/invitations',{email:'researcher@example.test',role:'researcher',sendEmail:true},cookie),r,new URL('http://x/api/org/invitations'));
  assert.equal(r.status,201);assert.equal(r.data.delivery.ok,true);assert.equal(r.data.token,undefined);assert.equal(sent.length,1);

  r=res();
  await cp.handle(req('POST','/api/collaboration/study1/presence',{clientId:'tabA',view:'builder'},cookie),r,new URL('http://x/api/collaboration/study1/presence'));
  assert.equal(r.status,200);assert.equal(r.data.presence.length,1);

  r=res();
  await cp.handle(req('POST','/api/collaboration/study1/lease',{clientId:'tabA'},cookie),r,new URL('http://x/api/collaboration/study1/lease'));
  assert.equal(r.status,200);assert.equal(r.data.lease.clientId,'tabA');

  r=res();
  await cp.handle(req('POST','/api/collaboration/study1/lease',{clientId:'tabB'},cookie),r,new URL('http://x/api/collaboration/study1/lease'));
  assert.equal(r.status,409);assert.equal(r.data.error,'study_edit_locked');

  r=res();
  await cp.handle(req('PATCH','/api/collaboration/study1/lease',{clientId:'tabA'},cookie),r,new URL('http://x/api/collaboration/study1/lease'));
  assert.equal(r.status,200);

  // Graph mailer contract.
  const calls=[];
  const fetchImpl=async(url,opts)=>{
    calls.push({url,opts});
    if(String(url).includes('/oauth2/v2.0/token'))return {ok:true,json:async()=>({access_token:'abc',expires_in:3600})};
    return {ok:true,status:202,json:async()=>({})};
  };
  const graph=createM365Mailer({fetchImpl,env:{
    tenantId:'tenant',clientId:'client',clientSecret:'secret',sender:'research@example.test',
    publicOrigin:'https://eve.example.test',graphBase:'https://graph.microsoft.com/v1.0'
  }});
  const out=await graph.sendBatch({recipients:['one@example.test','two@example.test','one@example.test'],subject:'Study',textFor:()=> 'Hi'});
  assert.equal(out.sent,2);assert.equal(calls.filter(x=>String(x.url).includes('/sendMail')).length,2);

  // Recruitment URL cannot turn Eve into an arbitrary mail-link relay.
  assert(allowedParticipantUrl('https://eve.example.test/#/s/abc?k=123',req('GET','/')));
  process.env.EVE_PUBLIC_ORIGIN='https://eve.example.test';
  assert.equal(allowedParticipantUrl('https://evil.example/#/s/abc',req('GET','/')),null);

  console.log('v51 collaboration + mail tests passed');
})().catch(e=>{console.error(e);process.exit(1)});
