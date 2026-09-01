'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const appSource=fs.readFileSync(path.join(root,'app','app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'app','eve-v54-theme.css'),'utf8');
const {defaultStudy,studyNextAction,studyDisplayStatus}=require('../app/app.js');

const draft=defaultStudy();
assert.equal(studyDisplayStatus(draft),'Draft');

let action=studyNextAction(draft);
assert.equal(action.stage,'send');
assert.equal(action.label,'Prepare to go live');

const question=draft.blocks.find(b=>b.type==='question');
question.question='';
action=studyNextAction(draft);
assert.equal(action.stage,'build');
assert.equal(action.label,'Continue building');
question.question='How familiar are you with pensions?';

draft.status='closed';
assert.equal(studyDisplayStatus(draft),'Off');
action=studyNextAction(draft);
assert.equal(action.stage,'send');
assert.equal(action.label,'Go live again');

draft.status='live';
action=studyNextAction(draft);
assert.equal(action.stage,'send');
assert.equal(action.label,'Manage live study');

draft.hasUnpublishedChanges=true;
action=studyNextAction(draft);
assert.equal(action.stage,'send');
assert.equal(action.label,'Update live study');

assert(appSource.includes('function homeNeedsYou(studies)'));
assert(appSource.includes('class="needs-row needs-action"'));
assert(appSource.includes("label:'Email settings',path:'/settings'"));
assert(appSource.includes("label:'Open Archive',path:'/archive'"));
assert(appSource.includes('class="study-next-action ${esc(action.tone||\'neutral\')}"'));
assert(appSource.includes('studyDisplayStatus(stageStudy)'));
assert(appSource.includes(">Off ${counts.closed}</button>"));
assert(appSource.includes("eveIcon('archive',17)"));
assert(appSource.includes("eveIcon('clock',20)"));
assert.equal(appSource.includes('>Closed ${counts.closed}</button>'),false);
assert.equal(appSource.includes('archive-box-icon" aria-hidden="true">▤'),false);

assert(css.includes('/* v55.3.0 · Operational clarity */'));
assert(css.includes('.study-next-action{'));
assert(css.includes('.needs-row.needs-action{'));
assert(css.includes('.study-flow .flow-step.complete:not(.active){'));
assert(css.includes('.study-flow .flow-step.complete:not(.active) .flow-num{'));
assert(css.includes('.study-flow .flow-line.complete{'));

console.log('v55.3 operational clarity tests passed');
