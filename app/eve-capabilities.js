'use strict';

/* Deployment capability registry.
   The UI must never imply a capability exists just because Eve Core contains it. */

(function(global){
  const FEATURES=Object.freeze({
    storage:{label:'Organisation storage'},
    participantRelay:{label:'Participant connection'},
    recording:{label:'Audio/video recording'},
    panel:{label:'Participant Panel'},
    email:{label:'Organisation email'},
    ai:{label:'External AI'},
    collaboration:{label:'Team collaboration'},
    sso:{label:'Organisation SSO'},
    recruitment:{label:'Recruitment email'},
    navigationCapture:{label:'Navigation audio/video/screen capture'}
  });

  const STANDARD=Object.freeze({
    storage:true,participantRelay:true,recording:true,panel:true,email:true,ai:true,
    collaboration:true,sso:true,recruitment:true,navigationCapture:true
  });

  const GOOGLE=Object.freeze({
    storage:true,participantRelay:true,
    recording:false,
    panel:false,
    email:false,
    ai:false,
    collaboration:false,
    sso:false,
    recruitment:false,
    navigationCapture:false
  });

  const NOTES=Object.freeze({
    recording:'Apps Script HTMLService does not provide the browser media-permission surface Eve needs for reliable microphone/camera capture. Use a non-Google deployment for recording studies.',
    panel:'Participant Panel signup/removal/email is not implemented in the Google Workspace response service yet.',
    email:'Microsoft 365 organisation email is available in the full Node deployment, not the Google Workspace edition.',
    ai:'External AI provider configuration is not available in the Google Workspace edition yet. Eve’s local evidence summaries still work.',
    collaboration:'The Google Workspace edition is currently single-owner. Multi-researcher collaboration is not available yet.',
    sso:'Google Workspace identity protects the copied launcher, but Eve’s full organisation SSO/RBAC control plane is not part of this edition.',
    recruitment:'Automated recruitment email is not available in the Google Workspace edition yet.',
    navigationCapture:'Navigation tasks work in manual/no-recording mode. Audio, video and screen capture are disabled in the Google Workspace edition.'
  });

  let stateProvider=()=>global.state;
  function bindState(provider){if(typeof provider==='function')stateProvider=provider}
  function currentState(){try{return stateProvider?.()||global.state||null}catch{return global.state||null}}

  function deploymentMode(){
    return global.EveDeployment?.mode?.()||'standard';
  }

  function capabilities(){
    if(deploymentMode()==='google-workspace')return GOOGLE;
    if(currentState()?.setup?.relayMode==='cloudflare')return {...STANDARD,panel:false};
    return STANDARD;
  }

  function note(feature){
    if(feature==='panel'&&deploymentMode()!=='google-workspace'&&currentState()?.setup?.relayMode==='cloudflare')
      return 'Participant Panel signup is not available with the standalone Cloudflare relay because panel membership/email is operational PII rather than zero-access research transport.';
    return NOTES[feature]||'';
  }

  function supports(feature){
    return capabilities()[feature]!==false;
  }

  function featureForBlock(type){
    if(type==='recording')return'recording';
    if(type==='panelSignup')return'panel';
    return null;
  }

  function blockSupport(type){
    const feature=featureForBlock(type);
    return feature?{supported:supports(feature),feature,note:note(feature)}:{supported:true,feature:null,note:''};
  }

  function studyIssues(study){
    const issues=[];
    for(const block of study?.blocks||[]){
      const support=blockSupport(block.type);
      if(!support.supported)issues.push(`${FEATURES[support.feature]?.label||support.feature} is not supported by this deployment.`);
      if(block.type==='navigationTask'&&!supports('navigationCapture')&&(block.navigationRecordAudio||block.navigationRecordVideo||block.navigationRecordScreen)){
        issues.push('Navigation recording is not supported by this deployment. Turn off Audio, Video and Screen capture for the navigation task.');
      }
    }
    return [...new Set(issues)];
  }

  function unavailableCard(feature,{title='',description=''}={}){
    const label=title||FEATURES[feature]?.label||feature;
    const noteText=description||note(feature)||'This capability is not available in the current deployment.';
    return `<section class="card settings-card deployment-capability-card unavailable"><div class="settings-card-icon" aria-hidden="true">–</div><div class="section-label">DEPLOYMENT CAPABILITY</div><h3>${global.esc?global.esc(label):label}</h3><p>${global.esc?global.esc(noteText):noteText}</p><span class="pill">Not available here</span></section>`;
  }

  function inlineNotice(feature){
    const noteText=note(feature)||'This capability is not available in the current deployment.';
    return `<div class="settings-note warning deployment-capability-note"><b>Unavailable in ${deploymentMode()==='google-workspace'?'Google Workspace':'this deployment'}.</b> ${global.esc?global.esc(noteText):noteText}</div>`;
  }

  function capabilitySummary(){
    return Object.entries(FEATURES).map(([id,meta])=>({id,label:meta.label,supported:supports(id),note:note(id)}));
  }

  function applyDefaults(appState){
    if(!appState)return;
    if(!supports('ai')){
      appState.globalSettings=appState.globalSettings||{};
      appState.globalSettings.defaultAi='off';
    }
    return appState;
  }


  function integrationHealthMarkup(appState,a,m){
    const storageConnected=!!appState?.storage?.connected,storageProvider=String(appState?.storage?.provider||'Customer storage');
    const items=[
      supports('participantRelay')
        ?{label:'Participant connection',state:appState?.relayOnline?'ready':'attention',detail:appState?.relayOnline?'Reachable':'Connection needs attention',action:'setup'}
        :{label:'Participant connection',state:'attention',detail:'Unavailable in this deployment',action:''},
      supports('ai')
        ?{label:'AI provider',state:a?.loading&&!a?.loaded?'checking':!a?.enabled?'off':a?.configured?'ready':'attention',detail:!a?.enabled?'Off globally':a?.configured?`${a.model||'Model configured'}`:'API key required',action:''}
        :{label:'External AI',state:'off',detail:'Not part of this deployment',action:''},
      supports('email')
        ?{label:'Organisation email',state:m?.loading&&!m?.loaded?'checking':m?.configured?(m?.lastTestOk?'ready':'attention'):'attention',detail:m?.configured?(m?.lastTestOk?`Sending from ${m.sender}`:'Configured · test recommended'):'Not connected',action:''}
        :{label:'Organisation email',state:'off',detail:'Not part of this deployment',action:''},
      {label:'Organisation storage',state:storageConnected?'ready':'attention',detail:storageConnected?`${storageProvider} connected`:`${storageProvider} not connected`,action:'storage'}
    ];
    const ready=items.filter(i=>i.state==='ready'||i.state==='off').length;
    const e=global.esc||((v)=>String(v||''));
    return `<section class="card integration-health"><div class="integration-health-head"><div><div class="eyebrow">WORKSPACE HEALTH</div><h3>${ready===items.length?'Core services ready':`${items.length-ready} service${items.length-ready===1?'':'s'} need attention`}</h3><p>Only services supported by this deployment count toward readiness.</p></div><span class="integration-health-score">${ready}/${items.length}</span></div><div class="integration-health-grid">${items.map(item=>`<div class="integration-health-item ${item.state}"><span class="integration-health-mark">${item.state==='ready'?'✓':item.state==='off'?'–':item.state==='checking'?'…':'!'}</span><div><b>${e(item.label)}</b><small>${e(item.detail)}</small></div>${item.action==='storage'?"<button class=\"text-btn\" onclick=\"navigate('/storage')\">Open →</button>":item.action==='setup'?"<button class=\"text-btn\" onclick=\"navigate('/setup')\">Open →</button>":''}</div>`).join('')}</div></section>`;
  }

  function workspaceBanner(){
    if(deploymentMode()!=='google-workspace')return'';
    return `<section class="card deployment-capability-banner"><div><div class="eyebrow">GOOGLE WORKSPACE EDITION</div><h3>Browser-first Eve Core</h3><p>Storage and participant collection are native here. Recording, Participant Panel, organisation email, external AI and multi-researcher administration remain unavailable in this edition.</p></div><button class="btn" onclick="navigate('/setup')">Deployment details</button></section>`;
  }

  function studyBanner(study){
    if(deploymentMode()!=='google-workspace')return'';
    const unsupported=studyIssues(study);
    return `<div class="settings-note deployment-study-banner ${unsupported.length?'warning':''}"><b>Google Workspace capability check.</b> ${unsupported.length?`${unsupported.length} deployment limitation${unsupported.length===1?'':'s'} currently affect this study.`:'This study uses only capabilities supported by the Google Workspace edition.'}</div>`;
  }

  global.EveCapabilities={
    FEATURES,NOTES,bindState,deploymentMode,capabilities,note,supports,featureForBlock,blockSupport,
    studyIssues,unavailableCard,inlineNotice,capabilitySummary,applyDefaults,integrationHealthMarkup,workspaceBanner,studyBanner
  };
})(globalThis);
