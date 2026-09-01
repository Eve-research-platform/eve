'use strict';
const assert=require('assert');
const {create,pendingKey}=require('../app/eve-participant-delivery.js');

function harness(options={}){
  const store=new Map(),responsePosts=[],recordingPosts=[],localResponses=[],localRecordings=[],panel=[];
  let id=0,responseAttempts=0,recordingAttempts=0;
  const delivery=create({
    getRelayKey:()=>options.relay===false?'':'relay-key',
    getInviteToken:()=>options.inviteToken||'',
    encryptResponse:async value=>({cipher:value.id}),
    encryptRecording:async blob=>({cipher:`blob-${blob.size}`}),
    postResponse:async(base,payload)=>{
      responsePosts.push(payload);responseAttempts++;
      if(responseAttempts<=(options.responseFailures||0))throw Object.assign(new Error('network'),{retryable:true});
      if(options.responsePermanent)throw Object.assign(new Error('closed'),{retryable:false});
      return {ok:true,receivedAt:5000,id:payload.id,idempotent:responseAttempts>1};
    },
    postRecording:async(base,payload)=>{
      recordingPosts.push(payload);recordingAttempts++;
      if(recordingAttempts<=(options.recordingFailures||0))throw Object.assign(new Error('network'),{retryable:true});
      return {ok:true,receivedAt:4000,id:payload.id,idempotent:recordingAttempts>1};
    },
    saveLocalRecording:async(recordingId,blob)=>{localRecordings.push(recordingId);return{recordingId,storage:'local',mimeType:blob.type,size:blob.size}},
    saveResponseRecord:async response=>{localResponses.push(response.id);return response},
    localStudyExists:id=>options.localStudy!==false&&id==='s1',
    notifyPanel:async(base,study,response)=>{panel.push(response.id);return {notice:'Panel updated'}},
    sessionGet:key=>store.get(key)||null,
    sessionSet:(key,value)=>{if(options.sessionWriteFails)return false;store.set(key,value);return true},
    sessionRemove:key=>store.delete(key),
    uid:()=>`rec-${++id}`,
    retryDelays:[0,0,0],
    logger:{warn:()=>{}}
  });
  const base={id:'s1',slug:'study',relayPublished:options.relay!==false,relayKey:'relay-key'};
  const study={id:'s1',version:1};
  const response={id:'response-1',studyId:'s1',studyVersion:1,source:'direct',answers:{}};
  return {delivery,store,responsePosts,recordingPosts,localResponses,localRecordings,panel,base,study,response};
}

(async()=>{
  {
    const h=harness({responseFailures:2});
    const result=await h.delivery.deliverResponse({base:h.base,study:h.study,response:h.response,sessionKey:'session'});
    assert.equal(result.ok,true);
    assert.equal(h.responsePosts.length,3,'transient response delivery should retry');
    assert(h.responsePosts.every(x=>x.id==='response-1'),'every retry must use the same response id');
    assert.equal(h.delivery.loadPending('session'),null,'pending payload clears only after confirmed delivery');
    assert.equal(result.response.serverReceivedAt,5000);
    assert.deepEqual(h.localResponses,['response-1']);
  }

  {
    const h=harness({responsePermanent:true});
    const result=await h.delivery.deliverResponse({base:h.base,study:h.study,response:h.response,sessionKey:'session'});
    assert.equal(result.ok,false);
    assert.equal(h.responsePosts.length,1,'non-retryable relay errors must not loop');
    const pending=h.delivery.loadPending('session');
    assert.equal(pending.response.id,'response-1');
    assert.equal(pending.studyVersion,1);
  }

  {
    const h=harness({responseFailures:3});
    let result=await h.delivery.deliverResponse({base:h.base,study:h.study,response:h.response,sessionKey:'session'});
    assert.equal(result.ok,false);
    assert.equal(h.delivery.loadPending('session').response.id,'response-1');

    // Simulate the next page load/network recovery using the same session-scoped pending response.
    const resumed=create({
      getRelayKey:()=> 'relay-key',
      getInviteToken:()=> '',
      encryptResponse:async value=>({cipher:value.id}),
      encryptRecording:async()=>({}),
      postResponse:async(base,payload)=>({ok:true,receivedAt:7000,id:payload.id,idempotent:true}),
      postRecording:async()=>({}),
      saveLocalRecording:async()=>({}),
      saveResponseRecord:async response=>{h.localResponses.push(response.id);return response},
      localStudyExists:()=>true,
      notifyPanel:async()=>({notice:'Recovered'}),
      sessionGet:key=>h.store.get(key)||null,
      sessionSet:(key,value)=>{h.store.set(key,value);return true},
      sessionRemove:key=>h.store.delete(key),
      uid:()=> 'unused',
      retryDelays:[0,0,0]
    });
    result=await resumed.resumePending({base:h.base,study:h.study,sessionKey:'session'});
    assert.equal(result.ok,true);
    assert.equal(result.response.id,'response-1');
    assert.equal(result.response.serverReceivedAt,7000);
    assert.equal(resumed.loadPending('session'),null);
  }

  {
    const h=harness({recordingFailures:1});
    const session={blob:{size:123,type:'audio/webm'},durationMs:900,mode:'audio'};
    const saved=await h.delivery.persistRecording(h.base,h.response,{id:'block-1'},session);
    assert.equal(saved.recordingId,'rec-1');
    assert.equal(session.recordingId,'rec-1');
    assert.equal(h.recordingPosts.length,2);
    assert(h.recordingPosts.every(x=>x.id==='rec-1'),'recording retry must preserve its id');
    const savedAgain=await h.delivery.persistRecording(h.base,h.response,{id:'block-1'},session);
    assert.equal(savedAgain.recordingId,'rec-1','manual retry in the same tab must reuse the recording id');
  }

  {
    const h=harness({relay:false});
    const result=await h.delivery.deliverResponse({base:h.base,study:h.study,response:h.response,sessionKey:'session'});
    assert.equal(result.ok,true);
    assert.deepEqual(h.localResponses,['response-1']);
    assert.equal(h.responsePosts.length,0);
  }

  {
    const h=harness();
    h.delivery.savePending('session',{studyId:'other',studyVersion:9,response:{id:'wrong'}});
    const result=await h.delivery.resumePending({base:h.base,study:h.study,sessionKey:'session'});
    assert.equal(result.stale,true);
    assert.equal(h.delivery.loadPending('session'),null,'stale pending response must not leak into another study/version');
  }

  {
    const h=harness({sessionWriteFails:true,responsePermanent:true});
    const result=await h.delivery.deliverResponse({base:h.base,study:h.study,response:h.response,sessionKey:'session'});
    assert.equal(result.ok,false);
    assert.equal(h.delivery.loadPending('session'),null,'delivery must not pretend a pending response was saved when session storage rejected it');
  }

  assert(pendingKey('abc').includes('abc'));
  console.log('v56.3 participant delivery failure matrix passed');
})().catch(err=>{console.error(err);process.exit(1)});
