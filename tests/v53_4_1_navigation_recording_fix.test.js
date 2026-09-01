'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','app','app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','app','styles.css'),'utf8');
const {navigationRecordingLabel,navigationRecordingPermissionLabel,navigationRecordingModes}=require('../app/app.js');

assert.equal(navigationRecordingLabel('audio'),'Audio');
assert.equal(navigationRecordingLabel('video'),'Video');
assert.equal(navigationRecordingLabel('screen'),'Screen recording');
assert.equal(navigationRecordingPermissionLabel('audio'),'Microphone');
assert.equal(navigationRecordingPermissionLabel('video'),'Camera');
assert.equal(navigationRecordingPermissionLabel('screen'),'Screen/window');
assert.deepEqual(navigationRecordingModes({navigationRecordAudio:true,navigationRecordVideo:false,navigationRecordScreen:true}),['audio','screen']);

assert(src.includes("getUserMedia({audio:false,video:{facingMode:'user'"));
assert(src.includes("getDisplayMedia({video:{frameRate:{ideal:15,max:20}},audio:false})"));
assert(!src.includes("const combined=new MediaStream"));
assert(src.includes("data-nav-recording-live"));
assert(src.includes("showLiveCapture(mode,capture.stream)"));
assert(src.includes("Recording now · open the task when you are ready"));
assert(src.includes("Recording now · task is open"));
assert(src.includes("root.dataset.navRecordingActive=active?'true':'false'"));

assert(css.includes('.navigation-recording-live'));
assert(css.includes('.recording-live-dot'));

console.log('v53.4.1 navigation recording fixes tests passed');
