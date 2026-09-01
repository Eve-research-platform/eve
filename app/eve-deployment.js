'use strict';

/* Eve deployment adapter.
   v59.1 adds a single-deployment Google Apps Script/Drive runtime without changing Eve Core. */

(function(global){
  function hasAppsScript(){return !!(global.google?.script?.run)}
  function mode(){
    if(hasAppsScript())return'google-workspace';
    const configured=String(global.EVE_RUNTIME_CONFIG?.mode||'').trim();
    return configured||'standard';
  }
  function isGoogleWorkspace(){return mode()==='google-workspace'}
  function isOrganisationCloud(){return mode()==='organisation-cloud'}
  function runtimeConfig(){return global.EVE_RUNTIME_CONFIG||{}}


  let appsScriptHash='';
  async function prepareLocation(){
    if(!isGoogleWorkspace()||!global.google?.script?.url?.getLocation)return'';
    return new Promise(resolve=>{
      try{google.script.url.getLocation(loc=>{appsScriptHash=String(loc?.hash||'');resolve(appsScriptHash)})}
      catch{resolve('')}
    });
  }
  function currentHash(){
    if(isGoogleWorkspace()&&appsScriptHash)return appsScriptHash.replace(/^#/,'');
    return typeof location!=='undefined'?String(location.hash||'').replace(/^#/,''):'';
  }

  function consumeInstallCapability(){
    if(!isGoogleWorkspace())return'';
    const h=currentHash();
    if(!h.startsWith('/install?'))return'';
    const query=h.slice(h.indexOf('?')+1),key=String(new URLSearchParams(query).get('o')||'').trim();
    if(!key)return'';
    appsScriptHash='/setup';
    try{global.google?.script?.history?.replace?.({}, {}, '/setup')}catch{}
    return key;
  }

  function appsScriptCall(name,...args){
    if(!hasAppsScript())return Promise.reject(new Error('Google Apps Script bridge is unavailable.'));
    return new Promise((resolve,reject)=>{
      try{
        const runner=google.script.run
          .withSuccessHandler(resolve)
          .withFailureHandler(err=>reject(new Error(err?.message||String(err||'Google Apps Script request failed'))));
        runner[name](...args);
      }catch(err){reject(err)}
    });
  }

  function headersObject(headers){
    if(!headers)return{};
    if(headers instanceof Headers)return Object.fromEntries(headers.entries());
    if(Array.isArray(headers))return Object.fromEntries(headers);
    return {...headers};
  }

  async function relayFetch(path,options={},timeout=20000){
    if(!isGoogleWorkspace()){
      const url=global.EveSetup?.relayUrl?.(global.state,path)||path;
      return global.eveFetch(url,options,timeout);
    }
    const method=String(options.method||'GET').toUpperCase();
    let body=options.body;
    if(body!==undefined&&body!==null&&typeof body!=='string')body=String(body);
    const result=await appsScriptCall('eveRelayRequest',{path:String(path||'/'),method,headers:headersObject(options.headers),body:body||''});
    return new Response(result?.body||'',{status:Number(result?.status||500),headers:result?.headers||{'Content-Type':'application/json'}});
  }

  async function bootstrap(ownerKey){
    if(!isGoogleWorkspace())throw new Error('Google Workspace runtime is not active.');
    return await appsScriptCall('eveBootstrap',String(ownerKey||''))||{};
  }

  async function initialiseSingleDeployment(appState,installKey=''){
    if(!isGoogleWorkspace())return null;
    const ownerKey=String(installKey||appState?.setup?.relayOwnerKey||'').trim();
    if(!ownerKey)return null;
    const info=await bootstrap(ownerKey),appUrl=String(info.participantUrl||info.researcherUrl||'').trim();
    appState.setup={
      ...(appState.setup||{}),
      relayOwnerKey:ownerKey,
      relayMode:'google-workspace',
      participantAppUrl:appUrl,
      relayVerified:true,
      relayCheckedAt:Date.now(),
      relayLastError:''
    };
    if(installKey&&!appState.setup.completed)appState.setup.step=3;
    appState.storage={
      provider:'Google Drive',
      connected:true,
      location:info.location||'My Drive / Eve',
      permission:'Eve folder',
      lastSync:appState.storage?.lastSync||null,
      cloudSyncState:appState.storage?.cloudSyncState||'idle',
      cloudSyncError:appState.storage?.cloudSyncError||'',
      ...(appState.storage||{})
    };
    appState.storage.provider='Google Drive';
    appState.storage.connected=true;
    appState.storage.location=info.location||'My Drive / Eve';
    appState.storage.ownership=info.storageOwnership||appState.storage.ownership||'My Drive';
    appState.storage.connectors={google:null,microsoft:null,...(appState.storage.connectors||{})};
    appState.storage.connectors.google={
      capability:'apps-script',
      connection:{connected:true,location:{displayName:appState.storage.location,rootFolderId:info.rootFolderId||''}}
    };
    return info;
  }
  async function initialiseAppState(appState){
    if(isOrganisationCloud()){
      const cfg=runtimeConfig(),base=String(cfg.publicOrigin||location.origin||'').replace(/\/+$/,'');
      appState.setup={
        ...(appState.setup||{}),
        relayMode:'organisation',
        participantAppUrl:base,
        relayVerified:true,
        relayCheckedAt:Date.now(),
        relayLastError:'',
        evaluationMode:false
      };
      appState.globalSettings=appState.globalSettings||{};
      if(cfg.organisationStorage?.enabled!==false){
        appState.globalSettings.defaultStorageProvider='organisation';
        appState.storage={...(appState.storage||{}),provider:cfg.organisationStorage?.label||'Organisation cloud storage',connected:true,location:cfg.organisationStorage?.label||'Organisation cloud storage'};
      }else if(cfg.defaultStorageProvider){
        appState.globalSettings.defaultStorageProvider=cfg.defaultStorageProvider==='google'?'Google Drive':cfg.defaultStorageProvider==='microsoft'?'SharePoint':appState.globalSettings.defaultStorageProvider;
      }
      return true;
    }
    const installOwner=consumeInstallCapability();
    if(installOwner)appState.setup={...(appState.setup||{}),relayOwnerKey:installOwner,relayMode:'google-workspace'};
    const h=currentHash();
    if(!isGoogleWorkspace()||h.startsWith('/s/')||!appState.setup?.relayOwnerKey)return false;
    try{
      await initialiseSingleDeployment(appState,installOwner);
      if(installOwner)global.scheduleSave?.();
      return !!installOwner;
    }catch(err){
      appState.setup.relayVerified=false;
      appState.setup.relayLastError=String(err?.message||err);
      return false;
    }
  }

  async function storageWrite(ownerKey,path,content){return appsScriptCall('eveStorageWrite',String(ownerKey||''),String(path||''),String(content||''))}
  async function storageRead(ownerKey,path){return appsScriptCall('eveStorageRead',String(ownerKey||''),String(path||''))}
  async function storageDelete(ownerKey,path){return appsScriptCall('eveStorageDelete',String(ownerKey||''),String(path||''))}
  async function storageList(ownerKey,prefix){return appsScriptCall('eveStorageList',String(ownerKey||''),String(prefix||''))}
  async function storageInfo(ownerKey){return appsScriptCall('eveStorageInfo',String(ownerKey||''))}

  function participantBaseUrl(appState){
    if(isGoogleWorkspace()||isOrganisationCloud())return String(appState?.setup?.participantAppUrl||runtimeConfig().publicOrigin||'').trim().replace(/\/+$/,'');
    return global.EveSetup?.participantBaseUrl?.(appState)||'';
  }

  function researcherRuntimeLabel(){
    if(isOrganisationCloud())return runtimeConfig().cloudProvider==='azure'?'Microsoft Azure':runtimeConfig().cloudProvider==='google-cloud'?'Google Cloud':'Organisation cloud';
    return isGoogleWorkspace()?'Google Workspace':'Local';
  }

  function organisationCloudSetupStep(step){
    if(!isOrganisationCloud())return null;
    const cfg=runtimeConfig(),provider=cfg.cloudProvider==='azure'?'Microsoft Azure':cfg.cloudProvider==='google-cloud'?'Google Cloud':'organisation cloud';
    if(step===0)return `<div class="setup-step setup-welcome"><div class="setup-brand"><span>E</span><b>Eve</b></div><div class="setup-kicker">FULL ORGANISATION DEPLOYMENT</div><h1>Your organisation already hosts the complete Eve platform.</h1><p class="setup-lead">This Eve instance is running in ${provider}. The public participant connection and full Node service are already deployed; you only need to connect the organisation research storage and save recovery material.</p><div class="setup-architecture"><div><span>1</span><b>Eve service</b><small>Full Builder, Review, recording, Panel, AI and collaboration capabilities.</small></div><i>↔</i><div><span>2</span><b>Organisation storage</b><small>Connect SharePoint or Google Drive for durable encrypted research.</small></div><i>↔</i><div><span>3</span><b>Participants</b><small>Use this organisation-owned Eve URL directly.</small></div></div><div class="setup-actions setup-welcome-actions"><button class="btn primary large" onclick="EveSetup.next()">Continue setup →</button></div></div>`;
    if(step===1)return `<div class="setup-step"><div class="setup-kicker">1 · ORGANISATION STORAGE</div><h1>Your durable research storage is already connected.</h1><p class="setup-lead">Eve encrypts research in the browser and stores the ciphertext in cloud storage owned by this deployment. You do not need to register a Google or Microsoft OAuth application to start using Eve.</p><div class="setup-status ok"><span>✓</span><div><b>${global.esc?global.esc(cfg.organisationStorage?.label||'Organisation cloud storage'):cfg.organisationStorage?.label||'Organisation cloud storage'} ready</b><small>Managed by this organisation-owned Eve runtime</small></div></div><div class="setup-provider-grid"><div class="setup-provider selected" style="cursor:default"><span class="setup-provider-mark">✓</span><span><b>No OAuth client required</b><small>Google Drive or SharePoint can still be connected later as optional secondary storage.</small></span><i>Default</i></div></div><div class="setup-actions"><button class="btn" onclick="EveSetup.back()">← Back</button><button class="btn primary" onclick="EveSetup.next()">Continue →</button></div></div>`;
    if(step===2)return `<div class="setup-step"><div class="setup-kicker">2 · PARTICIPANT CONNECTION</div><h1>Your participant connection is already live.</h1><p class="setup-lead">Participants use this same organisation-owned Eve service. No Cloudflare relay, Apps Script deployment or researcher desktop process is required.</p><div class="setup-status ok"><span>✓</span><div><b>Organisation participant service ready</b><small>${global.esc?global.esc(cfg.publicOrigin||location.origin):cfg.publicOrigin||location.origin}</small></div></div><div class="setup-provider-grid"><div class="setup-provider selected" style="cursor:default"><span class="setup-provider-mark">E</span><span><b>Full Eve capability set</b><small>Recording, Participant Panel, email, AI integrations, collaboration/RBAC and all study methods remain available when their integrations are configured.</small></span><i>Full</i></div></div><div class="setup-actions"><button class="btn" onclick="EveSetup.back()">← Back</button><button class="btn primary" onclick="EveSetup.next()">Continue →</button></div></div>`;
    return null;
  }

  function googleWelcomeStep(){
    return `<div class="setup-step setup-welcome"><div class="setup-brand"><span>E</span><b>Eve</b></div><div class="setup-kicker">GOOGLE WORKSPACE EDITION</div><h1>Run Eve entirely in your Google Workspace.</h1><p class="setup-lead">No desktop application, Node.js, Cloudflare account or Eve-hosted research service. Your copied Google Sheet owns one Apps Script web app and Google Drive holds the durable encrypted research.</p>
      <div class="setup-architecture"><div><span>1</span><b>Apps Script</b><small>Eve researcher + participant web app.</small></div><i>↔</i><div><span>2</span><b>Google Drive</b><small>Organisation-owned encrypted research.</small></div><i>↔</i><div><span>3</span><b>Participant browser</b><small>Encrypts responses before storage.</small></div></div>
      <div class="setup-actions setup-welcome-actions"><button class="btn primary large" onclick="EveSetup.next()">Set up Google Workspace Eve →</button></div>
      <p class="setup-smallprint">Your Workspace administrator can restrict public/anonymous Apps Script web apps. External participant access still depends on the audience options your organisation permits.</p>
    </div>`;
  }

  function googleSetupStorageStep(){
    const connected=!!global.state?.storage?.connected;
    return `<div class="setup-step"><div class="setup-kicker">1 · GOOGLE DRIVE</div><h1>Connect Eve to your Google Drive.</h1><p class="setup-lead">Your copied Google Sheet prepares Eve under your Google Workspace identity. Eve creates an <b>Eve</b> folder in your Drive and keeps durable research there as browser-encrypted files.</p>
      <div class="setup-provider-grid"><div class="setup-provider selected" style="cursor:default"><span class="setup-provider-mark">G</span><span><b>Google Drive</b><small>No desktop app, Node.js or separate OAuth client is required for this edition.</small></span><i>Workspace native</i></div></div>
      <div class="setup-status ${connected?'ok':'attention'}"><span>${connected?'✓':'!'}</span><div><b>${connected?'Google Drive connected':'Initialise your Eve Drive folder'}</b><small>${connected?`${global.state.storage.location||'My Drive / Eve'}`:'Google will ask you to authorise this Apps Script project to use Drive.'}</small></div></div>
      <div class="setup-actions"><button class="btn" onclick="EveSetup.back()">← Back</button><div class="setup-actions-right"><button class="btn" onclick="EveSetup.connectStorage('google')">${connected?'Re-check Google Drive':'Connect Google Drive'}</button><button class="btn primary" onclick="EveSetup.next()" ${connected?'':'disabled'}>Continue →</button></div></div>
      <div class="settings-note"><b>Organisation ownership:</b> ${global.state?.storage?.ownership==='Shared Drive'?'This Eve root is in a Shared Drive.':'For team/government use, move the app-created <b>Eve</b> folder into an approved Shared Drive after setup. Eve keeps using the folder by its Drive ID; re-check storage afterwards.'}</div>
      <details class="setup-help"><summary>What can the Apps Script project access?</summary><p>Eve now requests Google’s narrower <code>drive.file</code> permission. It can manage the Drive files/folders it created for this Eve copy rather than requesting blanket access to all Drive files.</p></details>
    </div>`;
  }

  function googleSetupParticipantStep(){
    const setup=global.state?.setup||{},verified=!!setup.relayVerified,appUrl=String(setup.participantAppUrl||'').trim();
    const safe=value=>global.esc?global.esc(value):String(value||'');
    return `<div class="setup-step"><div class="setup-kicker">2 · PARTICIPANT CONNECTION</div><h1>Your Eve web app is also the participant connection.</h1><p class="setup-lead">v59.1 uses one Apps Script web-app deployment. Researchers and participants open the same base application, but researcher operations require your private Eve owner capability and participant studies use their own version capabilities.</p>
      <div class="setup-relay-panel">
        <div class="setup-relay-explainer"><div><span>1</span><b>One deployment</b><small>No second researcher or participant deployment to maintain.</small></div><div><span>2</span><b>Owner-protected research</b><small>The secure launch from your copied Google Sheet gives your browser the researcher capability.</small></div><div><span>3</span><b>Participant-safe links</b><small>Study links contain only the participant/version capability in the URL fragment.</small></div></div>
        <div class="field"><label>Eve web-app URL</label><input class="input" readonly value="${safe(appUrl||'Open Eve from your copied Google Sheet to initialise this browser.')}"></div>
        <div class="settings-note">For external anonymous research, your Google Workspace policy must allow the web-app audience you selected during deployment. If your organisation blocks anonymous Apps Script web apps, Eve can still be used for audiences permitted by that policy.</div>
      </div>
      <div class="setup-status ${verified?'ok':setup.relayLastError?'error':'attention'}"><span>${verified?'✓':setup.relayLastError?'×':'…'}</span><div><b>${verified?'Participant connection ready':setup.relayLastError?'Connection check failed':'Secure launch required'}</b><small>${verified?safe(appUrl):safe(setup.relayLastError||'Return to the copied Google Sheet and choose Eve → Set up / open Eve.')}</small></div></div>
      <div class="setup-actions"><button class="btn" onclick="EveSetup.back()">← Back</button><div class="setup-actions-right">${appUrl?`<button class="btn" onclick="window.open('${safe(appUrl)}','_blank','noopener,noreferrer')">Open web app</button>`:''}<button class="btn" onclick="EveSetup.testRelay()">Re-check connection</button><button class="btn primary" onclick="EveSetup.next()" ${verified?'':'disabled'}>Continue →</button></div></div>
      <details class="setup-help"><summary>Why is a public deployment safe?</summary><p>The public web app does not grant researcher access by itself. Drive workspace calls and researcher relay administration require the random Eve owner capability prepared from your copied Google Sheet. Participants receive only their study/version capability.</p></details>
    </div>`;
  }

  function providerSetupStep(step){
    if(isOrganisationCloud())return organisationCloudSetupStep(step);
    if(!isGoogleWorkspace())return null;
    if(step===0)return googleWelcomeStep();
    if(step===1)return googleSetupStorageStep();
    if(step===2)return googleSetupParticipantStep();
    return null;
  }

  function googleStoragePage(){
    const s=global.state?.storage||{},connected=!!s.connected;
    return global.shell(`<div class="content cloud-storage-page"><section class="hero compact"><div><div class="eyebrow">GOOGLE WORKSPACE</div><h2>Organisation-owned research storage</h2><p>This Eve deployment writes encrypted research files into the Google Drive associated with the copied Eve Google Sheet.</p></div><div class="storage-health ${connected?'connected':''}"><span class="status-dot ${connected?'':'warn'}"></span><div><b>${connected?'Google Drive connected':'Google Drive needs connecting'}</b><small>${connected?global.esc(s.location||'My Drive / Eve'):'Use Setup to initialise the Eve folder.'}</small></div></div></section>
      ${global.EveSetup?.needsOnboarding?.(global.state.setup)?'<div class="setup-return-banner"><div><b>First-time setup is still in progress.</b><small>Finish Google Drive setup, then return to the wizard.</small></div><button class="btn primary" onclick="EveSetup.returnToSetup()">Return to setup</button></div>':''}
      <section class="card"><div class="section-label">GOOGLE DRIVE</div><h3>Eve folder</h3><p>Eve creates and manages an <b>Eve</b> folder in the deploying researcher's Drive. Research files are encrypted in the browser before durable workspace sync.</p><div class="boundary-list"><div><span>Status</span><b>${connected?'Connected':'Not connected'}</b></div><div><span>Location</span><b>${global.esc(s.location||'My Drive / Eve')}</b></div><div><span>Ownership</span><b>${global.esc(s.ownership||'My Drive')}</b></div><div><span>Permission</span><b>drive.file</b></div><div><span>Runtime</span><b>Apps Script + Drive</b></div></div><div class="toolbar"><button class="btn primary" onclick="EveSetup.connectStorage('google')">${connected?'Re-check Drive':'Connect Google Drive'}</button><button class="btn" onclick="EveCloud.syncProvider('google',{manual:true})" ${connected?'':'disabled'}>Sync now</button></div></section>
      <section class="card"><div class="section-label">DATA BOUNDARY</div><h3>No Eve-owned storage account</h3><p>Researcher Drive operations require Eve's private owner capability. Participant study/version capabilities are separate, and the participant decryption key is not written into Drive.</p></section>
    </div>`,'Storage');
  }

  global.EveDeployment={mode,isGoogleWorkspace,isOrganisationCloud,runtimeConfig,prepareLocation,currentHash,consumeInstallCapability,appsScriptCall,relayFetch,bootstrap,initialiseSingleDeployment,initialiseAppState,storageWrite,storageRead,storageDelete,storageList,storageInfo,participantBaseUrl,researcherRuntimeLabel,providerSetupStep,googleStoragePage};
})(globalThis);
