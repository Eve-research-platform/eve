'use strict';

const fs=require('fs');
const path=require('path');
const crypto=require('crypto');

const TOKEN_BYTES=32;
const MAX_HISTORY=500;

function clean(v,max=5000){return String(v==null?'':v).replace(/\u0000/g,'').trim().slice(0,max)}
function cleanEmail(v){const s=clean(v,320).toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)?s:''}
function safeId(prefix){return `${prefix}_${crypto.randomBytes(12).toString('base64url')}`}
function token(){return crypto.randomBytes(TOKEN_BYTES).toString('base64url')}
function sha(v){return crypto.createHash('sha256').update(String(v||'')).digest('base64url')}
function equalHash(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function html(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function readJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}}
function atomicWrite(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.${process.pid}.${Date.now()}.tmp`;fs.writeFileSync(tmp,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(tmp,file)}
function requestOrigin(req){
  const configured=clean(process.env.EVE_PUBLIC_ORIGIN,1000).replace(/\/+$/,'');if(configured)return configured;
  const proto=String(req.headers['x-forwarded-proto']||(req.socket?.encrypted?'https':'http')).split(',')[0].trim();
  const host=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim();
  return host?`${proto}://${host}`:'';
}
function writeHtml(res,status,title,message){
  const body=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(title)}</title><style>body{margin:0;font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;background:#f5f7fb;color:#1f2937}.card{width:min(620px,calc(100% - 40px));margin:12vh auto;background:#fff;border:1px solid #d9e0e9;border-radius:16px;padding:28px;box-sizing:border-box}.mark{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:#eef2ff;color:#4456a6;font-size:24px}h1{margin:14px 0 8px}p{color:#566175}.brand{font-weight:800;color:#5262a3}</style></head><body><main class="card"><div class="mark">✓</div><div class="brand">Eve</div><h1>${html(title)}</h1><p>${html(message)}</p></main></body></html>`;
  res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(body);return true
}

