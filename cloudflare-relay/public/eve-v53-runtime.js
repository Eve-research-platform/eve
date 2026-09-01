/* Eve v53 stability runtime.
   Cumulative: identity/RBAC + Entra SSO + real AI + granular collaboration + M365 recruitment email. */
(function () {
  'use strict';

  const aiCache = new Map();
  const collab = {
    clientId: sessionStorage.getItem('eve-v53-client-id') || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
    studyId: null,
    presence: [],
    leases: [],
    revisions: new Map(),
    owned: new Map(),
    leasePromises: new Map(),
    pendingResource: null,
    timer: null,
  };
  sessionStorage.setItem('eve-v53-client-id', collab.clientId);

  let authState = null, teamModal = null, recruitmentModal = null, mailStatus = null;
  const htmlEsc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isParticipantRoute = () => /^#\/s\//.test(location.hash || '');
  const activeView = () => {
    try { return String(state?.view || 'view'); } catch { return 'view'; }
  };
  const activeStudy = () => {
    try { return typeof currentStudy === 'function' ? currentStudy() : null; } catch { return null; }
  };
  const canEditView = () => ['builder','settings'].includes(activeView());

  async function api(url, options = {}) {
    const controller=new AbortController(),external=options.signal;
    let timedOut=false;
    const relayAbort=()=>controller.abort(external?.reason);
    if(external){if(external.aborted)relayAbort();else external.addEventListener('abort',relayAbort,{once:true})}
    const timer=setTimeout(()=>{timedOut=true;controller.abort()},15000);
    try{
      const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,signal:controller.signal});
      const data=await r.json().catch(() => ({}));
      if(!r.ok)throw Object.assign(new Error(data.message||data.error||`HTTP ${r.status}`),{status:r.status,data});
      return data;
    }catch(err){
      if(timedOut)throw Object.assign(new Error('Eve could not reach the server. Check your connection and try again.'),{status:0,code:'request_timeout'});
      throw err;
    }finally{
      clearTimeout(timer);external?.removeEventListener?.('abort',relayAbort)
    }
  }
  async function withBusy(button,label,work){
    if(!button||button.dataset.busy==='true')return;
    const previous=button.textContent;button.dataset.busy='true';button.disabled=true;button.textContent=label;
    try{return await work()}finally{button.dataset.busy='false';button.disabled=false;button.textContent=previous}
  }
  function wireOverlay(modal,close){
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const card=modal?.querySelector?.('.eve-v53-card');
    const focusable=()=>[...(card?.querySelectorAll?.('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')||[])];
    const key=e=>{
      if(e.key==='Escape'){e.preventDefault();close();return}
      if(e.key==='Tab'){
        const items=focusable();if(!items.length)return;
        const first=items[0],last=items[items.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
      }
    };
    modal.addEventListener('keydown',key);
    modal.addEventListener('mousedown',e=>{if(e.target===modal)close()});
    requestAnimationFrame(()=>focusable()[0]?.focus());
    return ()=>{modal.removeEventListener('keydown',key);previous?.focus?.()}
  }
  function styleOnce() {
    if (document.getElementById('eve-v53-style')) return;
    const s=document.createElement('style');s.id='eve-v53-style';
    s.textContent=`
      .eve-v53-gate{position:fixed;inset:0;z-index:2147483000;background:#f5f7fb;display:grid;place-items:center;padding:24px;font-family:inherit}
      .eve-v53-card{box-sizing:border-box;width:min(460px,100%);background:white;border:1px solid #c9d3e1;border-radius:12px;padding:28px}
      .eve-v53-card.wide{width:min(760px,100%)}.eve-v53-card h1,.eve-v53-card h2{margin:0 0 8px}.eve-v53-card p{color:#516070}
      .eve-v53-card label{display:block;font-weight:700;margin:14px 0 6px}.eve-v53-card input,.eve-v53-card select,.eve-v53-card textarea{box-sizing:border-box;width:100%;padding:11px;border:2px solid #7b8794;border-radius:6px;font:inherit}
      .eve-v53-card textarea{min-height:110px;resize:vertical}.eve-v53-card button{margin-top:18px;padding:11px;border:0;border-radius:6px;background:#3157d5;color:#fff;font:inherit;font-weight:700;cursor:pointer}
      .eve-v53-ms{width:100%;background:#fff!important;color:#1f2937!important;border:1px solid #aab5c4!important}.eve-v53-divider{display:flex;align-items:center;gap:10px;margin:14px 0;color:#718096}.eve-v53-divider:before,.eve-v53-divider:after{content:'';height:1px;background:#d7dee8;flex:1}.eve-v53-error{color:#b42318;min-height:1.4em;margin-top:10px}.eve-v53-account{position:fixed;right:16px;bottom:16px;z-index:9000;border:1px solid #bcc8d8;background:#fff;border-radius:999px;padding:8px 12px;font:inherit;cursor:pointer}
      .eve-v53-collab{position:fixed;right:16px;bottom:58px;z-index:8999;border:1px solid #bcc8d8;background:#fff;border-radius:999px;padding:7px 11px;font:inherit;font-size:12px;box-shadow:0 3px 14px rgba(15,23,42,.08)}
      .eve-v53-collab.locked{border-color:#f0b429;background:#fff9e8}.eve-v53-modal{position:fixed;inset:0;z-index:2147482000;background:rgba(15,23,42,.42);display:grid;place-items:center;padding:20px}
      .eve-v53-modal>.eve-v53-card{max-height:84vh;overflow:auto}.eve-v53-member{display:grid;grid-template-columns:1fr 150px 44px;gap:10px;align-items:center;border-top:1px solid #e1e6ee;padding:12px 0}
      .eve-v53-member.viewer{grid-template-columns:1fr 150px}.eve-v53-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.eve-v53-note{padding:10px 12px;background:#f5f7fb;border-radius:8px;font-size:.92em;color:#516070}
      .eve-v53-recruit{margin-top:16px}.eve-v53-recruit-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.eve-v53-recruit-actions button{margin:0}
      .eve-v53-ai-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.eve-v53-ai-actions .btn{margin:0}.eve-v53-ai-status{font-size:.9em;color:#5f6b7a}
      @media(max-width:620px){.eve-v53-grid{grid-template-columns:1fr}.eve-v53-member{grid-template-columns:1fr 110px 40px}}
    `;
    document.head.appendChild(s);
  }
  function gateMarkup(localConfigured, sso) {
    const microsoft = sso?.configured ? `<button type="button" id="eve-v53-microsoft" class="eve-v53-ms">Continue with Microsoft</button>` : '';
    const local = localConfigured ? `<div class="eve-v53-divider"><span>or</span></div>
      <label>Email</label><input id="eve-v53-email" type="email" autocomplete="username" required>
      <label>Password</label><input id="eve-v53-password" type="password" autocomplete="current-password" required>
      <button type="submit">Sign in with Eve</button>` : '';
    const setup = !localConfigured && !sso?.configured
      ? `<p><b>Deployment setup:</b> configure Microsoft Entra sign-in, or set <code>EVE_BOOTSTRAP_EMAIL</code> and <code>EVE_BOOTSTRAP_PASSWORD</code>.</p>`
      : '';
    return `<div class="eve-v53-gate" id="eve-v53-gate"><form class="eve-v53-card" id="eve-v53-login">
      <div class="eyebrow">EVE WORKSPACE</div><h1>Sign in</h1>
      <p>Use your organisation account to access this Eve workspace.</p>
      ${microsoft}${local}${setup}
      <div class="eve-v53-error" id="eve-v53-login-error"></div></form></div>`;
  }
  function removeGate(){document.getElementById('eve-v53-gate')?.remove()}
  async function ensureAuth() {
    if(isParticipantRoute())return;
    styleOnce();
    try{authState=await api('/api/auth/me');removeGate();injectAccountButton();startCollaboration()}
    catch{
      if(document.getElementById('eve-v53-gate'))return;
      const [cfg,sso]=await Promise.all([
        api('/api/auth/config').catch(()=>({configured:false})),
        api('/api/auth/microsoft/status').catch(()=>({configured:false}))
      ]);
      if(!cfg.configured&&!sso?.configured){
        authState={local:true,user:{id:'local',name:'Local researcher',email:'',hasPassword:false,providers:[]},organisation:{id:'local',name:'Local workspace'},membership:{role:'admin'}};
        removeGate();
        return;
      }
      document.body.insertAdjacentHTML('beforeend',gateMarkup(!!cfg.configured,sso));
      const form=document.getElementById('eve-v53-login');
      const ms=document.getElementById('eve-v53-microsoft');
      if(ms)ms.onclick=()=>{
        const next=location.pathname+location.search+location.hash;
        location.assign(`/api/auth/microsoft/start?next=${encodeURIComponent(next)}`);
      };
      if(cfg.configured&&form)form.addEventListener('submit',async ev=>{
        ev.preventDefault();const err=document.getElementById('eve-v53-login-error');err.textContent='';
        try{
          authState=await api('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
            email:document.getElementById('eve-v53-email').value,password:document.getElementById('eve-v53-password').value
          })});
          removeGate();injectAccountButton();startCollaboration()
        }catch(x){err.textContent=x.status===401?'Email or password is incorrect.':x.message}
      });
    }
  }
  function injectAccountButton(){
    if(isParticipantRoute()||document.getElementById('eve-v53-account'))return;
    const b=document.createElement('button');b.id='eve-v53-account';b.className='eve-v53-account';
    b.textContent=authState?.user?.name||authState?.user?.email||'Team';b.onclick=openTeam;document.body.appendChild(b)
  }

  async function openTeam(){
    styleOnce();
    try{
      const data=await api('/api/org/members'),admin=authState?.membership?.role==='admin';
      teamModal?.remove();teamModal=document.createElement('div');teamModal.className='eve-v53-modal';
      teamModal.innerHTML=`<div class="eve-v53-card wide"><button style="float:right;width:auto;margin:0;background:transparent;color:#223;padding:6px 10px" id="eve-v53-close">×</button>
      <div class="eyebrow">ORGANISATION</div><h2>${htmlEsc(data.organisation?.name||'Team')}</h2>
      <p>Signed in as ${htmlEsc(authState?.user?.email)} · ${htmlEsc(authState?.membership?.role)}</p>
      <div class="eve-v53-note">Microsoft 365 email: <b>${data.mail?.configured?'ready':'not configured'}</b>${data.mail?.sender?` · ${htmlEsc(data.mail.sender)}`:''}</div>
      <div>${data.members.map(m=>`<div class="eve-v53-member ${admin?'':'viewer'}"><div><b>${htmlEsc(m.user?.name||m.user?.email)}</b><br><small>${htmlEsc(m.user?.email)}</small></div>
      ${admin?`<select data-mid="${htmlEsc(m.id)}"><option ${m.role==='viewer'?'selected':''}>viewer</option><option ${m.role==='researcher'?'selected':''}>researcher</option><option ${m.role==='admin'?'selected':''}>admin</option></select><button data-remove="${htmlEsc(m.id)}" title="Remove member" style="margin:0;background:#fff;color:#b42318;border:1px solid #b42318">×</button>`:`<b>${htmlEsc(m.role)}</b>`}</div>`).join('')}</div>
      ${admin?`<hr><h3>Invite team member</h3><div class="eve-v53-grid"><div><label>Email</label><input id="eve-v53-invite-email" type="email"></div><div><label>Role</label><select id="eve-v53-invite-role"><option>researcher</option><option>viewer</option><option>admin</option></select></div></div><button id="eve-v53-invite">Send invitation</button><div id="eve-v53-invite-result"></div>`:''}
      <hr><h3>Your account</h3><label>Name</label><input id="eve-v53-profile-name" value="${htmlEsc(authState?.user?.name||'')}"><button id="eve-v53-profile">Save name</button>
      ${authState?.user?.hasPassword?`<button id="eve-v53-password" style="background:#fff;color:#3157d5;border:1px solid #3157d5;margin-left:8px">Change password</button>`:''}
      <button id="eve-v53-logout" style="background:#fff;color:#b42318;border:1px solid #b42318;margin-left:8px">Sign out</button></div>`;
      document.body.appendChild(teamModal);
      let unwireTeam=()=>{};
      const closeTeam=()=>{unwireTeam();teamModal?.remove();teamModal=null};
      unwireTeam=wireOverlay(teamModal,closeTeam);
      teamModal.querySelector('#eve-v53-close').onclick=closeTeam;
      teamModal.querySelector('#eve-v53-logout').onclick=async()=>{await releaseLease();await api('/api/auth/logout',{method:'POST'});location.reload()};
      teamModal.querySelector('#eve-v53-profile').onclick=async()=>{
        const out=await api('/api/auth/profile',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:teamModal.querySelector('#eve-v53-profile-name').value})});
        authState.user=out.user;document.getElementById('eve-v53-account').textContent=out.user.name||out.user.email
      };
      const passwordBtn=teamModal.querySelector('#eve-v53-password');if(passwordBtn)passwordBtn.onclick=changePassword;
      teamModal.querySelectorAll('select[data-mid]').forEach(sel=>sel.onchange=async()=>{await api(`/api/org/members/${encodeURIComponent(sel.dataset.mid)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:sel.value})})});
      teamModal.querySelectorAll('button[data-remove]').forEach(btn=>btn.onclick=async()=>{
        const ok=typeof miniConfirm==='function'
          ? await miniConfirm('Remove team member?','They will lose access to this organisation and their active sessions here will be revoked.','Remove member')
          : false;
        if(!ok)return;
        try{await api(`/api/org/members/${encodeURIComponent(btn.dataset.remove)}`,{method:'DELETE'});openTeam()}
        catch(e){if(typeof miniNotice==='function')await miniNotice('Could not remove member',e.message);else if(typeof toast==='function')toast(e.message,4200,'error')}
      });
      const invite=teamModal.querySelector('#eve-v53-invite');
      if(invite)invite.onclick=()=>withBusy(invite,'Sending…',async()=>{
        const result=teamModal.querySelector('#eve-v53-invite-result');result.textContent='';
        try{
          const out=await api('/api/org/invitations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
            email:teamModal.querySelector('#eve-v53-invite-email').value,role:teamModal.querySelector('#eve-v53-invite-role').value,sendEmail:true
          })});
          if(out.delivery?.ok)result.innerHTML='<p><b>Invitation sent.</b></p>';
          else result.innerHTML=`<p><b>Email was not sent.</b> Copy this secure invitation link instead:</p><input value="${htmlEsc(out.inviteUrl||'')}" readonly onclick="this.select()">`;
        }catch(e){result.textContent=e.message}
      });
    }catch(e){console.error(e)}
  }
  window.openEveTeamSettings=async function(){
    if(!authState||authState.local){
      if(typeof miniNotice==='function')return miniNotice('Team roles are not enabled','This Eve workspace is running in local single-user mode. Configure Microsoft Entra or Eve accounts to enable role management.');
      return;
    }
    return openTeam()
  };

  async function changePassword(){
    if(typeof miniPrompt!=='function')return;
    const current=await miniPrompt('Change password','Enter your current password.',{multiline:false,inputType:'password',confirmLabel:'Continue'});if(!current)return;
    const next=await miniPrompt('Choose a new password','Use at least 10 characters.',{multiline:false,inputType:'password',confirmLabel:'Change password'});if(!next)return;
    try{
      await api('/api/auth/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:current,newPassword:next})});
      if(typeof miniNotice==='function')await miniNotice('Password changed','Your other Eve sessions have been signed out.')
    }catch(e){if(typeof miniNotice==='function')await miniNotice('Could not change password',e.message);else if(typeof toast==='function')toast(e.message,4200,'error')}
  }

  // ----- Granular collaboration metadata -----
  function resource(id,parentResourceId=null,label=''){
    return {resourceId:id,parentResourceId,label:label||id};
  }
  function blockResource(blockId){
    const s=activeStudy(),b=s?.blocks?.find(x=>x.id===blockId);
    return b?resource(`block:${b.id}`,`page:${b.pageId}`,b.title||'Study section'):resource('study:structure',null,'Study structure');
  }
  function pageResource(pageId){
    const s=activeStudy(),p=s?.pages?.find(x=>x.id===pageId);
    return resource(`page:${pageId}`,'study:structure',p?.title||p?.name||'Study page');
  }
  function currentResource(){
    const s=activeStudy();if(!s)return resource('review',null,'Workspace');
    if(activeView()==='builder'){
      if(state?.activeBlockId)return blockResource(state.activeBlockId);
      if(state?.activePageId)return pageResource(state.activePageId);
      return resource('study:meta',null,'Study details');
    }
    if(activeView()==='settings')return resource('settings',null,'Study settings');
    if(activeView()==='send')return resource('send',null,'Send');
    return resource('review',null,'Review');
  }
  function revisionFor(r){return Number(collab.revisions.get(r.resourceId)?.revision||0)}
  function ownLease(r){
    const row=collab.owned.get(r.resourceId);
    return row&&row.clientId===collab.clientId&&Number(row.expiresAt)>Date.now()+3000?row:null
  }
  function otherLeaseFor(r){
    return (collab.leases||[]).find(x=>{
      if(x.clientId===collab.clientId)return false;
      if(x.resourceId===r.resourceId)return true;
      if(x.resourceId==='study:structure'&&(/^(page:|block:|study:meta$)/.test(r.resourceId)))return true;
      if(r.resourceId==='study:structure'&&(/^(page:|block:|study:meta$)/.test(x.resourceId)))return true;
      if(x.resourceId.startsWith('page:')&&r.parentResourceId===x.resourceId)return true;
      if(r.resourceId.startsWith('page:')&&x.parentResourceId===r.resourceId)return true;
      return false
    })||null
  }
  function collabBadge(){
    styleOnce();let el=document.getElementById('eve-v53-collab'),s=activeStudy();
    if(!s||isParticipantRoute()){el?.remove();return}
    if(!el){el=document.createElement('div');el.id='eve-v53-collab';el.className='eve-v53-collab';document.body.appendChild(el)}
    const r=currentResource(),other=otherLeaseFor(r),others=(collab.presence||[]).filter(p=>p.clientId!==collab.clientId);
    el.classList.toggle('locked',!!other);
    if(other)el.textContent=`🔒 ${other.user?.name||'A teammate'} editing ${other.resourceId.startsWith('block:')?'this section':'this area'}`;
    else if(others.length)el.textContent=`● ${others.length+1} people here · ${r.label}`;
    else if(ownLease(r))el.textContent=`● Editing ${r.label}`;
    else el.textContent=`● Just you · ${r.label}`;
  }
  function applySnapshot(out){
    if(!out)return;
    collab.presence=out.presence||collab.presence;
    collab.leases=out.leases||collab.leases;
    for(const r of out.revisions||[])collab.revisions.set(r.resourceId,r);
    collab.owned.clear();
    for(const l of collab.leases||[])if(l.clientId===collab.clientId)collab.owned.set(l.resourceId,l);
    collabBadge()
  }
  async function ensureResourceLease(r,quiet=false){
    if(authState?.local)return true;
    if(!r||authState?.membership?.role==='viewer'||!['builder','settings','send'].includes(activeView()))return true;
    const held=ownLease(r);
    if(held&&Number(held.expiresAt)>Date.now()+12000){
      try{
        const out=await api(`/api/collaboration-v2/${encodeURIComponent(activeStudy().id)}/resources/${encodeURIComponent(r.resourceId)}/lease`,{
          method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId:collab.clientId})
        });
        collab.owned.set(r.resourceId,out.lease);return true
      }catch{}
    }
    if(collab.leasePromises.has(r.resourceId))return collab.leasePromises.get(r.resourceId);
    const promise=(async()=>{
      try{
        const out=await api(`/api/collaboration-v2/${encodeURIComponent(activeStudy().id)}/resources/${encodeURIComponent(r.resourceId)}/lease`,{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({clientId:collab.clientId,parentResourceId:r.parentResourceId})
        });
        applySnapshot(out);collab.pendingResource=r;return true
      }catch(e){
        if(e.status===409){
          applySnapshot({leases:e.data?.conflicts||collab.leases});
          if(!quiet&&typeof toast==='function'){
            const who=e.data?.conflicts?.[0]?.user?.name||'Another researcher';
            toast(`${who} is editing this part of the study. Your change was not applied.`,5000,'error')
          }
        }
        return false
      }finally{collab.leasePromises.delete(r.resourceId)}
    })();
    collab.leasePromises.set(r.resourceId,promise);return promise
  }
  async function releaseResourceLease(r){
    if(authState?.local)return;
    const s=activeStudy();if(!s||!r||!collab.owned.has(r.resourceId))return;
    try{
      await api(`/api/collaboration-v2/${encodeURIComponent(s.id)}/resources/${encodeURIComponent(r.resourceId)}/lease`,{
        method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId:collab.clientId})
      })
    }catch{}
    collab.owned.delete(r.resourceId);collabBadge()
  }
  async function releaseLease(){
    if(authState?.local)return;
    const owned=[...collab.owned.keys()].map(id=>resource(id));
    for(const r of owned)await releaseResourceLease(r)
  }
  async function heartbeat(){
    if(!authState||authState?.local||isParticipantRoute())return;
    const s=activeStudy();if(!s){collab.studyId=null;collabBadge();return}
    collab.studyId=s.id;const r=currentResource();
    try{
      const out=await api(`/api/collaboration-v2/${encodeURIComponent(s.id)}/presence`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({clientId:collab.clientId,view:activeView(),resourceId:r.resourceId,parentResourceId:r.parentResourceId})
      });
      applySnapshot(out);
      if(['builder','settings','send'].includes(activeView()))await ensureResourceLease(r,true)
    }catch(e){console.warn('Eve collaboration heartbeat failed',e)}
  }
  function startCollaboration(){
    clearInterval(collab.timer);
    if(document.visibilityState!=='hidden')heartbeat();
    collab.timer=setInterval(()=>{if(document.visibilityState!=='hidden')heartbeat()},15000)
  }
  async function bumpResourceRevision(r){
    if(authState?.local)return;
    const s=activeStudy();if(!s||!r||authState?.membership?.role==='viewer')return;
    try{
      const out=await api(`/api/collaboration-v2/${encodeURIComponent(s.id)}/resources/${encodeURIComponent(r.resourceId)}/revision`,{
        method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({expectedRevision:revisionFor(r),parentResourceId:r.parentResourceId})
      });
      collab.revisions.set(r.resourceId,out.revision)
    }catch(e){
      if(e.status===409){
        if(e.data?.revision)collab.revisions.set(r.resourceId,e.data.revision);
        try{state.externalWorkspaceChange=true;state.saveState=`Team conflict in ${r.label} ⚠`;renderSaveState()}catch{}
        if(typeof toast==='function')toast(`A newer team edit exists for ${r.label}. Check the cloud copy before overwriting it.`,6000,'error')
      }
    }
  }
  function guarded(name,resolver){
    const original=window[name];if(typeof original!=='function')return;
    window[name]=function(...args){
      if(authState?.local)return original.apply(this,args);
      const r=resolver(...args);
      if(authState?.membership?.role==='viewer'){
        if(typeof toast==='function')toast('Viewers cannot edit studies.',3000,'error');return false
      }
      collab.pendingResource=r;
      const held=ownLease(r);
      if(held)return original.apply(this,args);
      const self=this;
      ensureResourceLease(r).then(ok=>{if(ok)original.apply(self,args)});
      return false
    }
  }
  const rBlock=(id)=>blockResource(id);
  guarded('updateBlock',rBlock);guarded('updateOption',rBlock);guarded('addOption',rBlock);guarded('removeOption',rBlock);guarded('bulkOptions',rBlock);
  guarded('updatePage',(id)=>pageResource(id));
  guarded('updateStudy',()=>resource('study:meta',null,'Study details'));
  for(const name of ['movePageBy','duplicatePage','removePage','moveBlockToPage','dropBlock','dropPage','addPage','newPage','duplicateBlock','removeBlock']){
    guarded(name,()=>resource('study:structure',null,'Study structure'))
  }
  const originalSelectBlock=window.selectBlock;
  if(typeof originalSelectBlock==='function')window.selectBlock=function(id,...rest){
    const out=originalSelectBlock.call(this,id,...rest);setTimeout(()=>ensureResourceLease(blockResource(id),true),0);return out
  };
  const originalSelectPage=window.selectPage;
  if(typeof originalSelectPage==='function')window.selectPage=function(id,...rest){
    const out=originalSelectPage.call(this,id,...rest);setTimeout(()=>ensureResourceLease(pageResource(id),true),0);return out
  };
  document.addEventListener('focusin',ev=>{
    if(!authState||activeView()!=='builder')return;
    const block=ev.target?.closest?.('[data-block]');
    if(block?.dataset?.block)ensureResourceLease(blockResource(block.dataset.block),true);
    else if(ev.target?.classList?.contains('study-title'))ensureResourceLease(resource('study:meta',null,'Study details'),true)
  },true);

  const originalPersist=typeof persistWorkspace==='function'?persistWorkspace:null;
  if(originalPersist){
    window.persistWorkspace=async function(...args){
      if(authState?.local)return originalPersist(...args);
      const r=collab.pendingResource||currentResource();
      if(['builder','settings','send'].includes(activeView())){
        const ok=await ensureResourceLease(r);
        if(!ok){
          try{state.saveState='Editing locked ⚠';renderSaveState()}catch{}
          if(args[0]===true)throw Object.assign(new Error('A teammate currently owns this part of the study.'),{code:'EDIT_LOCKED'});
          return false
        }
      }
      const result=await originalPersist(...args);
      if(result)await bumpResourceRevision(r);
      collab.pendingResource=null;
      return result
    }
  }

  // ----- Recruitment email -----
  async function getMailStatus(force=false){
    if(mailStatus&&!force)return mailStatus;
    try{mailStatus=await api('/api/recruitment/status')}catch{mailStatus={configured:false,templates:{}}}
    return mailStatus
  }
  function parseEmails(raw){
    return [...new Set(String(raw||'').split(/[\s,;]+/).map(x=>x.trim().toLowerCase()).filter(x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)))];
  }
  window.openEveRecruitment=async function(studyId){
    styleOnce();const s=(typeof state!=='undefined'?state.studies:[]).find(x=>x.id===studyId);if(!s)return;
    const status=await getMailStatus(true);
    recruitmentModal?.remove();recruitmentModal=document.createElement('div');recruitmentModal.className='eve-v53-modal';
    const savedSegments=(()=>{try{return (state.participantSegments||[]).filter(x=>!x.archived)}catch{return[]}})();
    recruitmentModal.innerHTML=`<div class="eve-v53-card wide"><button style="float:right;width:auto;margin:0;background:transparent;color:#223;padding:6px 10px" id="eve-v53-recruit-close">×</button>
      <div class="eyebrow">EMAIL INVITATIONS</div><h2>Invite participants</h2>
      <p>Eve sends one message per recipient so participants never see anyone else's address. Recipient addresses are processed for delivery and are not stored by Eve's control plane.</p>
      <div class="eve-v53-note">Microsoft 365 email: <b>${status.configured?'ready':'not configured'}</b>${status.sender?` · ${htmlEsc(status.sender)}`:''}</div>
      ${savedSegments.length?`<label>Saved participant segment</label><select id="eve-v53-rec-segment"><option value="">Choose a segment…</option>${savedSegments.map(x=>`<option value="${htmlEsc(x.id)}">${htmlEsc(x.name)}</option>`).join('')}</select>`:''}
      <label>Recipients</label><textarea id="eve-v53-recipients" placeholder="name@example.com&#10;another@example.com"></textarea>
      <div class="eve-v53-grid"><div><label>Subject</label><input id="eve-v53-subject" value="${htmlEsc(String(status.templates?.recruitmentSubject||'Invitation to take part: {{studyTitle}}').replace(/\{\{\s*studyTitle\s*\}\}/g,s.title))}"></div><div><label>Share segment</label><div class="eve-v53-note">${htmlEsc((typeof selectedSendSegment==='function'&&selectedSendSegment(s)?.name)||'All users')}</div></div></div>
      <label>Message</label><textarea id="eve-v53-message">${htmlEsc(String(status.templates?.recruitmentMessage||'We would like to invite you to take part in a research study.').replace(/\{\{\s*studyTitle\s*\}\}/g,s.title))}</textarea>
      <button id="eve-v53-send-recruit" ${status.configured?'':'disabled'}>Send invitations</button>
      <div id="eve-v53-recruit-result" class="eve-v53-error"></div></div>`;
    document.body.appendChild(recruitmentModal);
    let unwireRecruit=()=>{};
    const closeRecruit=()=>{unwireRecruit();recruitmentModal?.remove();recruitmentModal=null};
    unwireRecruit=wireOverlay(recruitmentModal,closeRecruit);
    recruitmentModal.querySelector('#eve-v53-recruit-close').onclick=closeRecruit;
    const segSel=recruitmentModal.querySelector('#eve-v53-rec-segment');
    if(segSel)segSel.onchange=()=>{
      try{
        const seg=(state.participantSegments||[]).find(x=>x.id===segSel.value);
        const emails=seg&&typeof segmentMembers==='function'?segmentMembers(seg).filter(p=>p.recontact&&p.email).map(p=>p.email):[];
        recruitmentModal.querySelector('#eve-v53-recipients').value=emails.join('\n')
      }catch{}
    };
    const sendRecruit=recruitmentModal.querySelector('#eve-v53-send-recruit');
    sendRecruit.onclick=()=>withBusy(sendRecruit,'Sending…',async()=>{
      const result=recruitmentModal.querySelector('#eve-v53-recruit-result'),recipients=parseEmails(recruitmentModal.querySelector('#eve-v53-recipients').value);
      if(!recipients.length){result.textContent='Add at least one valid email address.';return}
      if(recipients.length>100){result.textContent='Send at most 100 invitations at a time.';return}
      result.textContent=`Sending ${recipients.length} invitation${recipients.length===1?'':'s'}…`;
      try{
        const participantUrl=typeof sendSegmentUrl==='function'?sendSegmentUrl(s,state.sendShareSegmentId):'';
        const out=await api('/api/recruitment/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          studyId:s.id,studyTitle:s.title,participantUrl,recipients,
          subject:recruitmentModal.querySelector('#eve-v53-subject').value,
          message:recruitmentModal.querySelector('#eve-v53-message').value
        })});
        result.style.color=out.failed?'#b54708':'#067647';result.textContent=out.failed?`${out.sent} sent · ${out.failed} failed`:`${out.sent} invitation${out.sent===1?'':'s'} sent`
      }catch(e){result.textContent=e.message}
    })
  };
  const originalDirectShare=typeof directSharePanel==='function'?directSharePanel:null;
  if(originalDirectShare){
    window.directSharePanel=function(s,shareReady){
      const base=originalDirectShare(s,shareReady);if(authState?.local||!shareReady)return base;
      return `${base}<section class="card eve-v53-recruit"><div class="section-head small-head"><div><div class="eyebrow">EMAIL INVITATIONS</div><h3>Recruit from Eve</h3><div class="muted">Send the current participant link to saved recontact participants or a pasted email list.</div></div></div><div class="eve-v53-recruit-actions"><button class="btn" onclick="openEveRecruitment('${htmlEsc(s.id)}')">Email participants</button></div></section>`
    }
  }

  // ----- Real AI path from v50 -----
  async function runCheck(kind,content,permission){
    const out=await api('/api/ai/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,content,permission})});return out.result
  }
  const originalQuestionCheck=window.aiCheckQuestion;
  window.aiCheckQuestion=async function(id){
    try{const s=activeStudy(),b=s?.blocks?.find(x=>x.id===id);if(!s||!b)return;if((s.settings?.ai||'off')==='off')return originalQuestionCheck?originalQuestionCheck(id):void 0;
      if(typeof toast==='function')toast('Checking with AI…',1800);const r=await runCheck('question',{type:b.type,question:b.question,answers:b.options||b.answers||[]},s.settings.ai);
      if(typeof toast==='function')toast(`${r.severity==='warning'?'AI warning':'AI check'}: ${r.summary}${r.suggestion?' — '+r.suggestion:''}`,6500)
    }catch(e){if(typeof toast==='function')toast(`AI check unavailable: ${e.message}`,4200)}
  };
  const originalTaskCheck=window.aiCheckTask;
  window.aiCheckTask=async function(id){
    try{const s=activeStudy(),b=s?.blocks?.find(x=>x.id===id);if(!s||!b)return;if((s.settings?.ai||'off')==='off')return originalTaskCheck?originalTaskCheck(id):void 0;
      if(typeof toast==='function')toast('Checking task with AI…',1800);const r=await runCheck('task',{type:b.type,task:b.task||b.instructions||b.question,target:b.target||b.successUrl||'',tree:b.tree||null},s.settings.ai);
      if(typeof toast==='function')toast(`${r.severity==='warning'?'AI warning':'AI check'}: ${r.summary}${r.suggestion?' — '+r.suggestion:''}`,6500)
    }catch(e){if(typeof toast==='function')toast(`AI check unavailable: ${e.message}`,4200)}
  };
  const originalInsights=typeof insightsPanel==='function'?insightsPanel:null;
  window.runEveAiResearcher=async function(studyId){
    try{
      const base=activeStudy();if(!base||base.id!==studyId)return;const permission=base.settings?.ai||'off';
      if(permission==='off'){if(typeof toast==='function')toast('Enable Anonymised or Full AI access in Study settings first.');return}
      aiCache.set(studyId,{loading:true});if(typeof render==='function')render();let schema=base,responses=[];
      try{const review=typeof reviewStateFor==='function'?reviewStateFor(base):null;schema=review&&typeof publishedStudy==='function'?publishedStudy(base,review.version):base;
        const all=typeof studyResponses==='function'?studyResponses(studyId,review?.version):[];responses=typeof researchResponses==='function'?researchResponses(all):all;
        if(review&&typeof applySegmentFilter==='function')responses=applySegmentFilter(schema,responses,review.segment)}catch{}
      const payload=await api('/api/ai/researcher',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({permission,study:schema,responses:responses.slice(0,250),cohort:{count:responses.length}})});
      aiCache.set(studyId,{loading:false,result:payload.result,model:payload.model,policy:payload.policy});if(typeof render==='function')render()
    }catch(e){aiCache.set(studyId,{loading:false,error:e.message});if(typeof render==='function')render()}
  };
  window.clearEveAiResearcher=function(studyId){aiCache.delete(studyId);if(typeof render==='function')render()};
  if(originalInsights){
    window.insightsPanel=function(s,rs){
      const permission=s?.settings?.ai||'off';if(permission==='off')return originalInsights(s,rs);const cached=aiCache.get(s.id);
      if(!cached)return `<section class="card insight-panel"><div class="section-head small-head"><div><div class="eyebrow">AI RESEARCHER</div><h3>Evidence-led interpretation</h3><div class="muted">Uses the configured AI provider under this study's <b>${htmlEsc(permission)}</b> permission.</div></div><span class="pill">${htmlEsc(permission)}</span></div><div class="eve-v53-ai-actions"><button class="btn primary" onclick="runEveAiResearcher('${htmlEsc(s.id)}')">Analyse with AI</button><span class="eve-v53-ai-status">${rs?.length||0} responses in this cohort</span></div></section>`;
      if(cached.loading)return `<section class="card insight-panel"><div class="eyebrow">AI RESEARCHER</div><h3>Analysing evidence…</h3><p class="muted">The current cohort is being analysed.</p></section>`;
      if(cached.error)return `<section class="card insight-panel"><div class="eyebrow">AI RESEARCHER</div><h3>Analysis unavailable</h3><p>${htmlEsc(cached.error)}</p><button class="btn" onclick="clearEveAiResearcher('${htmlEsc(s.id)}')">Try again</button></section>`;
      const r=cached.result||{},insights=Array.isArray(r.insights)?r.insights:[];
      return `<section class="card insight-panel"><div class="section-head small-head"><div><div class="eyebrow">AI RESEARCHER · ${htmlEsc(cached.model||'configured model')}</div><h3>Evidence-led interpretation</h3><div class="muted">${htmlEsc(r.summary||'')}</div></div><span class="pill">${htmlEsc(cached.policy||permission)}</span></div><div class="insight-list">${insights.map(x=>`<article class="insight-item"><div><span class="confidence">${htmlEsc(x.confidence||'moderate')}</span><h4>${htmlEsc(x.title||'Insight')}</h4><p>${htmlEsc(x.summary||'')}</p><small>${htmlEsc(x.evidence||'')}</small></div></article>`).join('')}</div>${Array.isArray(r.followUps)&&r.followUps.length?`<h4>Suggested follow-up</h4><ul>${r.followUps.map(x=>`<li>${htmlEsc(x)}</li>`).join('')}</ul>`:''}<button class="btn subtle" onclick="clearEveAiResearcher('${htmlEsc(s.id)}')">Run again</button></section>`
    }
  }

  // Invitation acceptance stays outside the authenticated researcher gate.
  async function maybeAcceptInvite(){
    const q=new URLSearchParams(location.search),inv=q.get('eveInvite');if(!inv)return false;
    styleOnce();document.body.innerHTML=gateMarkup(true);const form=document.getElementById('eve-v53-login');
    form.querySelector('h1').textContent='Join Eve workspace';form.querySelector('p').textContent='Create your account, or enter the password for an existing account with this invited email.';
    const email=form.querySelector('#eve-v53-email');if(email){email.removeAttribute('required');email.style.display='none';email.previousElementSibling?.remove()}
    const name=document.createElement('div');name.innerHTML='<label>Name</label><input id="eve-v53-name" autocomplete="name">';form.querySelector('label')?.before(name);
    form.querySelector('button').textContent='Accept invitation';form.onsubmit=async ev=>{
      ev.preventDefault();const err=document.getElementById('eve-v53-login-error');err.textContent='';
      try{await api('/api/org/invitations/accept',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:inv,name:document.getElementById('eve-v53-name').value,password:document.getElementById('eve-v53-password').value})});
        history.replaceState(null,'',location.pathname+location.hash);location.reload()}catch(e){err.textContent=e.message}
    };return true
  }

  window.addEventListener('hashchange',async()=>{
    if(isParticipantRoute()){await releaseLease();removeGate();document.getElementById('eve-v53-account')?.remove();document.getElementById('eve-v53-collab')?.remove()}
    else{await ensureAuth();heartbeat(true)}
  });
  window.addEventListener('pagehide',()=>{releaseLease()});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&authState&&!isParticipantRoute())heartbeat()});
  document.addEventListener('DOMContentLoaded',async()=>{
    const q=new URLSearchParams(location.search),authError=q.get('authError');
    if(authError&&typeof miniNotice==='function'){
      await miniNotice('Microsoft sign-in was not completed',authError);
      q.delete('authError');history.replaceState(null,'',location.pathname+(q.toString()?`?${q}`:'')+location.hash)
    }
    if(await maybeAcceptInvite())return;await ensureAuth()
  });
})();
