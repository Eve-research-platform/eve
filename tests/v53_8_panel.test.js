'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {createParticipantPanel}=require('../lib/participant_panel');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'eve-panel-'));
const sent=[];
const mailer={
  status:()=>({configured:true,sender:'research@example.gov'}),
  sendOne:async message=>{sent.push({...message});return{ok:true,accepted:true,to:message.to}}
};
function json(res,status,payload){res.status=status;res.payload=payload;res.ended=true;return true}
async function body(req){return req.body||{}}
function makeRes(){return{status:0,payload:null,headers:{},html:'',writeHead(status,headers){this.status=status;this.headers=headers||{}},end(data=''){this.html+=String(data);this.ended=true}}}
const panel=createParticipantPanel({dataDir:tmp,json,body,requireRole:()=>null,authConfigured:()=>false,mailer,appendAudit:()=>{}});
async function call(method,urlPath,payload){
  const req={method,headers:{host:'eve.test','x-forwarded-proto':'http'},socket:{},body:payload||{}},res=makeRes();
  const handled=await panel.handle(req,res,new URL('http://eve.test'+urlPath));
  assert.notEqual(handled,false,`route not handled ${method} ${urlPath}`);
  return res
}
(async()=>{
  const reg=await call('POST','/api/panel/register-study',{
    studyId:'study-one',studyTitle:'Benefits discovery',studyVersion:2,
    panelSignup:{blockId:'panel-block',termsEnabled:true,terms:'Panel terms',consentLabel:'I agree to join',welcomeSubject:'Welcome to the panel',welcomeMessage:'Thanks for joining our panel.'}
  });
  assert.equal(reg.status,200);
  const token=reg.payload.completionToken;
  assert(token&&token.length>30);

  let join=await call('POST','/api/panel/join',{token,email:'person@example.com',responseId:'r1',completedAt:100});
  assert.equal(join.status,200);assert.equal(join.payload.joined,true);
  assert.equal(sent.length,1);assert.equal(sent[0].subject,'Welcome to the panel');assert(sent[0].text.includes('Thanks for joining our panel.'));
  assert(sent[0].text.includes('/api/panel/remove/'));

  // Joining again while active does not send another welcome email.
  join=await call('POST','/api/panel/join',{token,email:'person@example.com',responseId:'r1',completedAt:100});
  assert.equal(join.payload.alreadyMember,true);assert.equal(sent.length,1);

  const reg2=await call('POST','/api/panel/register-study',{studyId:'study-two',studyTitle:'Account navigation',studyVersion:1,panelSignup:null});
  assert.equal(reg2.status,200);
  const participation=await call('POST','/api/panel/participation',{token:reg2.payload.completionToken,email:'person@example.com',responseId:'r2',completedAt:200});
  assert.equal(participation.status,200);assert.equal(participation.payload.matched,true);

  let list=await call('GET','/api/panel/members');
  assert.equal(list.status,200);assert.equal(list.payload.members.length,1);
  assert.equal(list.payload.members[0].email,'person@example.com');
  assert.equal(list.payload.members[0].participation.length,2);
  assert.equal(list.payload.members[0].participation[0].studyTitle,'Account navigation');

  // Raw study completion capability is never persisted.
  const registrations=fs.readFileSync(path.join(tmp,'participant-panel','study-registrations.json'),'utf8');
  assert(!registrations.includes(token));

  // Self-removal link removes the participant immediately.
  const removeUrl=sent[0].text.match(/https?:\/\/\S+\/api\/panel\/remove\/[A-Za-z0-9_-]+/)[0];
  const removePath=new URL(removeUrl).pathname;
  const rawRemoveToken=removePath.split('/').pop();
  const membersRaw=fs.readFileSync(path.join(tmp,'participant-panel','members.json'),'utf8');
  assert(!membersRaw.includes(rawRemoveToken));
  const self=await call('GET',removePath);
  assert.equal(self.status,200);assert(self.html.includes('You have been removed'));
  list=await call('GET','/api/panel/members');assert.equal(list.payload.members.length,0);

  // A removed participant can explicitly opt in again and receives a fresh welcome email.
  join=await call('POST','/api/panel/join',{token,email:'person@example.com',responseId:'r3',completedAt:300});
  assert.equal(join.status,200);assert.equal(join.payload.joined,true);assert.equal(sent.length,2);

  // Researcher removal sends notification before removal.
  list=await call('GET','/api/panel/members');const memberId=list.payload.members[0].id;
  const removed=await call('DELETE',`/api/panel/members/${memberId}`);
  assert.equal(removed.status,200);assert.equal(sent.length,3);
  assert.equal(sent[2].subject,'You have been removed from the research panel');
  list=await call('GET','/api/panel/members');assert.equal(list.payload.members.length,0);

  // Permanent study deletion invalidates all public completion/signup registrations for it.
  const clean=await call('DELETE','/api/panel/studies/study-one');assert.equal(clean.status,200);assert(clean.payload.removed>=1);
  const rejected=await call('POST','/api/panel/join',{token,email:'other@example.com',responseId:'r4'});
  assert.equal(rejected.status,403);

  console.log('v53.8 participant panel server tests passed');
})().catch(err=>{console.error(err);process.exit(1)});
