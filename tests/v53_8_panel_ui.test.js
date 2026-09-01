'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const app=fs.readFileSync(path.join(__dirname,'..','app','app.js'),'utf8');
const submit=fs.readFileSync(path.join(__dirname,'..','app','eve-participant-submit.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','app','styles.css'),'utf8');
const routes=fs.readFileSync(path.join(__dirname,'..','v52_routes.js'),'utf8');
const panel=fs.readFileSync(path.join(__dirname,'..','lib','participant_panel.js'),'utf8');
const {blockIssues}=require('../app/app.js');

assert.deepEqual(blockIssues({
  type:'panelSignup',panelIntro:'Join us',panelTermsEnabled:true,panelTerms:'Terms',
  panelConsentLabel:'I agree',panelWelcomeSubject:'Welcome',panelWelcomeMessage:'Thanks'
}),[]);
assert(blockIssues({type:'panelSignup',panelIntro:'',panelTermsEnabled:true,panelTerms:'',panelConsentLabel:'',panelWelcomeSubject:'',panelWelcomeMessage:''}).length>=3);

assert(app.includes("panelSignup:'Panel sign-up'"));
assert(app.includes('data-add-search-count>19 step types'));
assert(app.includes("['panelSignup','participants','Panel sign-up'"));
assert(app.includes("panelTermsEnabled:true"));
assert(app.includes("panelWelcomeSubject:''"));
assert(app.includes('Add terms and conditions'));
assert(app.includes('WELCOME EMAIL'));
assert(app.includes('Remove me from the research panel'));
assert(app.includes('Use Global Settings default'));
assert(app.includes('data-panel-signup='));
assert(app.includes('Joining is optional'));
assert(app.includes("name=\"${b.id}__panel_email\""));
assert(submit.includes("value={joined,email:joined?"));
assert(app.includes("panelStudyToken:s.panelStudyToken||''"));
assert(app.includes('preparePanelStudyRegistration'));
assert(app.includes("'/api/panel/register-study'"));
assert(app.includes("'/api/panel/join'"));
assert(app.includes("'/api/panel/participation'"));
assert(app.includes('notifyPanelAfterCompletion'));
assert(app.includes('Participant panel'));
assert(app.includes('panelMemberStudies'));
assert(app.includes('Studies participated in'));
assert(app.includes('Remove from panel'));
assert(app.includes('Participant removed and notified'));
assert(app.includes('A study can only contain one Panel sign-up block'));

assert(routes.includes("require('./lib/participant_panel')"));
assert(routes.includes('createParticipantPanel'));
assert(routes.includes('panel.handle'));
assert(panel.includes('/api/panel/remove/'));
assert(panel.includes('welcomeSubject'));
assert(panel.includes('welcomeMessage'));
assert(panel.includes("member.status='removed'"));
assert(panel.includes('removal_email_failed'));

assert(css.includes('/* v53.8.0 · Participant Panel */'));
assert(css.includes('.panel-signup-builder'));
assert(css.includes('.panel-directory-card'));
assert(css.includes('.panel-member-summary'));

console.log('v53.8 participant panel UI tests passed');
