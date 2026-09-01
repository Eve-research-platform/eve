'use strict';
const assert=require('assert');
const {create}=require('../app/eve-archive-ops.js');

function harness(overrides={}){
  let time=1000000;
  const notices=[],toasts=[],relayStatuses=[],deletedResponses=[],deletedRecordings=[];
  const study={
    id:'s1',title:'Test study',status:'draft',relayPublished:false,
    archivedAt:null,archivePurgeAt:null,archivedFromStatus:null,archivePurgeErrorAt:null,
    cloudSyncedProviders:[],updatedAt:1
  };
  const state={
    studies:[study],
    responses:[{id:'r1',studyId:'s1',answers:{recording:{recordingId:'rec1',storage:'local'}}}],
    findings:[{id:'f1',studyId:'s1'}],
    participantSegments:[{id:'seg1',rules:{studyId:'s1'}}],
    activeStudyId:null,reviewFilters:{},reviewSections:{}
  };
  const cfg={
    state,
    isStudyArchived:s=>!!s.archivedAt,
    responsesForStudy:id=>state.responses.filter(r=>r.studyId===id),
    insightsForStudy:id=>state.findings.filter(f=>f.studyId===id),
    localRecordingIdsForResponses:()=>['rec1'],
    miniConfirm:async()=>true,
    miniNotice:async(title,message)=>{notices.push({title,message})},
    relayHealth:async()=>true,
    relayUpdateLifecycle:async s=>{relayStatuses.push(s.status);return true},
    relayDeleteStudy:async()=>true,
    persistWorkspace:async()=>true,
    deleteCloudStudyData:async()=>true,
    cleanupPanelStudy:async()=>true,
    deleteResponseRecord:async r=>{deletedResponses.push(r.id)},
    deleteRecordingRecord:async id=>{deletedRecordings.push(id)},
    clearStudyRuntimeState:()=>{},
    render:()=>{},
    toast:(message)=>toasts.push(message),
    navigateFromStudyAfterArchive:()=>{},
    archiveRetentionMs:3000,
    archiveDaysRemaining:()=>1,
    now:()=>++time,
    logger:{warn:()=>{}},
    ...overrides
  };
  return {ops:create(cfg),state,study,notices,toasts,relayStatuses,deletedResponses,deletedRecordings,cfg};
}

(async()=>{
  {
    const h=harness();
    assert.equal(await h.ops.archiveStudy('s1'),true);
    assert.equal(h.study.archivedFromStatus,'draft');
    assert.equal(h.study.archivedAt,1000001);
    assert.equal(h.study.archivePurgeAt,1003001);
    assert.equal(h.relayStatuses.length,0);
  }

  {
    const h=harness({relayHealth:async()=>false});
    h.study.status='live';h.study.relayPublished=true;
    assert.equal(await h.ops.archiveStudy('s1'),false);
    assert.equal(h.study.status,'live');
    assert.equal(h.study.archivedAt,null);
    assert.equal(h.notices.at(-1).title,'Study was not archived');
  }

  {
    let persistCalls=0;
    const h=harness({persistWorkspace:async()=>{persistCalls++;return false}});
    h.study.status='live';h.study.relayPublished=true;
    assert.equal(await h.ops.archiveStudy('s1'),false);
    assert.equal(h.study.status,'live');
    assert.equal(h.study.archivedAt,null);
    assert.deepEqual(h.relayStatuses,['closed','live'],'remote close must be reconciled when Archive save fails');
    assert.equal(persistCalls,1);
  }

  {
    const h=harness({persistWorkspace:async()=>false});
    h.study.status='closed';h.study.archivedAt=123;h.study.archivePurgeAt=456;h.study.archivedFromStatus='live';
    assert.equal(await h.ops.restoreArchivedStudy('s1'),false);
    assert.equal(h.study.archivedAt,123);
    assert.equal(h.study.archivePurgeAt,456);
    assert.equal(h.study.archivedFromStatus,'live');
    assert.equal(h.study.status,'closed');
  }

  {
    const h=harness({deleteCloudStudyData:async()=>false});
    h.study.archivedAt=123;h.study.cloudSyncedProviders=['Google Drive'];
    assert.equal(await h.ops.purgeArchivedStudy('s1'),false);
    assert.equal(h.state.studies.length,1);
    assert(h.study.archivePurgeErrorAt>0);
    assert.equal(h.notices.at(-1).title,'Study was not deleted');
  }

  {
    const h=harness({relayDeleteStudy:async()=>false});
    h.study.archivedAt=123;h.study.relayPublished=true;
    assert.equal(await h.ops.purgeArchivedStudy('s1'),false);
    assert.equal(h.state.studies.length,1);
    assert(h.study.archivePurgeErrorAt>0);
  }

  {
    let persistCount=0;
    const h=harness({persistWorkspace:async()=>{persistCount++;return false}});
    h.study.archivedAt=123;
    assert.equal(await h.ops.purgeArchivedStudy('s1'),false);
    assert.equal(h.state.studies.length,1);
    assert.equal(h.state.responses.length,1);
    assert.equal(h.state.findings.length,1);
    assert.equal(h.state.participantSegments.length,1);
    assert.equal(h.deletedResponses.length,0,'IndexedDB cleanup must not start before workspace deletion commits');
    assert.equal(h.deletedRecordings.length,0);
    assert.equal(persistCount,1);
  }

  {
    const h=harness();
    h.study.archivedAt=123;
    assert.equal(await h.ops.purgeArchivedStudy('s1'),true);
    assert.equal(h.state.studies.length,0);
    assert.equal(h.state.responses.length,0);
    assert.equal(h.state.findings.length,0);
    assert.equal(h.state.participantSegments.length,0);
    assert.deepEqual(h.deletedResponses,['r1']);
    assert.deepEqual(h.deletedRecordings,['rec1']);
  }

  {
    let purged=0;
    const h=harness({
      now:()=>1000,
      persistWorkspace:async()=>true,
      deleteResponseRecord:async()=>{},
      deleteRecordingRecord:async()=>{}
    });
    h.study.archivedAt=10;h.study.archivePurgeAt=500;
    const original=h.ops.purgeArchivedStudy;
    // The public expired-purge route must be safe and complete without researcher confirmation.
    await h.ops.purgeExpiredArchivedStudies();
    assert.equal(h.state.studies.length,0);
  }

  console.log('v56.1 Archive operation failure matrix passed');
})().catch(err=>{console.error(err);process.exit(1)});
