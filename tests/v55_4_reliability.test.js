'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app','app.js'),'utf8');
const archive=fs.readFileSync(path.join(root,'app','eve-archive-ops.js'),'utf8');
const lifecycle=fs.readFileSync(path.join(root,'app','eve-study-lifecycle.js'),'utf8');
const css=fs.readFileSync(path.join(root,'app','eve-v54-theme.css'),'utf8');
const {beginStudyAction,endStudyAction,studyActionBusy}=require('../app/app.js');

assert.equal(beginStudyAction('study:a'),true);
assert.equal(studyActionBusy('study:a'),true);
assert.equal(beginStudyAction('study:a'),false,'same action must not start twice');
endStudyAction('study:a');
assert.equal(studyActionBusy('study:a'),false);
assert.equal(beginStudyAction('study:a'),true);
endStudyAction('study:a');

assert(lifecycle.includes("key:`lifecycle:${s.id}`"));
assert(lifecycle.includes("Participant sharing is unavailable, so the study was not put live."));
assert(lifecycle.includes("Participant access could not be confirmed, so the study was not put live."));
assert(lifecycle.includes("Participant sharing is unavailable, so the study remains off."));
assert(lifecycle.includes("Eve could not confirm participant access, so the study remains off."));
assert(lifecycle.includes("EveTx.run({"));

assert(archive.includes("key:`archive:${id}`")||archive.includes("EveTx.begin(`archive:${id}`)"));
assert(archive.includes("It remains in Archive."));
assert(archive.includes("ctx=>Object.assign(s,ctx.snapshot)"));
assert(archive.includes("const before={"));
assert(archive.includes("if(!persisted){"));
assert(archive.includes("The archived record has been retained so the problem is visible."));

assert(app.includes("saveGlobalAiConfig(this)"));
assert(app.includes("saveGlobalEmailSettings({button:this})"));
assert(app.includes("sendGlobalTestEmail(this)"));
assert(app.includes("setAsyncButtonState(button,true,'Saving…')"));
assert(app.includes("setAsyncButtonState(button,true,'Sending…')"));

assert(css.includes('/* v55.4.0 · Reliability hardening */'));
assert(css.includes('button[aria-busy="true"]'));

console.log('v55.4 reliability hardening tests passed');
