'use strict';

/*
 * Eve v53.7 cloud-storage client
 * Browser-side encryption, provider sync and v49-style recovery/reconciliation.
 * OAuth credentials/tokens never enter this module: the browser holds only an
 * opaque connector capability returned by the local Eve service.
 */
(function(global){
  const SYNC_DEBOUNCE_MS=1400;
  const cloudTimers=new Map();
  const cloudRunning=new Map();
  let connectorConfig={loaded:false,loading:false,error:'',google:{configured:false},microsoft:{configured:false}};
  let microsoftDiscovery=null;
  let recoverySession=null;
  let bridgeBound=false;

  function providerKey(value){
    const v=String(value||'').trim().toLowerCase();
    if(v==='google'||v==='google drive'||v==='googledrive'||v==='google-drive')return'google';
    if(v==='microsoft'||v==='sharepoint'||v==='microsoft sharepoint')return'microsoft';
    return'';
  }
  function providerLabel(key){return key==='google'?'Google Drive':'SharePoint'}
  function providerForStudy(study){
    const configured=study?.settings?.storageProvider||'organisation';
    return providerKey(configured==='organisation'?state.storage.provider:configured);
  }
  function connector(key){return state.storage?.connectors?.[providerKey(key)]||null}
  function connectorReady(key){
    const c=connector(key),p=providerKey(key);
    if(!c?.capability||!c.connection?.connected)return false;
    return p==='google'?!!c.connection.location?.rootFolderId:!!(c.connection.location?.driveId&&c.connection.location?.rootFolderId)
  }
  function locationLabel(key){
    const p=providerKey(key),c=connector(p);
    return c?.connection?.location?.displayName||(p==='google'?'My Drive / Eve':'SharePoint / Eve')
  }
  function ensureStorageShape(){
    state.storage=state.storage||{};
    state.storage.connectors={google:null,microsoft:null,...(state.storage.connectors||{})};
    state.storage.cloudSyncState=state.storage.cloudSyncState||'idle';
    state.storage.cloudSyncError=state.storage.cloudSyncError||'';
    refreshDerivedStorage();
  }
  function refreshDerivedStorage(){
    const p=providerKey(state.storage?.provider)||'microsoft';
    state.storage.provider=p==='google'?'Google Drive':'SharePoint';
    state.storage.connected=connectorReady(p);
    state.storage.location=connectorReady(p)?locationLabel(p):(p==='google'?'My Drive / Eve':'Customer Research / Eve');
  }
  function resolvedStudyStorage(study){
    const usesOrganisationDefault=(study?.settings?.storageProvider||'organisation')==='organisation';
    const p=providerForStudy(study)||(providerKey(state.storage.provider)||'microsoft');
    const explicit=String(study?.settings?.storageLocation||'').trim();
    return{
      provider:p==='google'?'Google Drive':'SharePoint',
      location:explicit||locationLabel(p),
      usesOrganisationDefault,
      connected:connectorReady(p)
    }
  }

  async function api(url,options={},timeout=20000){
    const r=await eveFetch(url,{cache:'no-store',...options},timeout);
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw Object.assign(new Error(data.message||data.error||`HTTP ${r.status}`),{status:r.status,data});
    return data
  }
  function connectorServiceHelp(error=''){const direct=typeof location!=='undefined'&&location.protocol==='file:';if(direct)return'Cloud connections need Eve’s local service. Start Eve with start-eve.bat or npm start, then open the localhost address instead of opening index.html directly.';if(/failed to fetch|networkerror|load failed/i.test(String(error||'')))return'Eve could not reach its cloud-connector service. Make sure this full build is running through start-eve.bat or npm start, then refresh Storage.';return String(error||'Cloud connector configuration is unavailable.')}
  async function loadConfig(force=false){
    if(connectorConfig.loading||connectorConfig.loaded&&!force)return connectorConfig;
    connectorConfig.loading=true;
    try{
      const d=await api('/api/connectors/config');
      connectorConfig={...d,loaded:true,loading:false,error:''}
    }catch(err){connectorConfig={...connectorConfig,loaded:true,loading:false,error:connectorServiceHelp(err.message),serviceUnavailable:true}}
    if(state?.view==='storage')render();
    return connectorConfig
  }
  async function refreshConnector(key,{renderAfter=true}={}){
    ensureStorageShape();const p=providerKey(key),c=connector(p);if(!c?.capability)return null;
    try{
      const d=await api(`/api/connectors/status?cap=${encodeURIComponent(c.capability)}`);
      state.storage.connectors[p]={...c,connection:d.connection,error:''};
      refreshDerivedStorage();
      await persistWorkspace(false,{skipCloud:true});
      if(renderAfter&&state.view==='storage')render();
      return d.connection
    }catch(err){
      if(err.status===401)state.storage.connectors[p]=null;
      else state.storage.connectors[p]={...c,error:err.message};
      refreshDerivedStorage();await persistWorkspace(false,{skipCloud:true});
      if(renderAfter&&state.view==='storage')render();return null
    }
  }
  async function initialise(){
    ensureStorageShape();setupBridge();await loadConfig().catch(()=>{});
    for(const p of ['google','microsoft'])if(connector(p)?.capability)await refreshConnector(p,{renderAfter:false});
    refreshDerivedStorage();if(state.view==='storage')render()
  }
  function setupBridge(){
    if(bridgeBound||typeof window==='undefined')return;bridgeBound=true;
    window.addEventListener('message',async event=>{
      if(event.origin!==location.origin||event.data?.source!=='eve-cloud-connector')return;
      const d=event.data,p=providerKey(d.provider);if(!p)return;
      if(d.type==='EVE_CONNECTOR_ERROR'){toast(`${providerLabel(p)} connection failed: ${d.message||'OAuth was not completed.'}`,5000,'error');return}
      if(d.type!=='EVE_CONNECTOR_CONNECTED'||!d.capability)return;
      ensureStorageShape();
      state.storage.connectors[p]={capability:d.capability,connection:d.connection||null,error:''};
      if(!state.storage.provider||(!connectorReady('google')&&!connectorReady('microsoft')))state.storage.provider=p==='google'?'Google Drive':'SharePoint';
      await refreshConnector(p,{renderAfter:false});
      refreshDerivedStorage();await persistWorkspace(false,{skipCloud:true});
      if(p==='google'&&connectorReady(p)){toast('Google Drive connected',2600,'success');syncProvider(p,{manual:true}).catch(()=>{})}
      else if(p==='microsoft'){toast('Microsoft account connected · choose a SharePoint library',3600,'success')}
      if(state.view==='storage')render()
    })
  }
  async function connect(key){
    const p=providerKey(key);const cfg=await loadConfig(true);
    if(cfg.serviceUnavailable||cfg.error&&!cfg[p])return miniNotice('Cloud connector service unavailable',connectorServiceHelp(cfg.error));
    if(!cfg[p]?.configured)return miniNotice(`${providerLabel(p)} needs one-time setup`,`This Eve deployment has not been given its ${p==='google'?'Google OAuth':'Microsoft Entra OAuth'} client ID and secret yet. Configure them in Eve’s deployment environment and restart Eve. Callback URL: ${cfg[p]?.redirectUri||'unavailable until the Eve service is running'}.`);
    const win=window.open(`/api/connectors/${p}/start`,`eve-${p}-connector`,'popup=yes,width=650,height=760,noopener=no');
    if(!win)toast('Your browser blocked the sign-in window. Allow pop-ups for Eve and try again.',5000,'error')
  }
  async function testConnector(key){
    const p=providerKey(key),c=connector(p);if(!c?.capability)return;
    try{
      const d=await api('/api/connectors/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({capability:c.capability})},30000);
      state.storage.connectors[p]={...c,connection:d.connection,error:''};refreshDerivedStorage();
      await persistWorkspace(false,{skipCloud:true});render();toast(`${providerLabel(p)} connection is working`,2600,'success')
    }catch(err){toast(`${providerLabel(p)} test failed: ${err.message}`,5000,'error')}
  }
  async function disconnect(key){
    const p=providerKey(key),c=connector(p);if(!c?.capability)return;
    if(!await miniConfirm(`Disconnect ${providerLabel(p)}?`,'Eve will stop syncing from this browser. Existing encrypted files in customer storage are not deleted.','Disconnect'))return;
    try{await api('/api/connectors/disconnect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({capability:c.capability})})}catch(err){console.warn('Connector disconnect failed',err)}
    state.storage.connectors[p]=null;recoverySession=null;refreshDerivedStorage();await persistWorkspace(false,{skipCloud:true});render();toast(`${providerLabel(p)} disconnected`)
  }
  async function discoverSharePoint(){
    const c=connector('microsoft'),siteUrl=String(document.getElementById('sharepoint-site-url')?.value||'').trim();
    if(!c?.capability)return; if(!siteUrl)return toast('Enter the approved SharePoint site URL first.',3600,'error');
    try{
      const d=await api('/api/connectors/microsoft/site',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({capability:c.capability,siteUrl})},30000);
      microsoftDiscovery={site:d.site,drives:d.drives||[],siteUrl};render();
      if(!microsoftDiscovery.drives.length)toast('No document libraries were returned for that SharePoint site.',4500,'error')
    }catch(err){toast(`SharePoint site could not be opened: ${err.message}`,5000,'error')}
  }
  async function selectSharePointLocation(){
    const c=connector('microsoft'),driveId=String(document.getElementById('sharepoint-drive-select')?.value||'');
    if(!c?.capability||!microsoftDiscovery?.site||!driveId)return;
    const drive=microsoftDiscovery.drives.find(x=>x.id===driveId);if(!drive)return;
    try{
      const d=await api('/api/connectors/microsoft/location',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({capability:c.capability,siteId:microsoftDiscovery.site.id,siteUrl:microsoftDiscovery.site.webUrl||microsoftDiscovery.siteUrl,driveId,driveName:drive.name})},30000);
      state.storage.connectors.microsoft={...c,connection:d.connection,error:''};microsoftDiscovery=null;refreshDerivedStorage();
      await persistWorkspace(false,{skipCloud:true});render();toast('SharePoint research location connected',2800,'success');syncProvider('microsoft',{manual:true}).catch(()=>{})
    }catch(err){toast(`SharePoint location could not be selected: ${err.message}`,5000,'error')}
  }
  async function setDefaultProvider(value){
    const p=providerKey(value)||'microsoft';state.storage.provider=p==='google'?'Google Drive':'SharePoint';refreshDerivedStorage();
    await persistWorkspace(false,{skipCloud:true});render();
    if(connectorReady(p))schedule(p)
  }

  function cap(key){const c=connector(key);if(!c?.capability)throw new Error(`${providerLabel(providerKey(key))} is not connected.`);return c.capability}
  async function cloudWrite(key,path,content){
    const capability=cap(key);
    return api('/api/connectors/files',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({capability,path,content:String(content)})},120000)
  }
  async function cloudRead(key,path,{optional=false}={}){
    const capability=cap(key);
    try{return await api(`/api/connectors/files?cap=${encodeURIComponent(capability)}&path=${encodeURIComponent(path)}`,{},120000)}
    catch(err){if(optional&&err.status===404)return null;throw err}
  }
  async function cloudDelete(key,path){
    const capability=cap(key);
    return api('/api/connectors/files',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({capability,path})},120000)
  }
  async function cloudList(key,prefix=''){
    const capability=cap(key);
    return api(`/api/connectors/files/list?cap=${encodeURIComponent(capability)}&prefix=${encodeURIComponent(prefix)}`,{},120000)
  }

  async function fingerprintRaw(raw){
    if(!raw)return'';const digest=await crypto.subtle.digest('SHA-256',Uint8Array.from(atob(raw),c=>c.charCodeAt(0)));
    return bytesToB64Url(new Uint8Array(digest)).slice(0,18)
  }
  async function importBrowserRaw(raw){
    const bytes=Uint8Array.from(atob(raw),c=>c.charCodeAt(0));
    return crypto.subtle.importKey('raw',bytes,{name:'AES-GCM'},false,['encrypt','decrypt'])
  }
  async function decryptBrowserEnvelope(envelope,raw){
    const key=await importBrowserRaw(raw),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(envelope.iv)},key,new Uint8Array(envelope.data));
    return JSON.parse(decoder.decode(plain))
  }
  function clone(value){return JSON.parse(JSON.stringify(value))}
  function studiesForProvider(key){const p=providerKey(key);return (state.studies||[]).filter(s=>providerForStudy(s)===p)}
  function responseIdsForStudySet(ids){return (state.responses||[]).filter(r=>ids.has(r.studyId))}
  function latestActivity(studies,responses){
    return Math.max(0,...studies.map(s=>Number(s.updatedAt||s.archivedAt||s.createdAt)||0),...responses.map(r=>Number(r.serverReceivedAt||r.submittedAt)||0))
  }
  async function summaryDigest(studies,responses){
    const rows=[
      ...studies.map(s=>`s:${s.id}:${Number(s.updatedAt||0)}:${Number(s.archivedAt||0)}:${Number(s.version||0)}`),
      ...responses.map(r=>`r:${r.id}:${Number(r.serverReceivedAt||r.submittedAt||0)}`)
    ].sort().join('\n');
    const d=await crypto.subtle.digest('SHA-256',encoder.encode(rows));return bytesToB64Url(new Uint8Array(d))
  }
  async function localProviderSummary(key){
    const studies=studiesForProvider(key),ids=new Set(studies.map(s=>s.id)),responses=responseIdsForStudySet(ids);
    return{studyCount:studies.length,responseCount:responses.length,latestActivity:latestActivity(studies,responses),digest:await summaryDigest(studies,responses)}
  }
  function cloudSafeWorkspace(key){
    const p=providerKey(key),studies=studiesForProvider(p),ids=new Set(studies.map(s=>s.id)),safe=clone(workspacePayload());
    safe.studies=clone(studies);
    safe.findings=clone((state.findings||[]).filter(f=>ids.has(f.studyId)));
    safe.participantSegments=clone((state.participantSegments||[]).filter(seg=>seg?.rules?.studyId?ids.has(seg.rules.studyId):p===providerKey(state.storage.provider)));
    safe.storage={provider:state.storage.provider,location:state.storage.location,permission:state.storage.permission,lastSync:state.storage.lastSync,connected:false,connectors:{google:null,microsoft:null},cloudSyncState:'idle',cloudSyncError:''};
    safe.activeStudyId=null;safe.activePageId=null;safe.activeBlockId=null;safe.sidebarStudyId=null;
    return safe
  }
  function recordingRefs(value,out=new Map()){
    if(!value||typeof value!=='object')return out;
    if(value.recordingId)out.set(String(value.recordingId),value);
    if(Array.isArray(value)){value.forEach(v=>recordingRefs(v,out));return out}
    Object.values(value).forEach(v=>recordingRefs(v,out));return out
  }
  async function recordingDocFor(study,response,id,meta){
    if(meta?.storage==='local'){
      const raw=await idbGet(RECORDING_PREFIX+id);if(!raw)return null;
      return{format:'eve-cloud-recording',version:1,encryption:'browser-key',studyId:study.id,studyVersion:Number(response.studyVersion)||null,responseId:response.id,recordingId:id,payload:JSON.parse(raw),mimeType:meta.mimeType||'',size:Number(meta.size)||0}
    }
    if(meta?.storage==='relay'&&study.relayPublished&&study.relayAdminToken){
      try{
        const r=await eveFetch(`/api/studies/${encodeURIComponent(study.slug)}/recordings/${encodeURIComponent(id)}`,{cache:'no-store',headers:{'X-ResearchOS-Admin':study.relayAdminToken||''}},120000);
        if(!r.ok)return null;const d=await r.json();
        return{format:'eve-cloud-recording',version:1,encryption:'study-version-key',studyId:study.id,studyVersion:Number(response.studyVersion)||null,responseId:response.id,recordingId:id,envelope:d.envelope,mimeType:meta.mimeType||d.envelope?.mimeType||'',size:Number(meta.size||d.envelope?.size)||0}
      }catch(err){console.warn('Could not copy relay recording to customer storage',id,err);return null}
    }
    return null
  }

  async function syncProvider(key,{manual=false}={}){
    ensureStorageShape();const p=providerKey(key);if(!connectorReady(p))return false;
    if(cloudRunning.get(p))return cloudRunning.get(p);
    const task=(async()=>{
      state.storage.cloudSyncState='syncing';state.storage.cloudSyncError='';if(state.view==='storage')render();
      try{
        const studies=studiesForProvider(p),ids=new Set(studies.map(s=>s.id)),responses=responseIdsForStudySet(ids),responsePaths=[],recordingPaths=[];
        for(const s of studies){
          await cloudWrite(p,`Studies/${s.id}/draft.eve.json`,JSON.stringify({format:'eve-cloud-study',version:2,studyId:s.id,syncedAt:Date.now(),envelope:await encrypt(s)}));
          for(const snap of Object.values(s.publishedVersions||{})){
            const v=Number(snap?.version||0);if(!v)continue;
            await cloudWrite(p,`Studies/${s.id}/versions/v${v}.eve.json`,JSON.stringify({format:'eve-cloud-study-version',version:2,studyId:s.id,studyVersion:v,syncedAt:Date.now(),envelope:await encrypt(snap)}))
          }
        }
        for(const r of responses){
          const path=`Studies/${r.studyId}/responses/${r.id}.eve.json`;responsePaths.push(path);
          await cloudWrite(p,path,JSON.stringify({format:'eve-cloud-response',version:2,studyId:r.studyId,responseId:r.id,syncedAt:Date.now(),envelope:await encrypt(r)}));
          const s=studies.find(x=>x.id===r.studyId),refs=recordingRefs(r.answers||{});
          if(s)for(const [id,meta] of refs){const doc=await recordingDocFor(s,r,id,meta);if(!doc)continue;const rp=`Studies/${r.studyId}/recordings/${id}.eve.json`;recordingPaths.push(rp);await cloudWrite(p,rp,JSON.stringify(doc))}
        }
        const safe=cloudSafeWorkspace(p),summary=await localProviderSummary(p),raw=localKeyRaw(true),doc={format:'eve-cloud-workspace',version:2,provider:p,syncedAt:Date.now(),workspaceRevision:Number(state.workspaceRevision)||0,keyFingerprint:await fingerprintRaw(raw),summary,responsePaths,recordingPaths,envelope:await encrypt({format:'eve-cloud-workspace-payload',version:2,provider:p,workspace:safe,responsePaths,recordingPaths})};
        await cloudWrite(p,'workspace.eve.json',JSON.stringify(doc));
        state.storage.lastSync=Date.now();state.storage.cloudSyncState='synced';state.storage.cloudSyncError='';
        let dirty=false;for(const s of studies){s.cloudSyncedProviders=Array.isArray(s.cloudSyncedProviders)?s.cloudSyncedProviders:[];if(!s.cloudSyncedProviders.includes(p)){s.cloudSyncedProviders.push(p);dirty=true}}
        if(dirty)await persistWorkspace(false,{skipCloud:true});
        if(state.view==='storage')render();if(manual)toast(`${providerLabel(p)} sync complete`,2600,'success');return true
      }catch(err){
        state.storage.cloudSyncState='error';state.storage.cloudSyncError=err.message;console.error(`${providerLabel(p)} cloud sync failed`,err);
        if(state.view==='storage')render();if(manual)toast(`Cloud sync failed: ${err.message}`,5500,'error');return false
      }finally{cloudRunning.delete(p)}
    })();
    cloudRunning.set(p,task);return task
  }
  function schedule(key){
    const p=providerKey(key);if(!p||!connectorReady(p))return;clearTimeout(cloudTimers.get(p));cloudTimers.set(p,setTimeout(()=>syncProvider(p).catch(()=>{}),SYNC_DEBOUNCE_MS))
  }
  function scheduleAll(){for(const p of ['google','microsoft'])if(connectorReady(p)&&studiesForProvider(p).length)schedule(p)}
  function scheduleForStudy(studyId){const s=(state.studies||[]).find(x=>x.id===studyId);if(s)schedule(providerForStudy(s))}

  async function setRecoveryPassphrase(key){
    const p=providerKey(key);if(!connectorReady(p))return;
    const pass=await miniPrompt('Set cloud recovery passphrase','Choose a passphrase for recovering this encrypted Eve workspace in another browser. Eve never uploads the passphrase itself.',{placeholder:'Recovery passphrase',confirmLabel:'Set recovery passphrase',inputType:'password'});
    if(pass===null)return;if(String(pass).length<10)return miniNotice('Use a longer passphrase','Use at least 10 characters for cloud recovery.');
    const raw=localKeyRaw(true),salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),keyObj=await deriveBackupKey(pass,salt),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},keyObj,encoder.encode(raw));
    const doc={format:'eve-cloud-recovery-key',version:1,kdf:'PBKDF2-SHA256',iterations:250000,salt:bytesToB64Url(salt),iv:bytesToB64Url(iv),data:bytesToB64Url(new Uint8Array(cipher)),keyFingerprint:await fingerprintRaw(raw),createdAt:Date.now()};
    await cloudWrite(p,'recovery.eve.json',JSON.stringify(doc));toast('Cloud recovery passphrase saved',2600,'success')
  }
  async function unlockRecoveryKey(key,expectedFingerprint=''){
    const p=providerKey(key),file=await cloudRead(p,'recovery.eve.json',{optional:true});if(!file)return null;
    let doc;try{doc=JSON.parse(file.content)}catch{return null}
    if(doc.format!=='eve-cloud-recovery-key')return null;
    const pass=await miniPrompt('Unlock cloud copy','This cloud copy was encrypted by another browser. Enter its Eve recovery passphrase.',{placeholder:'Recovery passphrase',confirmLabel:'Unlock',inputType:'password'});
    if(pass===null)return null;
    try{
      const k=await deriveBackupKey(pass,b64UrlToBytes(doc.salt)),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64UrlToBytes(doc.iv)},k,b64UrlToBytes(doc.data)),raw=decoder.decode(plain);
      if(expectedFingerprint&&await fingerprintRaw(raw)!==expectedFingerprint)throw new Error('Recovery key does not match this cloud copy.');
      return raw
    }catch(err){await miniNotice('Could not unlock cloud copy','The recovery passphrase is incorrect or the recovery key is damaged.');return null}
  }
  async function decryptCloudWorkspaceDoc(key,doc){
    const current=localKeyRaw(false);
    if(current)try{return{payload:await decryptBrowserEnvelope(doc.envelope,current),rawKey:current,keySource:'current-browser'}}catch{}
    const recovered=await unlockRecoveryKey(key,doc.keyFingerprint||'');if(!recovered)throw Object.assign(new Error('The cloud copy uses a different browser key and could not be unlocked.'),{code:'cloud_key_unavailable'});
    return{payload:await decryptBrowserEnvelope(doc.envelope,recovered),rawKey:recovered,keySource:'recovery-passphrase'}
  }
  function compareCloudLocal(local,cloud){
    if(local.digest&&cloud.digest&&local.digest===cloud.digest)return'aligned';
    const l=Number(local.latestActivity)||0,c=Number(cloud.latestActivity)||0;
    if(!local.studyCount&&!local.responseCount&&(cloud.studyCount||cloud.responseCount))return'cloud-newer';
    if(!cloud.studyCount&&!cloud.responseCount&&(local.studyCount||local.responseCount))return'browser-newer';
    if(c>l)return'cloud-newer';if(l>c)return'browser-newer';return'diverged'
  }
  async function checkCloudCopy(key){
    const p=providerKey(key);if(!connectorReady(p))return;
    try{
      const file=await cloudRead(p,'workspace.eve.json',{optional:true});
      if(!file){recoverySession={provider:p,status:'empty',cloud:null,local:await localProviderSummary(p)};render();return}
      const doc=JSON.parse(file.content);if(doc.format!=='eve-cloud-workspace')throw new Error('The cloud recovery point is not a supported Eve file.');
      const unlocked=await decryptCloudWorkspaceDoc(p,doc),local=await localProviderSummary(p),status=compareCloudLocal(local,doc.summary||{});
      recoverySession={provider:p,status,doc,payload:unlocked.payload,rawKey:unlocked.rawKey,keySource:unlocked.keySource,local,cloud:doc.summary||{},checkedAt:Date.now()};
      render()
    }catch(err){console.error('Cloud recovery inspection failed',err);toast(`Cloud copy could not be checked: ${err.message}`,5500,'error')}
  }
  function responseIdFromPath(path){const m=String(path||'').match(/\/responses\/([^/]+)\.eve\.json$/);return m?m[1]:''}
  async function cloudResponsePaths(session){
    const listed=Array.isArray(session.payload?.responsePaths)?session.payload.responsePaths:[];
    if(listed.length)return listed;
    const out=await cloudList(session.provider,'Studies');return(out.files||[]).map(x=>x.path||x).filter(x=>/\/responses\/[^/]+\.eve\.json$/.test(x))
  }
  async function cloudRecordingPaths(session){
    const listed=Array.isArray(session.payload?.recordingPaths)?session.payload.recordingPaths:[];
    if(listed.length)return listed;
    const out=await cloudList(session.provider,'Studies');return(out.files||[]).map(x=>x.path||x).filter(x=>/\/recordings\/[^/]+\.eve\.json$/.test(x))
  }
  async function readCloudResponses(session){
    const paths=await cloudResponsePaths(session),out=[];
    for(const path of paths){const f=await cloudRead(session.provider,path,{optional:true});if(!f)continue;try{const doc=JSON.parse(f.content),r=await decryptBrowserEnvelope(doc.envelope,session.rawKey);if(r?.id)out.push(r)}catch(err){console.warn('Unreadable cloud response',path,err)}}
    return out
  }
  function mergeById(local,remote,timeField='updatedAt'){
    const map=new Map();for(const row of [...(local||[]),...(remote||[])]){if(!row?.id)continue;const prev=map.get(row.id);if(!prev||Number(row[timeField]||row.serverReceivedAt||row.submittedAt||0)>=Number(prev[timeField]||prev.serverReceivedAt||prev.submittedAt||0))map.set(row.id,clone(row))}
    return[...map.values()]
  }
  function mergeStudies(local,remote){
    const map=new Map();for(const row of [...(local||[]),...(remote||[])]){if(!row?.id)continue;const prev=map.get(row.id);if(!prev||Number(row.updatedAt||0)>=Number(prev.updatedAt||0))map.set(row.id,clone(row))}
    return[...map.values()]
  }
  function markRecordingLocal(value,id){
    if(!value||typeof value!=='object')return;
    if(String(value.recordingId||'')===String(id))value.storage='local';
    if(Array.isArray(value))value.forEach(v=>markRecordingLocal(v,id));else Object.values(value).forEach(v=>markRecordingLocal(v,id))
  }
  async function restoreRecordingDocs(session,responses,studies){
    const paths=await cloudRecordingPaths(session);
    for(const path of paths){
      const f=await cloudRead(session.provider,path,{optional:true});if(!f)continue;
      try{
        const doc=JSON.parse(f.content),id=String(doc.recordingId||'');if(!id)continue;let blob=null;
        if(doc.encryption==='browser-key'){
          const key=await importBrowserRaw(session.rawKey),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64UrlToBytes(doc.payload.iv)},key,b64UrlToBytes(doc.payload.data));blob=new Blob([plain],{type:doc.payload.mimeType||doc.mimeType||'application/octet-stream'})
        }else if(doc.encryption==='study-version-key'){
          const study=studies.find(s=>s.id===doc.studyId),raw=study&&(relayVersionKey(study,doc.studyVersion,false)||study.relayKey);if(raw)blob=await decryptRecordingBlobWithKey(doc.envelope,raw)
        }
        if(blob){await saveLocalRecording(id,blob);for(const r of responses)if(r.id===doc.responseId||r.studyId===doc.studyId)markRecordingLocal(r.answers,id)}
      }catch(err){console.warn('Cloud recording could not be restored',path,err)}
    }
  }
  function scopedIdsForProvider(p){return new Set(studiesForProvider(p).map(s=>s.id))}
  async function replaceScopedLocal(session,{reconcile=false}={}){
    const p=session.provider,cloudWs=session.payload?.workspace||{},cloudStudies=(cloudWs.studies||[]).map(s=>typeof migrateStudy==='function'?migrateStudy(s):s),cloudIds=new Set(cloudStudies.map(s=>s.id)),localIds=scopedIdsForProvider(p),affected=new Set([...localIds,...cloudIds]),cloudResponses=await readCloudResponses(session);
    let studies;
    if(reconcile)studies=mergeStudies((state.studies||[]).filter(s=>affected.has(s.id)),cloudStudies);
    else studies=cloudStudies;
    const untouched=(state.studies||[]).filter(s=>!affected.has(s.id));
    state.studies=[...untouched,...studies];

    const localAffected=(state.responses||[]).filter(r=>affected.has(r.studyId)),nextResponses=reconcile?mergeById(localAffected,cloudResponses,'serverReceivedAt'):cloudResponses;
    for(const r of localAffected)try{await idbDelete(RESPONSE_PREFIX+r.id)}catch{}
    state.responses=(state.responses||[]).filter(r=>!affected.has(r.studyId));
    await restoreRecordingDocs(session,nextResponses,studies);
    for(const r of nextResponses)await saveResponseRecord(r);

    const cloudFindings=cloudWs.findings||[],localFindings=(state.findings||[]).filter(f=>affected.has(f.studyId));
    state.findings=[...(state.findings||[]).filter(f=>!affected.has(f.studyId)),...(reconcile?mergeById(localFindings,cloudFindings,'updatedAt'):cloudFindings)];
    const cloudSegs=cloudWs.participantSegments||[],localSegs=(state.participantSegments||[]).filter(seg=>affected.has(seg?.rules?.studyId));
    const preservedSegs=(state.participantSegments||[]).filter(seg=>!affected.has(seg?.rules?.studyId));
    state.participantSegments=[...preservedSegs,...(reconcile?mergeById(localSegs,cloudSegs,'updatedAt'):cloudSegs)];
    if(p===providerKey(state.storage.provider)&&cloudWs.globalSettings)state.globalSettings={...state.globalSettings,...clone(cloudWs.globalSettings)};
    state.studies=state.studies.map(migrateStudy);await persistWorkspace(false,{force:true,skipCloud:true});recoverySession=null;render()
  }
  async function restoreCloudCopy(){
    if(!recoverySession?.payload)return;if(!await miniConfirm('Restore cloud copy?','Eve will replace the browser copy of studies assigned to this storage provider with the encrypted cloud recovery point. Other provider studies are preserved.','Restore cloud copy'))return;
    await replaceScopedLocal(recoverySession,{reconcile:false});toast('Cloud copy restored',2800,'success')
  }
  async function reconcileCloudCopy(){
    if(!recoverySession?.payload)return;if(!await miniConfirm('Reconcile browser and cloud?','Eve will preserve studies found on either side, choose the newest updated copy of shared studies and union immutable responses and insights.','Reconcile safely'))return;
    const p=recoverySession.provider;await replaceScopedLocal(recoverySession,{reconcile:true});await syncProvider(p,{manual:false});toast('Browser and cloud reconciled',3000,'success')
  }
  async function keepBrowserCopy(){
    if(!recoverySession)return;const p=recoverySession.provider;if(!await miniConfirm('Keep browser copy?','The current browser copy will become the new cloud recovery point for this provider.','Keep browser copy'))return;
    recoverySession=null;await syncProvider(p,{manual:true});render()
  }

  async function deleteStudyData(study){
    const providers=[...new Set((Array.isArray(study?.cloudSyncedProviders)?study.cloudSyncedProviders:[]).map(providerKey).filter(Boolean))];
    if(!providers.length)return true;
    if(providers.some(p=>!connectorReady(p)))return false;
    try{
      for(const p of providers){
        const listed=await cloudList(p,`Studies/${study.id}`).catch(()=>({files:[]}));
        for(const x of (listed.files||[]).slice().sort((a,b)=>String((b.path||b)).length-String((a.path||a)).length)){const path=x.path||x;if(path)await cloudDelete(p,path).catch(()=>{})}
        await cloudDelete(p,`Studies/${study.id}/draft.eve.json`).catch(()=>{});
      }
      return true
    }catch(err){console.warn('Cloud study purge failed',err);return false}
  }

  function connectionCard(key){
    const p=providerKey(key),cfg=connectorConfig[p]||{},c=connector(p),oauth=!!c?.capability,ready=connectorReady(p),selected=providerKey(state.storage.provider)===p,label=providerLabel(p),user=c?.connection?.user?.email||c?.connection?.user?.userPrincipalName||c?.connection?.user?.displayName||'';
    const icon=p==='google'?'G':'S';
    let setup='';
    if(p==='microsoft'&&oauth&&!ready){
      setup=`<div class="connector-location-setup"><div class="field"><label>Approved SharePoint site URL</label><input id="sharepoint-site-url" class="input" type="url" placeholder="https://department.sharepoint.com/sites/research" value="${esc(microsoftDiscovery?.siteUrl||'')}"></div><button class="btn" onclick="EveCloud.discoverSharePoint()">Find document libraries</button>${microsoftDiscovery?`<div class="sharepoint-library-row"><select id="sharepoint-drive-select" class="select"><option value="">Choose a document library</option>${microsoftDiscovery.drives.map(d=>`<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')}</select><button class="btn primary" onclick="EveCloud.selectSharePointLocation()">Use this location</button></div>`:''}</div>`
    }
    return `<article class="card cloud-provider-card ${selected?'selected':''}"><div class="cloud-provider-head"><div class="storage-logo">${icon}</div><div><div class="section-label">${p==='google'?'GOOGLE':'MICROSOFT'}</div><h3>${label}</h3><p>${ready?esc(locationLabel(p)):oauth?'OAuth connected · choose the storage location':cfg.configured?'Ready to connect':'Deployment configuration required'}</p></div><span class="pill ${ready?'live':''}">${ready?'Connected':oauth?'Setup':'Not connected'}</span></div>${user?`<div class="connector-user">${esc(user)}</div>`:''}${setup}<div class="cloud-provider-actions">${!oauth?`<button class="btn primary" onclick="EveCloud.connect('${p}')">${cfg.configured?`Connect ${label}`:`Set up ${label}`}</button>`:`${ready?`<button class="btn" onclick="EveCloud.testConnector('${p}')">Test connection</button>`:''}<button class="btn subtle" onclick="EveCloud.disconnect('${p}')">Disconnect</button>`}<button class="btn ${selected?'primary-soft':''}" onclick="EveCloud.setDefaultProvider('${p}')" ${selected?'disabled':''}>${selected?'Organisation default':'Use as default'}</button></div>${!cfg.configured?`<details class="connector-deploy-help" open><summary>One-time organisation setup</summary><p>${connectorConfig.serviceUnavailable?esc(connectorServiceHelp(connectorConfig.error)):`Configure the OAuth client in Eve's environment. Redirect URI:`}</p>${cfg.redirectUri?`<code>${esc(cfg.redirectUri)}</code>`:''}</details>`:''}</article>`
  }
  function recoveryMarkup(key){
    const p=providerKey(key),ready=connectorReady(p),r=recoverySession?.provider===p?recoverySession:null;
    if(!ready)return'';
    const stateLabel=r?.status==='aligned'?'Browser and cloud match':r?.status==='cloud-newer'?'Cloud has newer research':r?.status==='browser-newer'?'Browser has newer research':r?.status==='diverged'?'Browser and cloud have diverged':r?.status==='empty'?'No cloud recovery point yet':'Cloud copy not checked';
    return `<section class="card cloud-recovery-card"><div class="cloud-recovery-head"><div><div class="section-label">RECOVERY & SYNC</div><h3>${providerLabel(p)} recovery point</h3><p>Research content is encrypted in this browser before it is written to customer storage.</p></div><span class="pill ${r?.status==='aligned'?'live':''}">${esc(stateLabel)}</span></div><div class="cloud-sync-actions"><button class="btn primary" onclick="EveCloud.syncProvider('${p}',{manual:true})">Sync now</button><button class="btn" onclick="EveCloud.checkCloudCopy('${p}')">Check cloud copy</button><button class="btn" onclick="EveCloud.setRecoveryPassphrase('${p}')">Set recovery passphrase</button></div>${r?.cloud?`<div class="cloud-compare-grid"><div><span>Browser</span><b>${r.local.studyCount} studies · ${r.local.responseCount} responses</b><small>${r.local.latestActivity?new Date(r.local.latestActivity).toLocaleString():'No activity'}</small></div><div><span>Cloud</span><b>${r.cloud.studyCount||0} studies · ${r.cloud.responseCount||0} responses</b><small>${r.doc?.syncedAt?`Synced ${new Date(r.doc.syncedAt).toLocaleString()}`:'—'}</small></div></div>${r.status!=='aligned'?`<div class="cloud-recovery-actions"><button class="btn" onclick="EveCloud.restoreCloudCopy()">Restore cloud copy</button><button class="btn primary" onclick="EveCloud.reconcileCloudCopy()">Reconcile safely</button><button class="btn" onclick="EveCloud.keepBrowserCopy()">Keep browser copy</button></div>`:''}`:r?.status==='empty'?'<div class="settings-note">No <code>workspace.eve.json</code> exists yet. Select Sync now to create the first encrypted recovery point.</div>':''}</section>`
  }
  function storagePage(){
    ensureStorageShape();if(!connectorConfig.loaded&&!connectorConfig.loading)setTimeout(()=>loadConfig(),0);
    const raw=localKeyRaw(false)||'',fp=raw?raw.slice(-10).replace(/=/g,''):'not generated',p=providerKey(state.storage.provider)||'microsoft';
    const syncTone=state.storage.cloudSyncState==='error'?'warn':state.storage.cloudSyncState==='synced'?'live':'';
    return shell(`<div class="content cloud-storage-page">${global.EveSetup?.needsOnboarding?.(state.setup)?'<div class="setup-return-banner"><div><b>First-time setup is still in progress.</b><small>Finish the approved storage location, then return to the setup wizard.</small></div><button class="btn primary" onclick="EveSetup.returnToSetup()">Return to setup</button></div>':''}<section class="hero compact"><div><div class="eyebrow">DATA CONTROL</div><h2>Client-owned research storage</h2><div class="muted">Connect Eve directly to approved SharePoint or Google Drive storage. Research payloads are encrypted in the browser before upload.</div></div>${connectorReady(p)?`<span class="pill ${syncTone}">${state.storage.cloudSyncState==='syncing'?'Syncing…':state.storage.cloudSyncState==='error'?'Sync issue':state.storage.lastSync?`Synced ${relativeDate(state.storage.lastSync)}`:'Connected'}</span>`:''}</section>${connectorConfig.error?`<div class="card settings-note warning"><b>Cloud connection setup needs attention.</b><br>${esc(connectorServiceHelp(connectorConfig.error))}</div>`:''}<div class="cloud-provider-grid">${connectionCard('microsoft')}${connectionCard('google')}</div>${recoveryMarkup(p)}<div class="security-grid cloud-security-grid"><div class="card"><div class="eyebrow">LOCAL ENCRYPTION</div><h3>AES-GCM browser key</h3><p class="muted">Local key fingerprint: <code>${esc(fp)}</code></p><div class="boundary-list"><div><span>Plaintext study content on connector server</span><b>No</b></div><div><span>OAuth refresh tokens in browser storage</span><b>No</b></div><div><span>Browser decrypts research</span><b>Yes</b></div></div></div><div class="card"><div class="eyebrow">CLOUD LAYOUT</div><h3>Eve folder only</h3><p class="muted">${p==='google'?'Google uses the constrained drive.file scope.':'SharePoint writes beneath the document library you explicitly select.'}</p><div class="boundary-list"><div><span>Workspace recovery point</span><b>workspace.eve.json</b></div><div><span>Study versions</span><b>Individual encrypted files</b></div><div><span>Responses / recordings</span><b>Independent encrypted files</b></div></div></div></div>${state.storage.cloudSyncError?`<div class="card settings-note warning"><b>Last cloud sync failed.</b> ${esc(state.storage.cloudSyncError)}</div>`:''}<div class="toolbar storage-backup-toolbar"><button class="btn" onclick="downloadEncryptedBackup()">Download portable backup</button><label class="btn">Restore portable backup<input type="file" accept="application/json" hidden onchange="restorePortableBackup(this.files[0])"></label></div></div>`,'Storage')
  }

  const apiSurface={initialise,connect,testConnector,disconnect,discoverSharePoint,selectSharePointLocation,setDefaultProvider,resolvedStudyStorage,schedule,scheduleAll,scheduleForStudy,syncProvider,checkCloudCopy,setRecoveryPassphrase,restoreCloudCopy,reconcileCloudCopy,keepBrowserCopy,deleteStudyData,storagePage,refreshConnector,providerForStudy,connectorReady,mergeStudies,mergeById,compareCloudLocal};
  global.EveCloud=apiSurface;
  if(typeof window!=='undefined'){
    setupBridge();
    window.addEventListener('load',()=>initialise().catch(err=>console.warn('Cloud connector initialisation failed',err)),{once:true});
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={providerKey,mergeStudies,mergeById,compareCloudLocal};
})(typeof globalThis!=='undefined'?globalThis:this);
