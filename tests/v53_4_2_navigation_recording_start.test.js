'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','app','app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','app','styles.css'),'utf8');

assert(src.includes('>Start recording</button>'));
assert(src.includes("recordingEnabled?'Open task ↗':'Open start page ↗'"));
assert(src.includes("const capture=await prepareNavigationRecordingStream(mode);streams.set(mode,capture.stream);showLiveCapture(mode,capture.stream);"));
assert(src.includes("startRecorders()"));
assert(src.includes("if(recordingEnabled&&!allModesActive())"));
assert(src.includes("Recording now · open the task when you are ready"));
assert(src.includes("Recording now · task is open"));
assert(src.includes("updateReadyUi(true)"));
assert(!src.includes("Set up recording before opening the task."));

console.log('v53.4.2 navigation recording immediate-start tests passed');
