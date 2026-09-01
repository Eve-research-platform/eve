'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','app','app.js'),'utf8');
const submit=fs.readFileSync(path.join(__dirname,'..','app','eve-participant-submit.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','app','styles.css'),'utf8');
const {blockIssues,navigationRecordingMode,navigationRecordingModes,navigationRecordingLabel,navigationRecordingLimitSeconds,preferredRecordingMime}=require('../app/app.js');

assert.equal(navigationRecordingMode({navigationRecordingMode:'audio'}),'audio');
assert.deepEqual(navigationRecordingModes({navigationRecordAudio:true,navigationRecordVideo:true,navigationRecordScreen:true}),['audio','video','screen']);
assert.equal(navigationRecordingLabel('screen'),'Screen recording');
assert.equal(navigationRecordingLimitSeconds({timeoutEnabled:true,timeoutMinutes:5}),300);
assert.equal(navigationRecordingLimitSeconds({timeoutEnabled:true,timeoutMinutes:30}),900);
assert.equal(navigationRecordingLimitSeconds({timeoutEnabled:false}),900);

assert.deepEqual(blockIssues({
  type:'navigationTask',
  instructions:'Find the account page',
  startPage:'https://example.com',
  successPage:'https://example.com/account',
  timeoutEnabled:true,
  timeoutMinutes:5,
  navigationRecordAudio:true,
  navigationRecordVideo:true,
  navigationRecordScreen:true
}),[]);

assert(src.includes("navigationRecordAudio:false"));
assert(src.includes("navigationRecordVideo:false"));
assert(src.includes("navigationRecordScreen:false"));
assert(src.includes("aria-label=\"Record audio\""));
assert(src.includes("aria-label=\"Record video\""));
assert(src.includes("aria-label=\"Record screen\""));
assert(src.includes("data-nav-recording-modes"));
assert(src.includes("data-nav-recording-prepare"));
assert(src.includes("data-nav-recording-value"));
assert(src.includes("navigator.mediaDevices.getDisplayMedia"));
assert(src.includes("NAV_SCREEN_TAB_ONLY"));
assert(src.includes("sourceType:'navigationTask'"));
assert(src.includes("stopAllRecordings(stateName)"));
assert(src.includes("loadNavigationRecordingPlayback"));
assert(src.includes("Task recordings"));
assert(submit.includes("persisted.push(await participantDelivery.persistRecording"));
assert(src.includes("videoBitsPerSecond=700000"));
assert(src.includes("stopAllNavigationRecordings(scope)"));
assert(preferredRecordingMime('screen') === '' || /video\//.test(preferredRecordingMime('screen')));

assert(css.includes('.navigation-recording-builder'));
assert(css.includes('.navigation-recording-runtime'));
assert(css.includes('.navigation-review-recordings'));

console.log('v53.4 navigation task recording tests passed');
