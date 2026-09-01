'use strict';

/* Eve first-run setup + relay routing.
   Keeps deployment/onboarding policy outside the main application. */

(function(global){
  const SETUP_VERSION=1;

  function cleanUrl(value){
    const raw=String(value||'').trim().replace(/\/+$/,'');
    if(!raw)return'';
    try{
      const u=new URL(raw);
      return /^https?:$/.test(u.protocol)?u.origin+(u.pathname==='/'?'':u.pathname.replace(/\/+$/,'')):'';
    }catch{return''}
  }

  function defaults({legacy=false}={}){
    return {
      version:SETUP_VERSION,
      completed:!!legacy,
      completedAt:legacy?Date.now():null,
      legacy:!!legacy,
      step:legacy?4:0,
      storageProvider:'microsoft',
      relayMode:legacy?'local':'cloudflare',
      relayUrl:'',
      participantAppUrl:'',
      relayOwnerKey:'',
      relayVerified:false,
      relayCheckedAt:null,
      relayLastError:'',
      recoveryConfirmed:false,
      evaluationMode:!!legacy,
      checks:null
    };
  }

  function normalise(current,{legacy=false}={}){
    const next={...defaults({legacy}),...(current||{})};
    next.version=SETUP_VERSION;
    next.step=Math.max(0,Math.min(4,Number(next.step)||0));
    next.storageProvider=next.storageProvider==='google'?'google':'microsoft';
    next.relayMode=next.relayMode==='local'?'local':'cloudflare';
    next.relayUrl=cleanUrl(next.relayUrl);
    next.participantAppUrl=cleanUrl(next.participantAppUrl);
    if(!next.relayOwnerKey&&next.relayMode==='cloudflare'&&typeof newRelayKey==='function')next.relayOwnerKey=newRelayKey();
    return next;
  }

  function needsOnboarding(setup){return !setup?.completed}
  function isParticipant(){return typeof state!=='undefined'&&state.view==='participant'}

  function relayBase(appState){
    const setup=appState?.setup;
    if(setup?.relayMode==='cloudflare'&&setup.relayUrl)return cleanUrl(setup.relayUrl);
    return '';
  }

  function relayUrl(appState,path=''){
    const base=relayBase(appState);
    const p=String(path||'');
    if(base)return `${base}${p.startsWith('/')?p:`/${p}`}`;
    return p||'/';
  }

  function participantBaseUrl(appState){
    const setup=appState?.setup;
    if(setup?.relayMode==='cloudflare'){
      return cleanUrl(setup.participantAppUrl)||cleanUrl(setup.relayUrl);
    }
    if(typeof location==='undefined')return'';
    return location.href.split('#')[0].replace(/\/+$/,'');
  }

  function ownerHeaders(appState,headers={}){
    const out={...(headers||{})};
    const key=String(appState?.setup?.relayOwnerKey||'').trim();
    if(key)out['X-Eve-Owner']=key;
    return out;
  }

  function storageReady(){
    return !!state?.storage?.connected;
  }

  function relayReady(){
    return state?.setup?.relayMode==='local'?!!state?.relayOnline:!!state?.setup?.relayVerified;
  }

  function recoveryReady(){return !!state?.setup?.recoveryConfirmed}
  function ready(){
    const evaluation=!!state?.setup?.evaluationMode;
    return (evaluation||storageReady())&&relayReady()&&(evaluation||recoveryReady());
  }

  function setSetup(patch,{save=true,rerender=true}={}){
    state.setup=normalise({...state.setup,...patch});
    if(save&&typeof scheduleSave==='function')scheduleSave();
    if(rerender&&typeof render==='function')render();
    return state.setup;
  }

  function setStep(step){setSetup({step:Number(step)||0})}
  function back(){setStep(Math.max(0,(state.setup?.step||0)-1))}
  function next(){setStep(Math.min(4,(state.setup?.step||0)+1))}

  function chooseStorage(provider){
    const p=provider==='google'?'google':'microsoft';
    setSetup({storageProvider:p},{rerender:false});
    global.EveCloud?.setDefaultProvider?.(p);
    render();
  }

  async function connectStorage(provider){
    chooseStorage(provider);
    global.EveCloud?.connect?.(provider);
  }

  async function refreshStorage(){
    try{
      await global.EveCloud?.initialise?.();
      const p=state.setup?.storageProvider||'microsoft';
      await global.EveCloud?.refreshConnector?.(p,{renderAfter:false});
      if(global.EveCloud?.connectorReady?.(p))await global.EveCloud?.setDefaultProvider?.(p);
    }catch{}
    render();
  }

  function openStorage(){navigate('/storage')}
  function returnToSetup(){state.view='setup';location.hash='/setup';render()}

  function useRelayMode(mode){
    const relayMode=mode==='local'?'local':'cloudflare';
    const patch={relayMode,relayVerified:relayMode==='local'?!!state.relayOnline:false,relayLastError:'',evaluationMode:relayMode==='local'};
    if(relayMode==='cloudflare'&&!state.setup?.relayOwnerKey)patch.relayOwnerKey=newRelayKey();
    setSetup(patch);
  }

  function updateRelayUrl(value){
    setSetup({relayUrl:cleanUrl(value),relayVerified:false,relayLastError:''},{rerender:false});
  }

  function updateParticipantUrl(value){
    setSetup({participantAppUrl:cleanUrl(value)},{rerender:false});
  }

  async function testRelay(){
    const setup=state.setup=normalise(state.setup);
    if(setup.relayMode==='local'){
      const ok=await relayHealth().catch(()=>false);
      setSetup({relayVerified:ok,relayCheckedAt:Date.now(),relayLastError:ok?'':'Local relay is not reachable.'});
      return ok;
    }
    if(!setup.relayUrl){
      setSetup({relayVerified:false,relayLastError:'Paste the Cloudflare relay URL first.'});
      return false;
    }
    try{
      const health=await eveFetch(relayUrl(state,'/api/health'),{cache:'no-store'},8000);
      if(!health.ok)throw new Error(`Relay health returned HTTP ${health.status}`);
      const owner=await eveFetch(relayUrl(state,'/api/owner-check'),{cache:'no-store',headers:ownerHeaders(state)},8000);
      if(!owner.ok)throw new Error(owner.status===403?'The relay owner key does not match this deployment.':`Owner check returned HTTP ${owner.status}`);
      const participant=cleanUrl(setup.participantAppUrl)||cleanUrl(setup.relayUrl);
      if(participant){
        const page=await fetch(participant,{cache:'no-store'});
        if(!page.ok)throw new Error(`Participant app returned HTTP ${page.status}`);
      }
      setSetup({relayVerified:true,relayCheckedAt:Date.now(),relayLastError:''});
      return true;
    }catch(err){
      setSetup({relayVerified:false,relayCheckedAt:Date.now(),relayLastError:String(err?.message||err)});
      return false;
    }
  }

  function relayConfig(){
    const setup=state.setup=normalise(state.setup);
    return {
      format:'eve-cloudflare-relay-setup-v1',
      createdAt:new Date().toISOString(),
      ownerKey:setup.relayOwnerKey,
      bucketName:'eve-relay',
      note:'Keep this file private. It contains the owner key for your Eve relay.'
    };
  }

  function downloadRelayConfig(){
    const blob=new Blob([JSON.stringify(relayConfig(),null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download='eve-relay-setup.json';a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  function openCloudflare(){
    window.open('https://dash.cloudflare.com/','_blank','noopener,noreferrer');
  }

  function setRecoveryConfirmed(value){setSetup({recoveryConfirmed:!!value})}

  function keyFingerprint(){
    try{
      const raw=localKeyRaw(true)||'';
      return raw?raw.slice(-12).replace(/=/g,''):'Not generated';
    }catch{return'Unavailable'}
  }

  async function runChecks(){
    const checks={
      storage:{ok:storageReady(),label:'Organisation storage',detail:storageReady()?`${state.storage.provider} · ${state.storage.location}`:'Connect SharePoint or Google Drive'},
      relay:{ok:false,label:'Participant relay',detail:'Checking…'},
      recovery:{ok:recoveryReady(),label:'Recovery',detail:recoveryReady()?'Recovery step confirmed':'Save a recovery backup/passphrase'},
      encryption:{ok:false,label:'Local encryption',detail:'Checking…'}
    };
    setSetup({checks},{rerender:true});
    checks.relay.ok=await testRelay();
    checks.relay.detail=checks.relay.ok?(state.setup.relayMode==='local'?'Local evaluation relay reachable':state.setup.relayUrl):state.setup.relayLastError||'Relay is not reachable';
    try{
      const key=newRelayKey(),sample={ok:true,at:Date.now()},cipher=await encryptWithKey(sample,key),plain=await decryptWithKey(cipher,key);
      checks.encryption.ok=plain?.ok===true;
      checks.encryption.detail=checks.encryption.ok?'Browser encryption round-trip passed':'Encryption check failed';
    }catch(err){checks.encryption.detail=String(err?.message||err)}
    if(state.setup.evaluationMode){
      checks.storage={ok:true,label:'Organisation storage',detail:'Local evaluation mode'};
      checks.recovery={ok:true,label:'Recovery',detail:'Not required for local evaluation'};
    }
    setSetup({checks},{rerender:true});
    return checks;
  }

  async function finish(){
    if(!ready()){
      await runChecks();
      if(!ready())return;
    }
    setSetup({completed:true,completedAt:Date.now(),step:4},{rerender:false});
    state.view='home';
    try{await persistWorkspace(false,{force:true})}catch{}
    location.hash='/';
    render();
    toast('Eve setup complete',2600,'success');
  }

  async function evaluationMode(){
    setSetup({
      completed:true,completedAt:Date.now(),step:4,evaluationMode:true,
      relayMode:'local',relayVerified:true,recoveryConfirmed:false
    },{rerender:false});
    state.view='home';
    try{await persistWorkspace(false,{force:true})}catch{}
    location.hash='/';
    render();
    toast('Local evaluation mode enabled',3000);
  }

  function restart(){
    setSetup({completed:false,step:0,evaluationMode:false},{rerender:false});
    state.view='setup';location.hash='/setup';render();
  }

  function progress(step){
    const labels=['Welcome','Storage','Relay','Recovery','Ready'];
    return `<ol class="setup-progress">${labels.map((x,i)=>`<li class="${i===step?'active':i<step?'done':''}"><span>${i<step?'✓':i+1}</span><b>${x}</b></li>`).join('')}</ol>`;
  }

  function storageStep(){
    const selected=state.setup.storageProvider,connected=storageReady();
    const card=(id,title,detail,mark)=>`<button type="button" class="setup-provider ${selected===id?'selected':''}" onclick="EveSetup.chooseStorage('${id}')"><span class="setup-provider-mark">${mark}</span><span><b>${title}</b><small>${detail}</small></span>${selected===id?'<i>Selected</i>':''}</button>`;
    return `<div class="setup-step"><div class="setup-kicker">1 · YOUR STORAGE</div><h1>Where should Eve keep your research?</h1><p class="setup-lead">Your organisation’s storage is the durable home for studies, responses and recordings. Eve encrypts research before it is synced.</p>
      <div class="setup-provider-grid">${card('microsoft','Microsoft SharePoint','Use an approved SharePoint document library','S')}${card('google','Google Drive','Use an app-created Eve folder in your Drive','G')}</div>
      <div class="setup-status ${connected?'ok':'attention'}"><span>${connected?'✓':'!'}</span><div><b>${connected?'Storage connected':'Storage still needs connecting'}</b><small>${connected?`${state.storage.provider} · ${state.storage.location}`:'Sign in and choose the approved Eve location.'}</small></div></div>
      <div class="setup-actions"><button class="btn" onclick="EveSetup.back()">← Back</button><div class="setup-actions-right"><button class="btn" onclick="EveSetup.refreshStorage()">Refresh status</button><button class="btn" onclick="EveSetup.connectStorage('${selected}')">Connect ${selected==='google'?'Google Drive':'SharePoint'}</button><button class="btn" onclick="EveSetup.openStorage()">Advanced storage setup</button><button class="btn primary" onclick="EveSetup.next()" ${connected?'':'disabled'}>Continue →</button></div></div>
      <details class="setup-help"><summary>Why can’t Eve just keep this on its own server?</summary><p>Because Eve is designed so that the organisation controls the durable research store. The local app and relay are transport/workspace components, not a vendor-owned research database.</p></details>
    </div>`;
  }

  function relayStep(){
    const s=state.setup=normalise(state.setup),cloud=s.relayMode==='cloudflare',verified=relayReady();
    return `<div class="setup-step"><div class="setup-kicker">2 · PARTICIPANT RELAY</div><h1>Give participants somewhere safe to send responses.</h1><p class="setup-lead">The relay is a temporary encrypted mailbox. Participants can submit while your computer is off; the relay cannot decrypt their research responses.</p>
      <div class="setup-mode-switch"><button class="${cloud?'active':''}" onclick="EveSetup.useRelayMode('cloudflare')">Cloudflare relay <small>Recommended</small></button><button class="${!cloud?'active':''}" onclick="EveSetup.useRelayMode('local')">Local relay <small>Evaluation only</small></button></div>
      ${cloud?`<div class="setup-relay-panel">
        <div class="setup-relay-explainer"><div><span>1</span><b>Deploy the bundled Eve Relay</b><small>The release includes <code>cloudflare-relay/</code> with the Worker and participant assets.</small></div><div><span>2</span><b>Give it this private owner key</b><small>Eve uses it to stop strangers publishing studies into your relay.</small></div><div><span>3</span><b>Paste the relay address back here</b><small>Eve tests the API and the participant page before continuing.</small></div></div>
        <div class="field"><label>Relay owner key</label><div class="setup-secret-row"><input class="input" readonly value="${esc(s.relayOwnerKey)}"><button class="btn" onclick="navigator.clipboard?.writeText('${esc(s.relayOwnerKey)}');toast('Owner key copied')">Copy</button></div><small>Keep this private. It is different from participant study keys.</small></div>
        <div class="toolbar"><button class="btn" onclick="EveSetup.downloadRelayConfig()">Download relay setup file</button><button class="btn" onclick="EveSetup.openCloudflare()">Open Cloudflare</button></div>
        <div class="field"><label>Cloudflare relay URL</label><input class="input" type="url" placeholder="https://eve-relay.example.workers.dev" value="${esc(s.relayUrl)}" oninput="EveSetup.updateRelayUrl(this.value)" onblur="render()"></div>
        <div class="field"><label>Participant app URL <span class="muted">(optional)</span></label><input class="input" type="url" placeholder="${esc(s.relayUrl||'Defaults to the relay URL')}" value="${esc(s.participantAppUrl)}" oninput="EveSetup.updateParticipantUrl(this.value)"><small>Leave blank when the Cloudflare relay serves Eve’s bundled participant app.</small></div>
      </div>`:`<div class="setup-status attention"><span>i</span><div><b>Local evaluation mode</b><small>Participant links only work while this computer is reachable. Do not use this mode for real external research.</small></div></div>`}
      <div class="setup-status ${verified?'ok':s.relayLastError?'error':'attention'}"><span>${verified?'✓':s.relayLastError?'×':'…'}</span><div><b>${verified?'Relay connection verified':s.relayLastError?'Relay check failed':'Relay not checked yet'}</b><small>${verified?(cloud?s.relayUrl:'Local relay reachable'):(s.relayLastError||'Run the connection test before continuing.')}</small></div></div>
      <div class="setup-actions"><button class="btn" onclick="EveSetup.back()">← Back</button><div class="setup-actions-right"><button class="btn" onclick="EveSetup.testRelay()">Test relay</button><button class="btn primary" onclick="EveSetup.next()" ${verified?'':'disabled'}>Continue →</button></div></div>
      ${cloud?`<details class="setup-help"><summary>Manual deployment instructions</summary><p>The bundled <code>cloudflare-relay</code> folder contains <code>deploy-relay.bat</code> and <code>deploy-relay.sh</code>. Run one, provide the downloaded <code>eve-relay-setup.json</code>, sign into Cloudflare when prompted, then paste the resulting Worker URL above.</p></details>`:''}
    </div>`;
  }

  function recoveryStep(){
    const fp=keyFingerprint();
    return `<div class="setup-step"><div class="setup-kicker">3 · RECOVERY</div><h1>Make sure the research can be recovered.</h1><p class="setup-lead">Eve deliberately does not keep a master copy of your decryption key. Save a portable recovery backup before relying on Eve for real research.</p>
      <div class="setup-recovery-card"><div><span>Local key fingerprint</span><strong>${esc(fp)}</strong><small>This identifies the browser key currently protecting your local workspace.</small></div><button class="btn primary" onclick="downloadEncryptedBackup()">Download portable backup</button></div>
      <label class="setup-confirm"><input type="checkbox" ${state.setup.recoveryConfirmed?'checked':''} onchange="EveSetup.setRecoveryConfirmed(this.checked)"><span><b>I have saved a recovery backup/passphrase somewhere approved.</b><small>Eve cannot recover encrypted research if every copy of the key/recovery material is lost.</small></span></label>
      <div class="setup-actions"><button class="btn" onclick="EveSetup.back()">← Back</button><button class="btn primary" onclick="EveSetup.next()" ${state.setup.recoveryConfirmed?'':'disabled'}>Continue →</button></div>
    </div>`;
  }

  function checksMarkup(){
    const checks=state.setup?.checks;
    if(!checks)return'<div class="setup-check-empty">Run the checks to confirm this installation is ready.</div>';
    return `<div class="setup-checks">${Object.values(checks).map(x=>`<div class="${x.ok?'ok':'error'}"><span>${x.ok?'✓':'×'}</span><div><b>${esc(x.label)}</b><small>${esc(x.detail)}</small></div></div>`).join('')}</div>`;
  }

  function readyStep(){
    return `<div class="setup-step"><div class="setup-kicker">4 · FINAL CHECK</div><h1>Check Eve is ready to run research.</h1><p class="setup-lead">This checks the storage, participant relay, browser encryption and recovery setup together.</p>
      ${checksMarkup()}
      <div class="setup-actions"><button class="btn" onclick="EveSetup.back()">← Back</button><div class="setup-actions-right"><button class="btn" onclick="EveSetup.runChecks()">Run checks</button><button class="btn primary" onclick="EveSetup.finish()" ${ready()?'':'disabled'}>Finish setup</button></div></div>
      <p class="setup-smallprint">You can return to Setup later from Settings. Before the first real study, run a disposable participant submission from a different device.</p>
    </div>`;
  }

  function welcomeStep(){
    return `<div class="setup-step setup-welcome"><div class="setup-brand"><span>E</span><b>Eve</b></div><div class="setup-kicker">FIRST-TIME SETUP</div><h1>Your research stays under your organisation’s control.</h1><p class="setup-lead">Eve runs locally. We’ll connect the places your organisation owns so researchers do not need an Eve account, an Eve cloud or vendor hosting.</p>
      <div class="setup-architecture"><div><span>1</span><b>Your computer</b><small>Build and analyse research locally.</small></div><i>→</i><div><span>2</span><b>Your storage</b><small>Durable encrypted research files.</small></div><i>↔</i><div><span>3</span><b>Your relay</b><small>Temporary encrypted participant transport.</small></div></div>
      <div class="setup-actions setup-welcome-actions"><button class="btn primary large" onclick="EveSetup.next()">Set up Eve →</button><button class="text-btn" onclick="EveSetup.evaluationMode()">Use local evaluation mode instead</button></div>
      <p class="setup-smallprint">Evaluation mode is useful for trying Eve on one computer. It is not suitable for live external participant research.</p>
    </div>`;
  }

  function view(){
    state.setup=normalise(state.setup);
    const step=state.setup.step||0;
    const body=step===0?welcomeStep():step===1?storageStep():step===2?relayStep():step===3?recoveryStep():readyStep();
    return `<div class="setup-shell"><div class="setup-frame">${progress(step)}<main class="setup-main">${body}</main></div></div>`;
  }

  global.EveSetup={
    defaults,normalise,needsOnboarding,relayUrl,participantBaseUrl,ownerHeaders,
    view,setStep,next,back,chooseStorage,connectStorage,refreshStorage,openStorage,returnToSetup,
    useRelayMode,updateRelayUrl,updateParticipantUrl,testRelay,downloadRelayConfig,openCloudflare,
    setRecoveryConfirmed,runChecks,finish,evaluationMode,restart,ready,keyFingerprint
  };
})(globalThis);
