'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const app=fs.readFileSync(path.join(__dirname,'..','app','app.js'),'utf8');
const submit=fs.readFileSync(path.join(__dirname,'..','app','eve-participant-submit.js'),'utf8');
const cloud=fs.readFileSync(path.join(__dirname,'..','app','cloud-storage.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','app','styles.css'),'utf8');
const {navigationRecordingModes}=require('../app/app.js');

assert.deepEqual(navigationRecordingModes({navigationRecordAudio:true,navigationRecordVideo:true,navigationRecordScreen:true}),['audio','video','screen']);
assert.deepEqual(navigationRecordingModes({navigationRecordAudio:false,navigationRecordVideo:true,navigationRecordScreen:false}),['video']);
assert.deepEqual(navigationRecordingModes({navigationRecordingMode:'screen'}),['screen']);

assert(app.includes("navigationRecordAudio:false,navigationRecordVideo:false,navigationRecordScreen:false"));
assert(app.includes("aria-label=\"Record audio\""));
assert(app.includes("aria-label=\"Record video\""));
assert(app.includes("aria-label=\"Record screen\""));
assert(app.includes("Each option is independent"));
assert(submit.includes("sessions:persisted"));
assert(app.includes("navigationRecordingValues(answer)"));
assert(app.includes("files.length} file"));

const navStart=app.indexOf('function nav(){');
const navEnd=app.indexOf('function mobileNav(){',navStart);
const nav=app.slice(navStart,navEnd);
assert(nav.indexOf("'/participants'") < nav.indexOf("'/archive'"));
assert(nav.indexOf("'/templates'") < nav.indexOf("'/archive'"));
assert(nav.includes('sidebar-footer-nav nav'));

assert(cloud.includes("connectorServiceHelp"));
assert(cloud.includes("Cloud connector service unavailable"));
assert(cloud.includes("Set up ${label}"));
assert(!cloud.includes("onclick=\"EveCloud.connect('${p}')\" ${cfg.configured?'':'disabled'}"));
assert(css.includes('.sidebar-footer-nav.nav'));
assert(css.includes('.navigation-recording-toggle-row'));

console.log('v53.7.1 storage/nav/recording regressions passed');
