'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..'),read=(...p)=>fs.readFileSync(path.join(root,...p),'utf8');

const context={globalThis:null,EveDeployment:{mode:()=> 'google-workspace'},esc:v=>String(v||'')};
context.globalThis=context;
vm.createContext(context);
vm.runInContext(read('app','eve-capabilities.js'),context);

const caps=context.EveCapabilities;
assert.equal(caps.supports('storage'),true);
assert.equal(caps.supports('participantRelay'),true);
for(const feature of ['recording','panel','email','ai','collaboration','sso','recruitment','navigationCapture'])
  assert.equal(caps.supports(feature),false,`${feature} should be unavailable in Google Workspace`);

assert.equal(caps.blockSupport('recording').supported,false);
assert.equal(caps.blockSupport('panelSignup').supported,false);
assert.equal(caps.blockSupport('treeTest').supported,true);

context.EveDeployment.mode=()=> 'standard';
context.state={setup:{relayMode:'cloudflare'}};
assert.equal(caps.supports('panel'),false);
assert(/standalone Cloudflare relay/.test(caps.note('panel')));
context.state={setup:{relayMode:'local'}};
assert.equal(caps.supports('panel'),true);
context.EveDeployment.mode=()=> 'google-workspace';

let issues=caps.studyIssues({blocks:[
  {type:'recording'},
  {type:'navigationTask',navigationRecordAudio:true,navigationRecordVideo:false,navigationRecordScreen:false}
]});
assert(issues.some(x=>/Audio\/video recording/.test(x)));
assert(issues.some(x=>/Navigation recording/.test(x)));

const state={globalSettings:{defaultAi:'full'}};
caps.applyDefaults(state);
assert.equal(state.globalSettings.defaultAi,'off');

const app=read('app','app.js'),index=read('app','index.html'),css=read('app','eve-capabilities.css'),sw=read('app','sw.js');
assert(index.indexOf('eve-capabilities.js')>index.indexOf('eve-deployment.js'));
assert(index.indexOf('eve-capabilities.js')<index.indexOf('eve-setup.js'));
assert(app.includes("EveCapabilities.blockSupport(type)"));
assert(app.includes("EveCapabilities.studyIssues(s)"));
assert(app.includes("EveCapabilities.supports('recording')"));
assert(app.includes("EveCapabilities.supports('navigationCapture')"));
assert(app.includes("EveCapabilities.supports('panel')"));
assert(app.includes("EveCapabilities.applyDefaults(state)"));
assert(app.includes("app.dataset.deployment=EveCapabilities.deploymentMode()"));
assert(app.includes("Example study — try Eve"));
assert(!app.includes("Pension information architecture"));
assert(css.includes('[data-deployment="google-workspace"] .global-ai-card'));
assert(css.includes('[data-deployment="google-workspace"] .global-email-card'));
assert(sw.includes('eve-shell-v62-5-0-full'));
assert(sw.includes('./eve-capabilities.js'));
assert(sw.includes('./eve-capabilities.css'));

console.log('v59.2 deployment capability gating tests passed');
