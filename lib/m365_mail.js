'use strict';

const fs=require('fs');
const path=require('path');
const crypto=require('crypto');

const DEFAULT_GRAPH='https://graph.microsoft.com/v1.0';
const MAX_RECIPIENTS=100;
const DEFAULT_TEMPLATES={
  recruitmentSubject:'Invitation to take part: {{studyTitle}}',
  recruitmentMessage:'We would like to invite you to take part in a research study.',
  panelWelcomeSubject:'Welcome to our research panel',
  panelWelcomeMessage:'Thank you for joining our research panel. We may contact you about future research opportunities.',
  panelRemovalSubject:'You have been removed from the research panel',
  panelRemovalMessage:'You have been removed from our research participant panel. You will no longer be contacted through this panel.'
};

function clean(v,max=5000){return String(v==null?'':v).replace(/\u0000/g,'').trim().slice(0,max)}
function cleanEmail(v){const s=clean(v,320).toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)?s:''}
function html(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function configuredEnv(){return{
  tenantId:clean(process.env.EVE_M365_TENANT_ID,200),
  clientId:clean(process.env.EVE_M365_CLIENT_ID,200),
  clientSecret:String(process.env.EVE_M365_CLIENT_SECRET||''),
  sender:cleanEmail(process.env.EVE_M365_SENDER),
  publicOrigin:clean(process.env.EVE_PUBLIC_ORIGIN,1000).replace(/\/+$/,''),
  graphBase:clean(process.env.EVE_GRAPH_BASE_URL||DEFAULT_GRAPH,1000).replace(/\/+$/,'')
}}
function templateText(value,vars={}){return String(value||'').replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g,(m,key)=>String(vars[key]??m))}
function readJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}}
function atomicWrite(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.${process.pid}.${Date.now()}.tmp`;fs.writeFileSync(tmp,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(tmp,file)}
function sha(v){return crypto.createHash('sha256').update(String(v||'')).digest('base64url')}

function createM365Mailer({fetchImpl=global.fetch,env=null,dataDir='',json=null,body=null,requireRole=null,authConfigured=()=>true,stateStore=null}={}){
  if(typeof fetchImpl!=='function')throw new Error('fetch is required for Microsoft 365 mail');
  const fixedEnv=env&&typeof env==='object'?{...env}:null;
  const configFile=dataDir?path.join(dataDir,'m365-mail.json'):'';
  const keyFile=dataDir?path.join(dataDir,'.m365-mail.key'):'';
  const persisted=stateStore?.scope('settings',{m365Mail:{legacyFile:configFile,fallback:{}}});
  let tokenCache=null;

  function machineKey(){
    const supplied=String(process.env.EVE_CONNECTOR_SECRET||'');if(supplied)return crypto.createHash('sha256').update(`m365:${supplied}`).digest();
    if(!keyFile)return null;
    try{const raw=fs.readFileSync(keyFile);if(raw.length===32)return raw}catch{}
    const raw=crypto.randomBytes(32);fs.mkdirSync(path.dirname(keyFile),{recursive:true});fs.writeFileSync(keyFile,raw,{mode:0o600});return raw
  }
  function encryptSecret(value){
    if(!value||!keyFile)return null;
    const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',machineKey(),iv),data=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);
    return{iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),data:data.toString('base64url')}
  }
  function decryptSecret(value){
    if(!value?.iv||!keyFile)return'';
    try{const d=crypto.createDecipheriv('aes-256-gcm',machineKey(),Buffer.from(value.iv,'base64url'));d.setAuthTag(Buffer.from(value.tag,'base64url'));return Buffer.concat([d.update(Buffer.from(value.data,'base64url')),d.final()]).toString('utf8')}catch{return''}
  }
  function saved(){return persisted?persisted.read('m365Mail',{}):(configFile?readJson(configFile,{}):{})}
  function save(value){if(persisted)return persisted.write('m365Mail',value);if(configFile)atomicWrite(configFile,value)}
  function templates(){
    const s=saved(),t=s.templates&&typeof s.templates==='object'?s.templates:{};
    return{
      recruitmentSubject:clean(t.recruitmentSubject,180)||DEFAULT_TEMPLATES.recruitmentSubject,
      recruitmentMessage:clean(t.recruitmentMessage,10000)||DEFAULT_TEMPLATES.recruitmentMessage,
      panelWelcomeSubject:clean(t.panelWelcomeSubject,180)||DEFAULT_TEMPLATES.panelWelcomeSubject,
      panelWelcomeMessage:clean(t.panelWelcomeMessage,10000)||DEFAULT_TEMPLATES.panelWelcomeMessage,
      panelRemovalSubject:clean(t.panelRemovalSubject,180)||DEFAULT_TEMPLATES.panelRemovalSubject,
      panelRemovalMessage:clean(t.panelRemovalMessage,10000)||DEFAULT_TEMPLATES.panelRemovalMessage
    }
  }
  function current(){
    if(fixedEnv)return{
      tenantId:clean(fixedEnv.tenantId,200),clientId:clean(fixedEnv.clientId,200),clientSecret:String(fixedEnv.clientSecret||''),
      sender:cleanEmail(fixedEnv.sender),publicOrigin:clean(fixedEnv.publicOrigin,1000).replace(/\/+$/,''),
      graphBase:clean(fixedEnv.graphBase||DEFAULT_GRAPH,1000).replace(/\/+$/,'')
    };
    const e=configuredEnv(),s=saved(),secret=decryptSecret(s.clientSecret);
    return{
      tenantId:clean(s.tenantId,200)||e.tenantId,clientId:clean(s.clientId,200)||e.clientId,clientSecret:secret||e.clientSecret,
      sender:cleanEmail(s.sender)||e.sender,publicOrigin:e.publicOrigin,
      graphBase:clean(s.graphBase,1000).replace(/\/+$/,'')||e.graphBase||DEFAULT_GRAPH
    }
  }
  function status(){
    const c=current(),s=saved(),source=fixedEnv?'explicit':(s.tenantId||s.clientId||s.sender||decryptSecret(s.clientSecret)?'settings':c.tenantId||c.clientId||c.sender||c.clientSecret?'environment':'none');
    return{
      configured:!!(c.tenantId&&c.clientId&&c.clientSecret&&c.sender),provider:'microsoft_graph',
      tenantId:c.tenantId||'',clientId:c.clientId||'',clientSecretConfigured:!!c.clientSecret,
      clientSecretHint:c.clientSecret?'configured':'',
      sender:c.sender||'',publicOrigin:c.publicOrigin||'',graphBase:c.graphBase||DEFAULT_GRAPH,source,
      lastTestAt:Number(s.lastTestAt)||null,lastTestOk:s.lastTestOk===true,lastTestError:clean(s.lastTestError,1000),
      templates:templates()
    }
  }
  function roleOrLocal(req,res,role){if(!authConfigured())return{local:true,membership:{role:'admin'}};return typeof requireRole==='function'?requireRole(req,res,role):null}
  function publicStatus(){return{ok:true,...status()}}

  async function accessToken(){
    const c=current(),signature=sha(`${c.tenantId}|${c.clientId}|${c.clientSecret}|${c.sender}|${c.graphBase}`);
    if(!status().configured)throw Object.assign(new Error('Microsoft 365 email is not configured.'),{status:503,code:'mail_not_configured'});
    if(tokenCache&&tokenCache.signature===signature&&tokenCache.expiresAt>Date.now()+60_000)return tokenCache.value;
    const form=new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,scope:'https://graph.microsoft.com/.default',grant_type:'client_credentials'});
    const r=await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(c.tenantId)}/oauth2/v2.0/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form.toString()});
    const data=await r.json().catch(()=>({}));
    if(!r.ok||!data.access_token)throw Object.assign(new Error(data.error_description||data.error||`Microsoft token HTTP ${r.status}`),{status:502,code:'mail_token_failed'});
    tokenCache={value:data.access_token,expiresAt:Date.now()+Math.max(60,Number(data.expires_in||3600))*1000,signature};return tokenCache.value
  }
  async function sendOne({to,subject,text='',htmlBody=''}){
    const email=cleanEmail(to);if(!email)throw Object.assign(new Error('A valid recipient email is required.'),{status:400,code:'invalid_recipient'});
    const c=current(),token=await accessToken(),payload={message:{subject:clean(subject,180)||'Invitation from Eve',body:{contentType:htmlBody?'HTML':'Text',content:htmlBody?clean(htmlBody,60000):clean(text,20000)},toRecipients:[{emailAddress:{address:email}}]},saveToSentItems:true};
    const r=await fetchImpl(`${c.graphBase}/users/${encodeURIComponent(c.sender)}/sendMail`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!r.ok){const data=await r.json().catch(()=>({}));throw Object.assign(new Error(data?.error?.message||`Microsoft Graph sendMail HTTP ${r.status}`),{status:502,code:'mail_send_failed'})}
    return{ok:true,accepted:true,to:email}
  }
  async function sendBatch({recipients,subject,textFor,htmlFor,concurrency=4}){
    const unique=[...new Set((Array.isArray(recipients)?recipients:[]).map(r=>cleanEmail(typeof r==='string'?r:r?.email)).filter(Boolean))].slice(0,MAX_RECIPIENTS);
    if(!unique.length)throw Object.assign(new Error('At least one valid recipient is required.'),{status:400,code:'no_recipients'});
    const results=new Array(unique.length);let next=0;
    const workers=Array.from({length:Math.max(1,Math.min(8,Number(concurrency)||4))},async()=>{while(true){const i=next++;if(i>=unique.length)break;const to=unique[i];try{results[i]=await sendOne({to,subject,text:typeof textFor==='function'?textFor(to):clean(textFor),htmlBody:typeof htmlFor==='function'?htmlFor(to):clean(htmlFor,60000)})}catch(err){results[i]={ok:false,accepted:false,to,error:err.message,code:err.code||'mail_send_failed'}}}});
    await Promise.all(workers);const sent=results.filter(x=>x?.ok).length;return{ok:sent===results.length,sent,failed:results.length-sent,total:results.length,results}
  }

  function teamInvitationTemplate({organisation,inviter,role,inviteUrl}){
    const org=clean(organisation,160)||'an Eve workspace',who=clean(inviter,160)||'A colleague',targetRole=clean(role,30)||'researcher',url=clean(inviteUrl,3000);
    return{subject:`You've been invited to ${org} in Eve`,text:`${who} invited you to join ${org} in Eve as ${targetRole}.\n\nAccept invitation:\n${url}\n\nThis invitation expires in 7 days.`,htmlBody:`<p>${html(who)} invited you to join <strong>${html(org)}</strong> in Eve as <strong>${html(targetRole)}</strong>.</p><p><a href="${html(url)}">Accept invitation</a></p><p>This invitation expires in 7 days.</p>`}
  }
  function researchInvitationTemplate({studyTitle,message,participantUrl}){
    const t=templates(),title=clean(studyTitle,220)||'Research study',intro=clean(message,10000)||templateText(t.recruitmentMessage,{studyTitle:title}),url=clean(participantUrl,3000),subject=templateText(t.recruitmentSubject,{studyTitle:title});
    return{subject,text:`${intro}\n\nTake part:\n${url}\n\nPlease use this link only if you are happy to take part.`,htmlBody:`<p>${html(intro).replace(/\n/g,'<br>')}</p><p><a href="${html(url)}">Take part in ${html(title)}</a></p><p>Please use this link only if you are happy to take part.</p>`}
  }
  function panelWelcomeTemplate({subject='',message='',removeUrl}){
    const t=templates(),sub=clean(subject,180)||t.panelWelcomeSubject,msg=clean(message,10000)||t.panelWelcomeMessage,url=clean(removeUrl,3000);
    return{subject:sub,text:`${msg}\n\nIf you no longer want to be part of the panel, remove yourself here:\n${url}`,htmlBody:`<p>${html(msg).replace(/\n/g,'<br>')}</p><p><a href="${html(url)}">Remove me from the research panel</a></p><p>You can use this link at any time.</p>`}
  }
  function panelRemovalTemplate(){const t=templates(),msg=t.panelRemovalMessage;return{subject:t.panelRemovalSubject,text:msg,htmlBody:`<p>${html(msg).replace(/\n/g,'<br>')}</p>`}}

  async function updateSettings(data){
    if(!configFile)throw Object.assign(new Error('Runtime email settings are unavailable in this deployment.'),{status:501,code:'mail_settings_unavailable'});
    const s=saved();
    if(data.clearSecret===true)delete s.clientSecret;else if(typeof data.clientSecret==='string'&&data.clientSecret.trim())s.clientSecret=encryptSecret(data.clientSecret.trim());
    for(const [key,max] of [['tenantId',200],['clientId',200]])if(typeof data[key]==='string')s[key]=clean(data[key],max);
    if(typeof data.sender==='string'){const sender=cleanEmail(data.sender);if(data.sender.trim()&&!sender)throw Object.assign(new Error('Sender must be a valid email address.'),{status:400,code:'invalid_sender'});s.sender=sender}
    if(typeof data.graphBase==='string'&&data.graphBase.trim()){const u=new URL(data.graphBase.trim());if(!['https:','http:'].includes(u.protocol))throw Object.assign(new Error('Graph base URL must use http or https.'),{status:400});s.graphBase=u.toString().replace(/\/+$/,'')}
    if(data.templates&&typeof data.templates==='object'){const incoming=data.templates,t=s.templates&&typeof s.templates==='object'?s.templates:{};for(const [key,max] of [['recruitmentSubject',180],['recruitmentMessage',10000],['panelWelcomeSubject',180],['panelWelcomeMessage',10000],['panelRemovalSubject',180],['panelRemovalMessage',10000]])if(typeof incoming[key]==='string')t[key]=clean(incoming[key],max);s.templates=t}
    s.lastTestOk=false;s.lastTestError='';tokenCache=null;save(s);return publicStatus()
  }

  async function handle(req,res,url){
    if(!json||!body)return false;
    if(url.pathname==='/api/mail/settings'&&req.method==='GET'){const auth=roleOrLocal(req,res,'admin');if(!auth)return true;return json(res,200,publicStatus())}
    if(url.pathname==='/api/mail/settings'&&req.method==='PUT'){const auth=roleOrLocal(req,res,'admin');if(!auth)return true;try{return json(res,200,await updateSettings(await body(req)))}catch(err){return json(res,err.status||400,{ok:false,error:err.code||'mail_settings_invalid',message:err.message})}}
    if(url.pathname==='/api/mail/test'&&req.method==='POST'){
      const auth=roleOrLocal(req,res,'admin');if(!auth)return true;const data=await body(req),to=cleanEmail(data.to);if(!to)return json(res,400,{ok:false,error:'valid_email_required',message:'Enter a valid test recipient email address.'});
      try{const c=current();await sendOne({to,subject:'Eve email test',text:`This test confirms that Eve can send Microsoft 365 email from ${c.sender}.`,htmlBody:`<p>This test confirms that <strong>Eve</strong> can send Microsoft 365 email from <strong>${html(c.sender)}</strong>.</p>`});const s=saved();s.lastTestAt=Date.now();s.lastTestOk=true;s.lastTestError='';save(s);return json(res,200,{...publicStatus(),sent:true,to})}
      catch(err){const s=saved();s.lastTestAt=Date.now();s.lastTestOk=false;s.lastTestError=clean(err.message,1000);save(s);return json(res,err.status||502,{...publicStatus(),ok:false,error:err.code||'mail_test_failed',message:err.message})}
    }
    return false
  }

  return{status,publicStatus,handle,updateSettings,sendOne,sendBatch,teamInvitationTemplate,researchInvitationTemplate,panelWelcomeTemplate,panelRemovalTemplate,templates,cleanEmail,env:fixedEnv||configuredEnv(),encryptSecret,decryptSecret}
}

module.exports={createM365Mailer,cleanEmail,MAX_RECIPIENTS,DEFAULT_TEMPLATES,templateText};
