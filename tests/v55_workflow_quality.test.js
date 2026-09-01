'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const appSource=fs.readFileSync(path.join(__dirname,'..','app','app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','app','eve-v54-theme.css'),'utf8');
const capabilities=fs.readFileSync(path.join(__dirname,'..','app','eve-capabilities.js'),'utf8');
const {
  defaultStudy,studyBuildIssues,sendReadinessItems,
  latestPublishedVersion,versionedStudyData,studyAvailability
}=require('../app/app.js');

const s=defaultStudy();
assert.equal(studyBuildIssues(s).length,0,'default study should remain build-ready');

let readiness=sendReadinessItems(s,{mailLoaded:true,mailConfigured:true});
assert(readiness.find(x=>x.key==='build'&&x.state==='ready'));
assert(readiness.find(x=>x.key==='settings'&&x.state==='ready'));
assert(readiness.find(x=>x.key==='audience'&&x.state==='ready'));
assert(readiness.find(x=>x.key==='storage'&&!x.blocking),'storage health must not silently change existing go-live gating');

const q=s.blocks.find(b=>b.type==='question');
q.question='';
readiness=sendReadinessItems(s,{mailLoaded:true,mailConfigured:true});
assert(readiness.find(x=>x.key==='build'&&x.state==='attention'),'Build problems must surface in Send readiness');
q.question='How familiar are you with pensions?';

s.blocks.push({
  id:'panel-quality-test',pageId:s.pages[0].id,type:'panelSignup',title:'Join the panel',
  panelIntro:'Join our participant panel.',panelTermsEnabled:true,panelTerms:'Panel terms.',
  panelConsentLabel:'I agree to join the panel.',panelWelcomeSubject:'',panelWelcomeMessage:'',required:false
});
readiness=sendReadinessItems(s,{mailLoaded:true,mailConfigured:false});
assert(readiness.find(x=>x.key==='email'&&x.state==='attention'&&x.blocking),'Panel email must be an explicit launch blocker');
readiness=sendReadinessItems(s,{mailLoaded:true,mailConfigured:true});
assert(readiness.find(x=>x.key==='email'&&x.state==='ready'));

s.blocks=s.blocks.filter(b=>b.id!=='panel-quality-test');
s.version=1;
s.status='live';
s.publishedVersions={'1':{version:1,publishedAt:Date.now(),data:{...versionedStudyData(s),version:1,status:'live'}}};
assert.equal(latestPublishedVersion(s),1);
assert.equal(studyAvailability(s).available,true,'live version should remain participant-accessible');

assert(appSource.includes('function builderIssuePanel(s)'));
assert(appSource.includes('focusBuilderIssue('));
assert(appSource.includes('LAUNCH READINESS'));
assert(appSource.includes('function reviewEvidenceTrayMarkup'));
assert(appSource.includes('data-evidence="${esc(v)}"'));
assert(appSource.includes('openEvidenceInsightCapture(this)'));
assert(appSource.includes('WORKSPACE HEALTH')||capabilities.includes('WORKSPACE HEALTH'));
assert(appSource.includes('globalIntegrationHealthMarkup(a,m)'));

assert(css.includes('/* v55.0.0 · Workflow Quality */'));
assert(css.includes('.outline-quality{'));
assert(css.includes('.launch-readiness{'));
assert(css.includes('.review-evidence-tray{'));
assert(css.includes('.quote-insight-action{'));
assert(css.includes('.integration-health{'));

console.log('v55 workflow-quality tests passed');
