'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const budget=JSON.parse(fs.readFileSync(path.join(root,'architecture-budget.json'),'utf8'));

for(const [file,rule] of Object.entries(budget.ratchets)){
  const p=path.join(root,file),text=fs.readFileSync(p,'utf8');
  const bytes=Buffer.byteLength(text),lines=text.trimEnd().split(/\r?\n/).length;
  assert(bytes<=rule.maxBytes,`${file} grew to ${bytes} bytes; budget is ${rule.maxBytes}`);
  assert(lines<=rule.maxLines,`${file} grew to ${lines} lines; budget is ${rule.maxLines}`);
}

const index=fs.readFileSync(path.join(root,'app','index.html'),'utf8');
const polish=fs.readFileSync(path.join(root,'app','eve-v56-polish.css'),'utf8');
assert(index.includes('<link rel="stylesheet" href="eve-v56-polish.css" />'));
assert(index.indexOf('eve-v54-theme.css')<index.indexOf('eve-v56-polish.css'),'polish stylesheet must be the final style layer');
assert(index.includes('<script src="eve-transactions.js"></script>'));
assert(index.includes('<script src="eve-study-lifecycle.js"></script>'));
assert(index.includes('<script src="eve-archive-ops.js"></script>'));
assert(index.includes('<script src="eve-participant-delivery.js"></script>'));
assert(index.includes('<script src="eve-participant-submit.js"></script>'));
assert(index.indexOf('eve-transactions.js')<index.indexOf('eve-study-lifecycle.js'),'transaction runtime must load before lifecycle operations');
assert(index.indexOf('eve-study-lifecycle.js')<index.indexOf('eve-archive-ops.js'),'lifecycle operations must load before Archive operations');
assert(index.indexOf('eve-archive-ops.js')<index.indexOf('eve-participant-delivery.js'),'Archive operations must load before participant delivery');
assert(index.indexOf('eve-participant-delivery.js')<index.indexOf('eve-participant-submit.js'),'participant delivery must load before participant submit');
assert(index.indexOf('eve-participant-submit.js')<index.indexOf('app.js'),'participant submit must load before app.js');

const sw=fs.readFileSync(path.join(root,'app','sw.js'),'utf8');
assert(sw.includes("'./eve-transactions.js'"),'transaction runtime must be available offline');
assert(sw.includes("'./eve-study-lifecycle.js'"),'Study lifecycle operations must be available offline');
assert(sw.includes("'./eve-archive-ops.js'"),'Archive operations must be available offline');
assert(sw.includes("'./eve-participant-delivery.js'"),'Participant delivery must be available offline');
assert(sw.includes("'./eve-participant-submit.js'"),'Participant submit must be available offline');
assert(sw.includes("eve-shell-v62-5-0-full"));

const app=fs.readFileSync(path.join(root,'app','app.js'),'utf8');
assert(app.includes("require('./eve-transactions.js')"));
assert(app.includes("require('./eve-study-lifecycle.js')"));
assert(app.includes("require('./eve-archive-ops.js')"));
assert(app.includes("require('./eve-participant-delivery.js')"));
assert(app.includes("require('./eve-participant-submit.js')"));
const lifecycle=fs.readFileSync(path.join(root,'app','eve-study-lifecycle.js'),'utf8');
assert(lifecycle.includes('EveTx.run({'),'lifecycle production mutations must use the shared transaction primitive');
assert(lifecycle.includes("key:`lifecycle:${s.id}`"));
assert(app.includes('studyLifecycle.goLiveStudy(studyId)'));
assert(app.includes('studyLifecycle.turnOffStudy(studyId)'));
assert(app.includes('archiveOps.archiveStudy(id)'));
assert(!app.includes('const cloudProviders=Array.isArray(s.cloudSyncedProviders)'), 'Archive deletion policy must not leak back into app.js');
assert(!app.includes("const previousLatest=latestPublishedVersion(s),nextVersion"), 'Go-live publication decisions must not leak back into app.js');
assert(app.includes('participantSubmit.submitParticipant(e,studyId)'));
assert(!app.includes('const answers={};for(const b of activeBlocks)'), 'Participant answer serialization must not leak back into app.js');
assert(!app.includes('response.answers[b.id].value=await participantDelivery.persistRecording'), 'Participant recording submission orchestration must remain extracted');

console.log('v56 architecture ratchet tests passed');

assert(polish.includes('/* Eve v56.4 · Platform polish layer'));

const liveSecurity=fs.readFileSync(path.join(root,'lib','live_security.js'),'utf8');
assert(liveSecurity.includes('EVE_LIVE_MODE'));
assert(liveSecurity.includes('persistentDataPathConfigured'));
assert(liveSecurity.includes("'X-Frame-Options','DENY'"));
assert(liveSecurity.includes("'Content-Security-Policy'"));
assert(liveSecurity.includes("'panel-join'"));
assert(liveSecurity.includes("'study-publish'"));
