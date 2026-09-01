'use strict';

(function(root,factory){
  const api=factory(
    typeof module!=='undefined'&&module.exports ? require('./eve-transactions.js') : root.EveTransactions
  );
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.EveArchiveOps=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(EveTx){
  if(!EveTx)throw new Error('EveArchiveOps requires EveTransactions');

  function create(deps={}){
    const {
      state,
      isStudyArchived,
      responsesForStudy,
      insightsForStudy,
      localRecordingIdsForResponses,
      miniConfirm,
      miniNotice,
      relayHealth,
      relayUpdateLifecycle,
      relayDeleteStudy,
      persistWorkspace,
      deleteCloudStudyData,
      cleanupPanelStudy,
      deleteResponseRecord,
      deleteRecordingRecord,
      clearStudyRuntimeState,
      render,
      toast,
      navigateFromStudyAfterArchive,
      archiveRetentionMs=30*24*60*60*1000,
      now=()=>Date.now(),
      archiveDaysRemaining=()=>0,
      logger=console
    }=deps;

    function study(id){return state.studies.find(x=>x.id===id)}
    function archivedStudies(){return state.studies.filter(isStudyArchived)}

    async function archiveStudy(id){
      const s=study(id);if(!s||isStudyArchived(s))return false;
      const responses=responsesForStudy(id),insights=insightsForStudy(id);
      const detail=[
        `${responses.length} response${responses.length===1?'':'s'} and ${insights.length} saved insight${insights.length===1?'':'s'} will stay recoverable for 30 days.`,
        s.status==='live'?'The live participant link will be closed first.':''
      ].filter(Boolean).join(' ');
      if(!await miniConfirm('Move study to Archive?',`“${s.title}” will disappear from Studies and remain in Archive for 30 days. ${detail}`,'Move to Archive'))return false;

      const beforeStatus=s.status;
      let remoteClosed=false;

      const result=await EveTx.run({
        key:`archive:${id}`,
        snapshot:()=>EveTx.clone(s),
        prepare:async()=>{
          if(!(s.relayPublished&&s.status==='live'))return true;
          s.status='closed';
          const online=await relayHealth();
          if(!online)return false;
          const closed=await relayUpdateLifecycle(s);
          if(!closed)return false;
          remoteClosed=true;
          return true
        },
        prepareError:'Participant access could not be closed.',
        apply:()=>{
          const t=now();
          s.archivedAt=t;
          s.archivePurgeAt=t+archiveRetentionMs;
          s.archivedFromStatus=beforeStatus;
          s.archivePurgeErrorAt=null;
          s.updatedAt=t;
          clearStudyRuntimeState(id);
        },
        persist:()=>persistWorkspace(false),
        persistError:'The Archive state could not be saved.',
        restore:ctx=>Object.assign(s,ctx.snapshot),
        rollback:async()=>{
          if(!remoteClosed)return;
          const online=await relayHealth();
          if(online)await relayUpdateLifecycle(s);
        }
      });

      if(result.busy){toast('An Archive action is already in progress for this study.',2600,'error');return false}
      if(!result.ok){
        render();
        if(result.stage==='prepare'){
          await miniNotice('Study was not archived','Eve could not confirm that the live participant link was closed. The study has been kept active.');
          return false;
        }
        toast(remoteClosed?'Eve could not save the Archive change, so it restored the study and attempted to reopen participant access. Check the study before sharing it.':'Eve could not safely archive this study.',5200,'error');
        return false;
      }

      toast('Moved to Archive · automatically deletes in 30 days',3200,'success');
      navigateFromStudyAfterArchive();
      return true;
    }

    async function restoreArchivedStudy(id){
      const s=study(id);if(!s||!isStudyArchived(s))return false;
      const from=s.archivedFromStatus||s.status||'draft';
      const result=await EveTx.run({
        key:`archive:${id}`,
        snapshot:()=>EveTx.clone(s),
        apply:()=>{
          s.archivedAt=null;
          s.archivePurgeAt=null;
          s.archivePurgeErrorAt=null;
          s.archivedFromStatus=null;
          s.status=from==='live'?'closed':from;
          s.updatedAt=now();
        },
        persist:()=>persistWorkspace(false),
        persistError:'Could not safely restore the study.',
        restore:ctx=>Object.assign(s,ctx.snapshot)
      });
      if(result.busy){toast('An Archive action is already in progress for this study.',2600,'error');return false}
      if(!result.ok){render();toast('Eve could not safely restore the study. It remains in Archive.',5000,'error');return false}
      render();
      toast(from==='live'?'Study restored as off · put it live again when you are ready':'Study restored',2800,'success');
      return true;
    }

    async function purgeArchivedStudy(id,{automatic=false}={}){
      const s=study(id);if(!s||!isStudyArchived(s))return false;
      const responses=responsesForStudy(id),recordingIds=localRecordingIdsForResponses(responses),insights=insightsForStudy(id);

      if(!automatic){
        const detail=`This permanently deletes the study, ${responses.length} response${responses.length===1?'':'s'}, ${recordingIds.length} local recording${recordingIds.length===1?'':'s'} and ${insights.length} saved insight${insights.length===1?'':'s'}. This cannot be undone.`;
        if(!await miniConfirm('Delete study permanently?',`“${s.title}” will be completely deleted. ${detail}`,'Delete permanently'))return false;
      }

      if(!EveTx.begin(`archive:${id}`)){
        if(!automatic)toast('An Archive action is already in progress for this study.',2600,'error');
        return false;
      }

      try{
        const cloudProviders=Array.isArray(s.cloudSyncedProviders)?s.cloudSyncedProviders:[];
        if(cloudProviders.length){
          const cloudOk=await deleteCloudStudyData(s);
          if(!cloudOk){
            s.archivePurgeErrorAt=now();
            await persistWorkspace(false,{skipCloud:true});
            if(!automatic)await miniNotice('Study was not deleted','Eve could not remove the encrypted customer-storage copy, so the archived study has been kept. Reconnect its SharePoint or Google Drive storage and try again.');
            return false;
          }
        }

        try{await cleanupPanelStudy(s)}
        catch(err){logger.warn?.('Panel study registration cleanup failed',err)}

        if(s.relayPublished&&!await relayDeleteStudy(s)){
          s.archivePurgeErrorAt=now();
          await persistWorkspace(false,{skipCloud:true});
          if(!automatic)await miniNotice('Study was not deleted','Eve could not remove the encrypted relay copy, so the archived study has been kept. Try again when the relay is reachable.');
          return false;
        }

        const before={
          studies:state.studies,
          findings:state.findings,
          responses:state.responses,
          participantSegments:state.participantSegments
        };
        state.responses=state.responses.filter(r=>r.studyId!==id);
        state.findings=(state.findings||[]).filter(f=>f.studyId!==id);
        state.participantSegments=(state.participantSegments||[]).filter(seg=>seg?.rules?.studyId!==id);
        state.studies=state.studies.filter(x=>x.id!==id);

        const persisted=await persistWorkspace(false,{force:automatic});
        if(!persisted){
          state.studies=before.studies;
          state.findings=before.findings;
          state.responses=before.responses;
          state.participantSegments=before.participantSegments;
          s.archivePurgeErrorAt=now();
          render();
          if(!automatic)await miniNotice('Study was not deleted','Eve removed external copies but could not commit the local workspace deletion. The archived record has been retained so the problem is visible. Reload and check storage before retrying.');
          return false;
        }

        for(const r of responses){
          try{await deleteResponseRecord(r)}
          catch(err){logger.warn?.('Could not delete response',r.id,err)}
        }
        for(const recordingId of recordingIds){
          try{await deleteRecordingRecord(recordingId)}
          catch(err){logger.warn?.('Could not delete recording',recordingId,err)}
        }
        clearStudyRuntimeState(id);

        if(!automatic){
          render();
          toast('Study permanently deleted',2600,'success');
        }
        return true;
      }finally{
        EveTx.end(`archive:${id}`);
      }
    }

    async function purgeExpiredArchivedStudies(){
      const expired=archivedStudies().filter(s=>Number(s.archivePurgeAt||0)>0&&Number(s.archivePurgeAt)<=now());
      for(const s of expired){
        try{await purgeArchivedStudy(s.id,{automatic:true})}
        catch(err){logger.warn?.('Automatic archive purge failed',s.id,err)}
      }
    }

    return {archiveStudy,restoreArchivedStudy,purgeArchivedStudy,purgeExpiredArchivedStudies};
  }

  return {create};
});
