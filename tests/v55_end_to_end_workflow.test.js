'use strict';
const assert=require('assert');
const {
  defaultStudy,studyBuildIssues,versionedStudyData,latestPublishedVersion,
  studyAvailability,sendReadinessItems,studyStagePath,sendSegmentProgress
}=require('../app/app.js');

const study=defaultStudy();

// 1. Build
assert.equal(studyBuildIssues(study).length,0);
assert.equal(studyStagePath(study.id,'build'),`/study/${study.id}/build`);

// 2. Study settings + Send readiness
const preLive=sendReadinessItems(study,{mailLoaded:true,mailConfigured:true});
assert(preLive.filter(x=>x.blocking).every(x=>x.state==='ready'),'core launch checks should compose cleanly');

// 3. Go live snapshot contract
study.version=1;
study.status='live';
study.publishedVersions={'1':{
  version:1,
  publishedAt:Date.now(),
  data:{...versionedStudyData(study),version:1,status:'live'}
}};
assert.equal(latestPublishedVersion(study),1);
assert.equal(studyAvailability(study).available,true);
assert.equal(studyStagePath(study.id,'send'),`/study/${study.id}/send`);
assert.equal(studyStagePath(study.id,'review'),`/study/${study.id}/review`);

// 4. Recruitment progress semantics
assert.deepEqual(sendSegmentProgress(10,0),{target:10,responses:0,remaining:10,percent:0,reached:false});
assert.deepEqual(sendSegmentProgress(10,10),{target:10,responses:10,remaining:0,percent:100,reached:true});
assert.equal(sendSegmentProgress(10,14).reached,true);

// 5. Turning off does not destroy the immutable version contract
study.status='closed';
assert.equal(latestPublishedVersion(study),1);
assert.equal(studyAvailability(study).available,false);

console.log('v55 Build → Send → Review workflow guardrail passed');
