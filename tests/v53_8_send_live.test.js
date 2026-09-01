'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const app=fs.readFileSync(path.join(__dirname,'..','app','app.js'),'utf8');
const lifecycle=fs.readFileSync(path.join(__dirname,'..','app','eve-study-lifecycle.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','app','styles.css'),'utf8');

assert(app.includes("function directSharePanel(s,shareReady)"));
assert(app.includes("Set up audiences, targets and sharing structure before or after the study goes live."));
assert(!app.includes("if(!latestPublishedVersion(s)||!shareReady)return"));
assert(app.includes("Participant access is off"));
assert(app.includes("Go live to activate participant access."));
assert(app.includes("onclick=\"goLiveStudy('${s.id}')\">Go live</button>"));
assert(app.includes("onclick=\"turnOffStudy('${s.id}')\">Turn off</button>"));
assert(app.includes(">Update live study</button>"));
assert(app.includes("function goLiveStudy(studyId=''){return studyLifecycle.goLiveStudy(studyId)}"));
assert(app.includes("function turnOffStudy(studyId=''){return studyLifecycle.turnOffStudy(studyId)}"));
assert(lifecycle.includes("async function goLiveStudy(studyId='')"));
assert(lifecycle.includes("async function turnOffStudy(studyId='')"));
assert(app.includes("function publishStudy(){return goLiveStudy()}"));
assert(app.includes("LAUNCH READINESS"));
assert(app.includes("Resolve the blocking checks before trying to go live."));
assert(!app.includes(">Publish study</button>"));
assert(!app.includes(">Publish changes</button>"));
assert(!app.includes("Publish & share"));
assert(css.includes('.send-live-control'));
assert(css.includes('.send-access-offline'));

console.log('v53.8 send live/off tests passed');
