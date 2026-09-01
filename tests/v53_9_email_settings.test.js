'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {createM365Mailer,DEFAULT_TEMPLATES}=require('../lib/m365_mail');

function json(res,status,data){res.status=status;res.data=data;return true}
async function body(req){return req.body||{}}
function makeRes(){return{status:0,data:null}}
function req(method,bodyValue={}){return{method,headers:{host:'eve.test'},socket:{},body:bodyValue}}

(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eve-mail-settings-'));
  const calls=[];
  const fetchImpl=async(url,opts={})=>{
    calls.push({url:String(url),opts});
    if(String(url).includes('/oauth2/v2.0/token')){
      return {ok:true,status:200,json:async()=>({access_token:'ACCESS_TOKEN',expires_in:3600})};
    }
    if(String(url).includes('/sendMail')){
      return {ok:true,status:202,json:async()=>({})};
    }
    throw new Error('Unexpected URL '+url);
  };
  const mailer=createM365Mailer({
    fetchImpl,dataDir:dir,json,body,
    requireRole:()=>null,authConfigured:()=>false
  });

  // Initial runtime config is safe and not configured.
  let res=makeRes();
  await mailer.handle(req('GET'),res,new URL('http://eve.test/api/mail/settings'));
  assert.equal(res.status,200);
  assert.equal(res.data.configured,false);
  assert.equal(res.data.clientSecretConfigured,false);
  assert(!('clientSecret' in res.data));

  // Save real configuration + global email templates.
  res=makeRes();
  await mailer.handle(req('PUT',{
    tenantId:'tenant-123',
    clientId:'client-456',
    clientSecret:'VERY_SECRET_VALUE_9876',
    sender:'research@example.gov.uk',
    graphBase:'https://graph.microsoft.com/v1.0',
    templates:{
      recruitmentSubject:'Take part in {{studyTitle}}',
      recruitmentMessage:'We need your help with {{studyTitle}}.',
      panelWelcomeSubject:'Welcome researcher',
      panelWelcomeMessage:'Thanks for joining our panel.',
      panelRemovalSubject:'Panel membership ended',
      panelRemovalMessage:'You have been removed from our panel.'
    }
  }),res,new URL('http://eve.test/api/mail/settings'));
  assert.equal(res.status,200);
  assert.equal(res.data.configured,true);
  assert.equal(res.data.sender,'research@example.gov.uk');
  assert.equal(res.data.clientSecretConfigured,true);
  assert.equal(res.data.clientSecretHint,'configured');
  assert(!JSON.stringify(res.data).includes('VERY_SECRET_VALUE_9876'));

  // Secret is encrypted at rest and cannot be recovered from the config file.
  const raw=fs.readFileSync(path.join(dir,'m365-mail.json'),'utf8');
  assert(!raw.includes('VERY_SECRET_VALUE_9876'));
  const parsed=JSON.parse(raw);
  assert(parsed.clientSecret&&parsed.clientSecret.iv&&parsed.clientSecret.tag&&parsed.clientSecret.data);
  assert.equal(fs.statSync(path.join(dir,'.m365-mail.key')).size,32);

  // Blank secret on a later settings save retains the encrypted secret.
  res=makeRes();
  await mailer.handle(req('PUT',{
    tenantId:'tenant-123',clientId:'client-456',clientSecret:'',
    sender:'research@example.gov.uk',graphBase:'https://graph.microsoft.com/v1.0',
    templates:{recruitmentSubject:'Research: {{studyTitle}}'}
  }),res,new URL('http://eve.test/api/mail/settings'));
  assert.equal(res.status,200);
  assert.equal(res.data.configured,true);

  // Global templates are used by real recruitment / panel functions.
  const recruit=mailer.researchInvitationTemplate({
    studyTitle:'Universal Credit prototype',message:'',participantUrl:'https://eve.test/#/s/abc'
  });
  assert.equal(recruit.subject,'Research: Universal Credit prototype');
  assert.equal(recruit.text.includes('We need your help with Universal Credit prototype.'),true);

  const welcome=mailer.panelWelcomeTemplate({subject:'',message:'',removeUrl:'https://eve.test/api/panel/remove/x'});
  assert.equal(welcome.subject,'Welcome researcher');
  assert(welcome.text.includes('Thanks for joining our panel.'));
  assert(welcome.text.includes('/api/panel/remove/x'));

  const override=mailer.panelWelcomeTemplate({subject:'Study-specific welcome',message:'Custom copy',removeUrl:'https://eve.test/api/panel/remove/y'});
  assert.equal(override.subject,'Study-specific welcome');
  assert(override.text.includes('Custom copy'));

  const removal=mailer.panelRemovalTemplate();
  assert.equal(removal.subject,'Panel membership ended');
  assert(removal.text.includes('removed from our panel'));

  // Test email follows the same Graph send path as real mail and records success.
  res=makeRes();
  await mailer.handle(req('POST',{to:'admin@example.gov.uk'}),res,new URL('http://eve.test/api/mail/test'));
  assert.equal(res.status,200);
  assert.equal(res.data.sent,true);
  assert.equal(res.data.lastTestOk,true);
  assert(Number(res.data.lastTestAt)>0);
  assert(calls.some(x=>x.url.includes('/oauth2/v2.0/token')));
  const sendCall=calls.find(x=>x.url.includes('/sendMail'));
  assert(sendCall);
  assert(sendCall.url.includes('/users/research%40example.gov.uk/sendMail'));
  assert(!JSON.stringify(sendCall).includes('VERY_SECRET_VALUE_9876'));

  const mailSource=fs.readFileSync(path.join(__dirname,'..','lib','m365_mail.js'),'utf8');
  assert(mailSource.includes("{...publicStatus(),ok:false,error:err.code||'mail_test_failed'"));

  // Remove runtime secret: with no env fallback this disables mail.
  res=makeRes();
  await mailer.handle(req('PUT',{clearSecret:true}),res,new URL('http://eve.test/api/mail/settings'));
  assert.equal(res.status,200);
  assert.equal(res.data.clientSecretConfigured,false);
  assert.equal(res.data.configured,false);

  console.log('v53.9 global Microsoft 365 email settings tests passed');
})().catch(err=>{console.error(err);process.exit(1)});
