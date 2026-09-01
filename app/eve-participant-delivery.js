'use strict';

(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.EveParticipantDelivery=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const PENDING_PREFIX='eve-participant-pending-v1:';

  function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
  function pendingKey(sessionKey){return PENDING_PREFIX+String(sessionKey||'')}

  function create(deps={}){
    const {
      getRelayKey,
      getInviteToken,
      encryptResponse,
      encryptRecording,
      postResponse,
      postRecording,
      saveLocalRecording,
      saveResponseRecord,
      localStudyExists,
      notifyPanel,
      sessionGet,
      sessionSet,
      sessionRemove,
      uid,
      logger=console,
      retryDelays=[0,350,900]
    }=deps;

    async function retry(operation,{attempts=retryDelays.length}={}){
      let lastError=null;
      for(let attempt=0;attempt<attempts;attempt++){
        if(attempt>0)await delay(retryDelays[Math.min(attempt,retryDelays.length-1)]||0);
        try{return await operation(attempt)}
        catch(err){lastError=err;if(err?.retryable===false)throw err}
      }
      throw lastError||new Error('Delivery failed');
    }

    function savePending(sessionKey,payload){
      if(!sessionKey)return false;
      return sessionSet(pendingKey(sessionKey),JSON.stringify({...payload,savedAt:Date.now()}));
    }

    function loadPending(sessionKey){
      if(!sessionKey)return null;
      const raw=sessionGet(pendingKey(sessionKey));if(!raw)return null;
      try{return JSON.parse(raw)}catch{sessionRemove(pendingKey(sessionKey));return null}
    }

    function clearPending(sessionKey){
      if(sessionKey)sessionRemove(pendingKey(sessionKey));
    }

    async function submitResponseRelay(base,response){
      const key=getRelayKey(base,response);if(!key||!base?.relayPublished)throw Object.assign(new Error('Participant relay is unavailable.'),{retryable:false});
      const envelope=await encryptResponse(response,key);
      return retry(()=>postResponse(base,{
        id:response.id,
        envelope,
        routing:{
          source:response.source||'direct',
          campaignId:response.campaignId||null,
          segmentId:response.recruitmentSegmentId||null,
          inviteToken:getInviteToken()||null,
          version:response.studyVersion
        }
      }));
    }

    async function uploadRecordingRelay(base,response,block,session,recordingId){
      const key=getRelayKey(base,response);if(!key||!base?.relayPublished)throw Object.assign(new Error('Recording relay is unavailable.'),{retryable:false});
      const envelope=await encryptRecording(session.blob,key);
      const ack=await retry(()=>postRecording(base,{
        id:recordingId,
        envelope,
        routing:{
          responseId:response.id,
          blockId:block.id,
          source:response.source||'direct',
          campaignId:response.campaignId||null,
          segmentId:response.recruitmentSegmentId||null,
          inviteToken:getInviteToken()||null,
          version:response.studyVersion
        }
      }));
      return {recordingId,storage:'relay',mimeType:session.blob.type||session.mimeType||'',size:session.blob.size,durationMs:session.durationMs,mode:session.mode,endedReason:session.endedReason||'',sourceType:session.sourceType||'recording',serverReceivedAt:ack?.receivedAt||null};
    }

    async function persistRecording(base,response,block,session){
      session.recordingId=session.recordingId||uid();
      const recordingId=session.recordingId;
      if(getRelayKey(base,response)&&base?.relayPublished)return uploadRecordingRelay(base,response,block,session,recordingId);
      const saved=await saveLocalRecording(recordingId,session.blob);
      return {...saved,durationMs:session.durationMs,mode:session.mode,endedReason:session.endedReason||'',sourceType:session.sourceType||'recording'};
    }

    async function deliverResponse({base,study,response,sessionKey,resuming=false}){
      const relayMode=!!(getRelayKey(base,response)&&base?.relayPublished);
      if(!resuming&&!savePending(sessionKey,{studyId:response.studyId,studyVersion:response.studyVersion,response,relayMode})){
        logger.warn?.('Participant pending submission could not be saved in this tab');
      }

      try{
        if(relayMode){
          const ack=await submitResponseRelay(base,response);
          if(ack?.receivedAt){response.serverReceivedAt=ack.receivedAt;response.submittedAt=ack.receivedAt}
          if(localStudyExists(base.id))await saveResponseRecord(response);
        }else if(localStudyExists(base.id)){
          await saveResponseRecord(response);
        }else{
          throw Object.assign(new Error('Your response could not be sent. Please try again.'),{retryable:false});
        }

        const panelOutcome=await notifyPanel(base,study,response);
        clearPending(sessionKey);
        return {ok:true,response,panelOutcome,relayMode};
      }catch(error){
        if(!loadPending(sessionKey))savePending(sessionKey,{studyId:response.studyId,studyVersion:response.studyVersion,response,relayMode});
        return {ok:false,error,response,relayMode,pending:true};
      }
    }

    async function resumePending({base,study,sessionKey}){
      const pending=loadPending(sessionKey);
      if(!pending?.response)return {ok:false,empty:true};
      if(String(pending.studyId)!==String(base?.id)||Number(pending.studyVersion)!==Number(study?.version||base?.version)){
        clearPending(sessionKey);
        return {ok:false,stale:true};
      }
      return deliverResponse({base,study,response:pending.response,sessionKey,resuming:true});
    }

    return {
      retry,pendingKey,savePending,loadPending,clearPending,
      submitResponseRelay,uploadRecordingRelay,persistRecording,deliverResponse,resumePending
    };
  }

  return {create,pendingKey};
});
