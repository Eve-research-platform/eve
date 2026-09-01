'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','app','app.js'),'utf8');
const delivery=fs.readFileSync(path.join(__dirname,'..','app','eve-participant-delivery.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','app','styles.css'),'utf8');
const {blockIssues,formatRecordingClock}=require('../app/app.js');

assert.equal(formatRecordingClock(0),'0:00');
assert.equal(formatRecordingClock(61000),'1:01');

assert.deepEqual(blockIssues({
  type:'recording',prompt:'Tell us what you think',recordingMode:'audio',recordingTimeLimitMinutes:2
}),[]);
assert(blockIssues({type:'recording',prompt:'',recordingMode:'audio',recordingTimeLimitMinutes:2}).some(x=>x.includes('prompt')));
assert(blockIssues({type:'recording',prompt:'Talk',recordingMode:'screen',recordingTimeLimitMinutes:2}).some(x=>x.includes('audio')));
assert(blockIssues({type:'recording',prompt:'Talk',recordingMode:'video',recordingTimeLimitMinutes:20}).some(x=>x.includes('15 minutes')));

assert(src.includes("recording:{prompt:'Tell us what you are thinking.',recordingMode:'audio',recordingTimeLimitMinutes:2"));
assert(src.includes("['recording','mic','Recording'"));
assert(src.includes("if(b.type==='recording')return recordingRuntime(b)"));
assert(src.includes('function bindRecordingInteractions('));
assert(src.includes("navigator.mediaDevices.getUserMedia"));
assert(src.includes("new MediaRecorder(stream,options)"));
assert(src.includes("videoBitsPerSecond=550000"));
assert(src.includes("audioBitsPerSecond=64000"));
assert(src.includes("participantRecordingSessions"));
assert(delivery.includes("async function uploadRecordingRelay("));
assert(src.includes("encryptRecordingBlobWithKey("));
assert(src.includes("saveLocalRecording("));
assert(src.includes("function recordingResults("));
assert(src.includes("function loadRecordingPlayback("));
assert(src.includes("recording:'Recordings'"));
assert(src.includes("recording:schema.blocks.filter(b=>b.type==='recording').length"));
assert(src.includes("stopAllLiveRecordings(current)"));
assert(src.includes("data-recording-start"));
assert(src.includes("data-recording-reset"));
assert(src.includes("data-recording-limit"));

assert(css.includes('.recording-runtime'));
assert(css.includes('.recording-live-shell'));
assert(css.includes('.recording-review-list'));
assert(css.includes('@media(max-width:720px)'));

const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
assert(server.includes('MAX_RECORDING_BODY=128*1024*1024'));
assert(server.includes('/recordings'));
assert(server.includes("body(req,MAX_RECORDING_BODY)"));

console.log('v53.3 recording block tests passed');