function createParticipantPanel({dataDir,json,body,requireRole,authConfigured=()=>true,mailer,appendAudit=()=>{},stateStore=null}){
  const dir=path.join(dataDir,'participant-panel');fs.mkdirSync(dir,{recursive:true});
  const membersFile=path.join(dir,'members.json'),studiesFile=path.join(dir,'study-registrations.json');
  const persisted=stateStore?.scope('participant-panel',{members:{legacyFile:membersFile,fallback:[]},studies:{legacyFile:studiesFile,fallback:[]}});
  const loadMembers=()=>persisted?persisted.read('members',[]):readJson(membersFile,[]);
  const saveMembers=rows=>persisted?persisted.write('members',rows):atomicWrite(membersFile,rows);
  const loadStudies=()=>persisted?persisted.read('studies',[]):readJson(studiesFile,[]);
  const saveStudies=rows=>persisted?persisted.write('studies',rows):atomicWrite(studiesFile,rows);

  function authOrLocal(req,res,role='viewer'){
    if(!authConfigured())return {local:true,org:{id:'local',name:'Local Eve workspace'},membership:{role:'admin'},user:{id:'local',name:'Local researcher',email:''}};
    return requireRole(req,res,role);
  }
  function orgId(auth){return auth?.org?.id||'local'}
  function publicMember(m){
    return {id:m.id,email:m.email,status:m.status,joinedAt:m.joinedAt,joinedStudyId:m.joinedStudyId||null,joinedStudyTitle:m.joinedStudyTitle||'',removedAt:m.removedAt||null,removedReason:m.removedReason||'',participation:Array.isArray(m.participation)?m.participation:[],welcomeEmailSentAt:m.welcomeEmailSentAt||null}
  }
  function registrationByToken(raw){
    if(!raw)return null;const hash=sha(raw);return loadStudies().find(x=>equalHash(x.tokenHash,hash))||null
  }
  function addParticipation(member,{studyId,studyTitle,studyVersion,responseId,completedAt}){
    member.participation=Array.isArray(member.participation)?member.participation:[];
    const sid=clean(studyId,180),rid=clean(responseId,180),version=Math.max(1,Number(studyVersion)||1),at=Number(completedAt)||Date.now();
    if(!sid)return;
    const existing=member.participation.find(x=>(rid&&x.responseId===rid)||(!rid&&x.studyId===sid&&Number(x.studyVersion)===version));
    if(existing){existing.completedAt=Math.max(Number(existing.completedAt)||0,at);existing.studyTitle=clean(studyTitle,220)||existing.studyTitle;return}
    member.participation.push({studyId:sid,studyTitle:clean(studyTitle,220)||'Research study',studyVersion:version,responseId:rid||null,completedAt:at});
    member.participation.sort((a,b)=>(b.completedAt||0)-(a.completedAt||0));member.participation=member.participation.slice(0,MAX_HISTORY)
  }
  function welcomeTemplate(reg,removeUrl){
    const cfg=reg.panelSignup||{},subject=clean(cfg.welcomeSubject,180),message=clean(cfg.welcomeMessage,10000);
    if(typeof mailer?.panelWelcomeTemplate==='function')return mailer.panelWelcomeTemplate({subject,message,removeUrl});
    const sub=subject||'Welcome to our research panel',msg=message||'Thank you for joining our research panel. We may contact you about future research opportunities.';
    return {subject:sub,text:`${msg}\n\nIf you no longer want to be part of the panel, remove yourself here:\n${removeUrl}`,htmlBody:`<p>${html(msg).replace(/\n/g,'<br>')}</p><p><a href="${html(removeUrl)}">Remove me from the research panel</a></p><p>You can use this link at any time.</p>`}
  }
  function removedTemplate(){
    if(typeof mailer?.panelRemovalTemplate==='function')return mailer.panelRemovalTemplate();
    return {subject:'You have been removed from the research panel',text:'You have been removed from our research participant panel. You will no longer be contacted through this panel.',htmlBody:'<p>You have been removed from our research participant panel.</p><p>You will no longer be contacted through this panel.</p>'}
  }

  async function handle(req,res,url){
    if(url.pathname==='/api/panel/status'&&req.method==='GET'){
      const auth=authOrLocal(req,res,'viewer');if(!auth)return true;
      const members=loadMembers().filter(x=>x.orgId===orgId(auth)&&x.status==='active');
      return json(res,200,{ok:true,mailConfigured:!!mailer?.status?.().configured,count:members.length})
    }
    if(url.pathname==='/api/panel/members'&&req.method==='GET'){
      const auth=authOrLocal(req,res,'viewer');if(!auth)return true;
      const rows=loadMembers().filter(x=>x.orgId===orgId(auth)&&x.status==='active').sort((a,b)=>(b.joinedAt||0)-(a.joinedAt||0));
      return json(res,200,{ok:true,members:rows.map(publicMember),mailConfigured:!!mailer?.status?.().configured})
    }
    if(url.pathname==='/api/panel/register-study'&&req.method==='POST'){
      const auth=authOrLocal(req,res,'researcher');if(!auth)return true;
      const data=await body(req),studyId=clean(data.studyId,180),studyTitle=clean(data.studyTitle,220)||'Research study',studyVersion=Math.max(1,Number(data.studyVersion)||1);
      if(!studyId)return json(res,400,{ok:false,error:'study_required'});
      const panelSignup=data.panelSignup&&typeof data.panelSignup==='object'?{
        blockId:clean(data.panelSignup.blockId,180),
        termsEnabled:!!data.panelSignup.termsEnabled,
        terms:clean(data.panelSignup.terms,20000),
        consentLabel:clean(data.panelSignup.consentLabel,1000),
        welcomeSubject:clean(data.panelSignup.welcomeSubject,180),
        welcomeMessage:clean(data.panelSignup.welcomeMessage,10000),
      }:null;
      if(panelSignup&&!mailer?.status?.().configured)return json(res,503,{ok:false,error:'mail_not_configured',message:'Panel sign-up requires Microsoft 365 email to be configured before publishing.'});
      const rows=loadStudies(),oid=orgId(auth),existing=rows.find(x=>x.orgId===oid&&x.studyId===studyId&&Number(x.studyVersion)===studyVersion);
      const raw=token(),rec=existing||{id:safeId('panstudy'),orgId:oid,studyId,studyVersion,createdAt:Date.now()};
      rec.studyTitle=studyTitle;rec.panelSignup=panelSignup;rec.tokenHash=sha(raw);rec.updatedAt=Date.now();
      if(existing)Object.assign(existing,rec);else rows.push(rec);saveStudies(rows);
      appendAudit(auth,'panel_study_registered',{studyId});
      return json(res,200,{ok:true,completionToken:raw,mailConfigured:!!mailer?.status?.().configured})
    }
    if(url.pathname==='/api/panel/join'&&req.method==='POST'){
      const data=await body(req),reg=registrationByToken(data.token);
      if(!reg||!reg.panelSignup)return json(res,403,{ok:false,error:'panel_signup_not_allowed'});
      const email=cleanEmail(data.email);if(!email)return json(res,400,{ok:false,error:'valid_email_required'});
      if(!mailer?.status?.().configured)return json(res,503,{ok:false,error:'mail_not_configured'});
      const rows=loadMembers();let member=rows.find(x=>x.orgId===reg.orgId&&x.email===email);
      if(member?.status==='active'){addParticipation(member,{studyId:reg.studyId,studyTitle:reg.studyTitle,studyVersion:reg.studyVersion,responseId:data.responseId,completedAt:data.completedAt});member.updatedAt=Date.now();saveMembers(rows);return json(res,200,{ok:true,joined:false,alreadyMember:true,member:publicMember(member)})}
      const removeRaw=token(),now=Date.now(),isNew=!member;
      if(!member){member={id:safeId('panel'),orgId:reg.orgId,email,status:'pending',joinedAt:now,createdAt:now,participation:[]};rows.push(member)}
      member.email=email;member.status='pending';member.removedAt=null;member.removedReason='';member.removeTokenHash=sha(removeRaw);member.joinedAt=now;member.joinedStudyId=reg.studyId;member.joinedStudyTitle=reg.studyTitle;member.updatedAt=now;
      addParticipation(member,{studyId:reg.studyId,studyTitle:reg.studyTitle,studyVersion:reg.studyVersion,responseId:data.responseId,completedAt:data.completedAt});
      const origin=requestOrigin(req);if(!origin)return json(res,503,{ok:false,error:'public_origin_required',message:'EVE_PUBLIC_ORIGIN is required for panel removal links.'});
      const removeUrl=`${origin}/api/panel/remove/${encodeURIComponent(removeRaw)}`,tpl=welcomeTemplate(reg,removeUrl);
      try{await mailer.sendOne({to:email,subject:tpl.subject,text:tpl.text,htmlBody:tpl.htmlBody})}
      catch(err){return json(res,502,{ok:false,error:'welcome_email_failed',message:err.message})}
      member.status='active';member.welcomeEmailSentAt=Date.now();saveMembers(rows);
      return json(res,200,{ok:true,joined:true,member:publicMember(member)})
    }
    if(url.pathname==='/api/panel/participation'&&req.method==='POST'){
      const data=await body(req),reg=registrationByToken(data.token);if(!reg)return json(res,403,{ok:false,error:'study_token_rejected'});
      const email=cleanEmail(data.email);if(!email)return json(res,200,{ok:true,matched:false});
      const rows=loadMembers(),member=rows.find(x=>x.orgId===reg.orgId&&x.email===email&&x.status==='active');
      if(!member)return json(res,200,{ok:true,matched:false});
      addParticipation(member,{studyId:reg.studyId,studyTitle:reg.studyTitle,studyVersion:reg.studyVersion,responseId:data.responseId,completedAt:data.completedAt});member.updatedAt=Date.now();saveMembers(rows);
      return json(res,200,{ok:true,matched:true})
    }
    let studyDelete=url.pathname.match(/^\/api\/panel\/studies\/([A-Za-z0-9_-]+)$/);
    if(studyDelete&&req.method==='DELETE'){
      const auth=authOrLocal(req,res,'researcher');if(!auth)return true;
      const rows=loadStudies(),before=rows.length,next=rows.filter(x=>!(x.orgId===orgId(auth)&&x.studyId===studyDelete[1]));saveStudies(next);
      return json(res,200,{ok:true,removed:before-next.length})
    }
    let m=url.pathname.match(/^\/api\/panel\/members\/([A-Za-z0-9_-]+)$/);
    if(m&&req.method==='DELETE'){
      const auth=authOrLocal(req,res,'researcher');if(!auth)return true;
      if(!mailer?.status?.().configured)return json(res,503,{ok:false,error:'mail_not_configured',message:'Email must be configured so the participant can be notified before removal.'});
      const rows=loadMembers(),member=rows.find(x=>x.id===m[1]&&x.orgId===orgId(auth)&&x.status==='active');if(!member)return json(res,404,{ok:false,error:'member_not_found'});
      const tpl=removedTemplate();try{await mailer.sendOne({to:member.email,subject:tpl.subject,text:tpl.text,htmlBody:tpl.htmlBody})}catch(err){return json(res,502,{ok:false,error:'removal_email_failed',message:err.message})}
      member.status='removed';member.removedAt=Date.now();member.removedReason='researcher';member.removeTokenHash=null;member.updatedAt=Date.now();saveMembers(rows);appendAudit(auth,'panel_member_removed',{count:1});
      return json(res,200,{ok:true,removed:true})
    }
    m=url.pathname.match(/^\/api\/panel\/remove\/([A-Za-z0-9_-]+)$/);
    if(m&&req.method==='GET'){
      const hash=sha(m[1]),rows=loadMembers(),member=rows.find(x=>x.status==='active'&&equalHash(x.removeTokenHash,hash));
      if(!member)return writeHtml(res,404,'Panel link no longer active','This removal link has already been used or is no longer valid.');
      member.status='removed';member.removedAt=Date.now();member.removedReason='self';member.removeTokenHash=null;member.updatedAt=Date.now();saveMembers(rows);
      return writeHtml(res,200,'You have been removed','You are no longer part of this research participant panel and will not be contacted through it.')
    }
    return false
  }
  return {handle,publicMember,addParticipation};
}

module.exports={createParticipantPanel,cleanEmail};
