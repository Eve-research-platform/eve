'use strict';

(function(root,factory){
  const api=factory(
    typeof module!=='undefined'&&module.exports ? require('./eve-transactions.js') : root.EveTransactions
  );
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.EveStudyLifecycle=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(EveTx){
  if(!EveTx)throw new Error('EveStudyLifecycle requires EveTransactions');

  function restoreObject(target,snapshot){
    for(const key of Object.keys(target))if(!Object.prototype.hasOwnProperty.call(snapshot,key))delete target[key];
    Object.assign(target,EveTx.clone(snapshot));
  }

  function create(deps={}){
    const {
      state,
      currentStudy,
      refreshDirty,
      latestPublishedVersion,
      snapshotForVersion,
      publishedStudy,
      closingInstant,
      validateStudy,
      preparePanelStudyRegistration,
      prepareRelayCredentials,
      versionedStudyData,
      relayHealth,
      relayPublishStudy,
      relayUpdateLifecycle,
      relayStudyStatus,
      persistWorkspace,
      render,
      toast,
      miniNotice,
      navigate,
      now=()=>Date.now()
    }=deps;

    function findStudy(id){return id?state.studies.find(x=>x.id===id):currentStudy()}
    function setRelayOnline(value){state.relayOnline=!!value}


    async function publishConfirmed(s,snapshot){
      if(await relayPublishStudy(s,snapshot))return true;
      const info=await relayStudyStatus(s);
      const confirmed=!!(info&&Number(info.latestVersion||0)>=Number(snapshot.version)&&String(info.lifecycle?.status||'')===String(s.status));
      if(confirmed)s.relayPublished=true;
      return confirmed;
    }

    async function lifecycleConfirmed(s){
      if(await relayUpdateLifecycle(s))return true;
      const info=await relayStudyStatus(s);
      return !!(info&&Number(info.latestVersion||0)>=Number(s.version||0)&&String(info.lifecycle?.status||'')===String(s.status));
    }

    async function forceRemoteClosed(s){
      const priorStatus=s.status,priorPublished=s.relayPublished;
      s.status='closed';s.relayPublished=true;
      try{return await lifecycleConfirmed(s)}
      finally{s.status=priorStatus;s.relayPublished=priorPublished}
    }

    async function recoverLiveLink(s){
      const snap=snapshotForVersion(s,s.version);
      if(!snap)return false;
      const result=await EveTx.run({
        key:`lifecycle:${s.id}`,
        snapshot:()=>EveTx.clone(s),
        prepare:async()=>{
          const online=await relayHealth();setRelayOnline(online);
          if(!online)return false;
          prepareRelayCredentials(s,s.version);
          return true;
        },
        prepareError:'Participant sharing is unavailable.',
        remote:()=>publishConfirmed(s,snap),
        remoteError:'Participant access could not be confirmed.'
      });
      if(result.busy){toast('A study lifecycle change is already in progress.',2600,'error');return false}
      if(!result.ok){
        restoreObject(s,result.snapshot||s);
        toast(result.stage==='prepare'?'Participant sharing is unavailable. The study remains live locally, but Eve could not restore the participant link.':'Eve could not restore the participant link. Try again before sharing this study.',4400,'error');
        return false;
      }
      const saved=await persistWorkspace(false);
      render();
      if(!saved){toast('Participant access is restored, but Eve could not save the delivery status. Reload and open Send again to reconcile it.',5200,'error');return true}
      toast(`Study is already live on version ${s.version}.`);
      return true;
    }

    async function reopenPublishedStudy(s){
      const published=publishedStudy(s,s.version),close=closingInstant(published);
      if(close&&now()>close){
        await miniNotice('Closing time has passed','Update the end time in Study settings before going live again.');
        navigate(`/study/${s.id}/settings`);
        return false;
      }

      const hadRemote=!!s.relayPublished;
      const result=await EveTx.run({
        key:`lifecycle:${s.id}`,
        snapshot:()=>EveTx.clone(s),
        prepare:async()=>{
          const online=await relayHealth();setRelayOnline(online);
          if(!online)return false;
          prepareRelayCredentials(s,s.version);
          return true;
        },
        prepareError:'Participant sharing is unavailable.',
        apply:()=>{s.status='live';s.updatedAt=now()},
        persist:()=>persistWorkspace(false),
        persistError:'Could not save the reopened study.',
        remote:()=>hadRemote?lifecycleConfirmed(s):publishConfirmed(s,{version:s.version,publishedAt:s.publishedAt||now(),data:published}),
        remoteError:'Participant access could not be confirmed.',
        finalPersist:()=>persistWorkspace(false),
        finalPersistError:'Could not save confirmed participant delivery.',
        rollbackRemote:()=>forceRemoteClosed(s),
        restore:ctx=>restoreObject(s,ctx.snapshot),
        rollbackPersist:()=>persistWorkspace(false),
        rollback:async()=>{if(hadRemote)await forceRemoteClosed(s)}
      });

      if(result.busy){toast('A study lifecycle change is already in progress.',2600,'error');return false}
      if(!result.ok){
        render();
        if(result.stage==='prepare')toast('Participant sharing is unavailable, so the study remains off.',4400,'error');
        else if(result.stage==='persist')toast('Could not safely reopen the study. It remains off.',4400,'error');
        else if(result.stage==='remote')toast(result.rollback?.persisted?'Eve could not confirm participant access, so the study remains off.':'Participant access failed and Eve could not safely restore the Off state. Reload before continuing.',5000,'error');
        else toast(result.rollback?.remote&&result.rollback?.persisted?'Eve could not save the confirmed Live state, so participant access was turned back off.':'Eve could not complete the reopen rollback safely. Reload and verify participant access before sharing.',5400,'error');
        return false;
      }
      render();toast(`Study is live again on version ${s.version}.`,2200,'success');return true;
    }

    async function publishNewVersion(s){
      if(!validateStudy(s))return false;
      const previousLatest=latestPublishedVersion(s),nextVersion=previousLatest?previousLatest+1:1,publishedAt=now();
      let panelError=null,snapshot=null;

      const result=await EveTx.run({
        key:`lifecycle:${s.id}`,
        snapshot:()=>EveTx.clone(s),
        prepare:async()=>{
          try{await preparePanelStudyRegistration(s,nextVersion)}
          catch(err){panelError=err;throw EveTx.txError('panel','Panel sign-up is not ready',err)}
          const online=await relayHealth();setRelayOnline(online);
          if(!online)return false;
          prepareRelayCredentials(s,nextVersion);
          return true;
        },
        prepareError:'Participant sharing is unavailable.',
        apply:()=>{
          const data=EveTx.clone({...versionedStudyData(s),version:nextVersion,status:'live'});
          snapshot={version:nextVersion,publishedAt,data};
          s.version=nextVersion;s.status='live';s.publishedAt=publishedAt;s.updatedAt=publishedAt;
          s.publishedVersions=s.publishedVersions||{};
          s.publishedVersions[String(nextVersion)]=snapshot;
          s.publishedSnapshot=snapshot;
          s.hasUnpublishedChanges=false;
        },
        persist:()=>persistWorkspace(false),
        persistError:'Could not save the live version.',
        remote:()=>publishConfirmed(s,snapshot),
        remoteError:'Participant access could not be confirmed.',
        finalPersist:()=>persistWorkspace(false),
        finalPersistError:'Could not save confirmed participant delivery.',
        rollbackRemote:()=>forceRemoteClosed(s),
        restore:ctx=>restoreObject(s,ctx.snapshot),
        rollbackPersist:()=>persistWorkspace(false)
      });

      if(result.busy){toast('A study lifecycle change is already in progress.',2600,'error');return false}
      if(!result.ok){
        render();
        if(result.stage==='panel'){
          await miniNotice('Panel sign-up is not ready',panelError?.data?.error==='mail_not_configured'?'Panel sign-up requires Microsoft 365 email to be configured before this study can go live.':'Eve could not register the Panel sign-up service for this study. Check the Eve service and email configuration, then try again.');
        }else if(result.stage==='prepare'){
          toast('Participant sharing is unavailable, so the study was not put live.',4400,'error');
        }else if(result.stage==='persist'){
          toast('Could not save the live version. No changes were committed.',4200,'error');
        }else if(result.stage==='remote'){
          toast(result.rollback?.persisted?'Participant access could not be confirmed, so the study was not put live.':'Participant access failed and Eve could not complete the rollback. Reload before continuing.',5200,'error');
        }else{
          if(result.stage==='final-persist'&&result.rollback?.remote&&result.snapshot?.status==='live'){
            s.status='closed';s.updatedAt=now();
            const aligned=await persistWorkspace(false);
            toast(aligned?'Eve could not save the confirmed delivery state, so participant access was turned off. The study is now Off and your changes are retained.':'Participant access was turned off, but Eve could not save the matching Off state. Reload and verify the study before sharing.',5800,'error');
          }else{
            toast(result.rollback?.remote&&result.rollback?.persisted?'Eve could not save the confirmed delivery state, so participant access was turned off and the previous state was restored.':'Eve could not safely complete the publication rollback. Reload and verify the study before sharing.',5600,'error');
          }
        }
        return false;
      }

      render();toast(`Study is live · version ${nextVersion}.`,2200,'success');return true;
    }

    async function goLiveStudy(studyId=''){
      const s=findStudy(studyId);if(!s)return false;
      refreshDirty(s);
      if(s.status==='live'&&!s.hasUnpublishedChanges){
        if(s.relayPublished){render();toast(`Study is already live on version ${s.version}.`);return true}
        return recoverLiveLink(s);
      }
      if(s.status==='closed'&&latestPublishedVersion(s)&&!s.hasUnpublishedChanges)return reopenPublishedStudy(s);
      return publishNewVersion(s);
    }

    async function turnOffStudy(studyId=''){
      const s=findStudy(studyId);if(!s)return false;
      if(s.status!=='live'){toast('This study is already off.');return true}
      const result=await EveTx.run({
        key:`lifecycle:${s.id}`,
        snapshot:()=>EveTx.clone(s),
        apply:()=>{s.status='closed';s.updatedAt=now()},
        persist:()=>persistWorkspace(false),
        persistError:'Could not safely save the Off state.',
        remote:async()=>{
          if(!s.relayPublished)return true;
          const online=await relayHealth();setRelayOnline(online);
          if(!online)return false;
          return lifecycleConfirmed(s);
        },
        remoteError:'Participant access could not be confirmed as off.',
        restore:ctx=>restoreObject(s,ctx.snapshot),
        rollbackPersist:()=>persistWorkspace(false),
        rollback:async()=>{if(s.relayPublished)await lifecycleConfirmed(s)}
      });

      if(result.busy){toast('A study lifecycle change is already in progress.',2600,'error');return false}
      if(!result.ok){
        render();
        if(result.stage==='persist'){toast('Could not safely turn off the study. It remains live.',3600,'error');return false}
        toast(result.rollback?.persisted?'Eve could not confirm participant access was turned off, so the study remains live.':'Eve could not turn off the study and could not safely restore the previous workspace state. Reload before continuing.',4600,'error');
        return false;
      }
      render();toast('Study turned off. Participant links are disabled.',2600,'success');return true;
    }

    return {goLiveStudy,turnOffStudy};
  }

  return {create};
});
