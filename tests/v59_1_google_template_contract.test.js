'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'),read=(...p)=>fs.readFileSync(path.join(root,...p),'utf8');
const code=read('google-workspace','Code.gs'),launcher=read('google-workspace','Launcher.html');
const deploy=read('app','eve-deployment.js'),setup=read('app','eve-setup.js'),app=read('app','app.js');
const manifest=JSON.parse(read('google-workspace','appsscript.json'));

for(const fn of ['onOpen','eveShowSetup','evePrepareInstallation','eveLauncherState','ensureCopyIdentity_','newOwnerKey_'])
  assert(code.includes(`function ${fn}`),`missing launcher function ${fn}`);
assert(code.includes("createMenu('Eve')"));
assert(code.includes("addItem('Set up / open Eve'"));
assert(code.includes("'#/install?o='"));
assert(code.includes("participantUrl: appUrl"));
assert(code.includes("singleDeployment: true"));
assert(code.includes("PropertiesService.getUserProperties()"));
assert(code.includes("EVE_PROP_BOUND_FILE"));
assert(code.includes("function requireResearcherOwner_(ownerKey)"));
assert(!/requireResearcherOwner_\(ownerKey\)[\s\S]{0,300}activeResearcherEmail_/.test(code),'single deployment must authorize workspace by owner capability, not participant identity');

assert(launcher.includes('Set up your private Eve'));
assert(launcher.includes('Deploy Eve once as a web app'));
assert(launcher.includes('Open Eve'));
assert(launcher.includes('evePrepareInstallation'));
assert(launcher.includes('eveLauncherState'));

assert(deploy.includes('consumeInstallCapability'));
assert(deploy.includes("script?.history?.replace"));
assert(deploy.includes('initialiseSingleDeployment'));
assert(deploy.includes('one Apps Script web-app deployment'));
assert(!deploy.includes('second public web-app deployment'));
assert(setup.includes("next.relayMode='google-workspace'"));
assert(!setup.includes("['cloudflare','google-workspace'].includes(next.relayMode)"));
assert(deploy.includes('consumeInstallCapability'));
assert(deploy.includes('initialiseAppState'));
assert(app.includes('EveDeployment.initialiseAppState'));
assert(manifest.oauthScopes.includes('https://www.googleapis.com/auth/spreadsheets.currentonly'));

assert(fs.existsSync(path.join(root,'google-workspace','TEMPLATE_PUBLISHING.md')));
console.log('v59.1 single-deployment/template source contract passed');
