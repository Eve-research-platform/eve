'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const read=(...p)=>fs.readFileSync(path.join(root,...p),'utf8');
const app=read('app','app.js'),setup=read('app','eve-setup.js'),deployment=read('app','eve-deployment.js'),cloud=read('app','cloud-storage.js'),index=read('app','index.html'),sw=read('app','sw.js');
const code=read('google-workspace','Code.gs'),gIndex=read('google-workspace','Index.html'),gStyles=read('google-workspace','Styles.html'),gScripts=read('google-workspace','Scripts.html'),manifest=read('google-workspace','appsscript.json');

assert(index.indexOf('eve-deployment.js')<index.indexOf('eve-setup.js'));
assert(index.indexOf('eve-deployment.js')<index.indexOf('app.js'));
assert(sw.includes('eve-shell-v62-5-0-full'));
assert(sw.includes('./eve-deployment.js'));

assert(deployment.includes("if(hasAppsScript())return'google-workspace'"));
assert(deployment.includes("EVE_RUNTIME_CONFIG"));
assert(deployment.includes("appsScriptCall('eveRelayRequest'"));
assert(deployment.includes("appsScriptCall('eveStorageWrite'"));
assert(deployment.includes('providerSetupStep'));
assert(deployment.includes('googleWelcomeStep'));
assert(deployment.includes('google.script.url.getLocation'));
assert(setup.includes("next.relayMode='google-workspace'"));
assert(setup.includes('Public participant deployment URL')===false,'Google-specific setup markup should stay extracted from eve-setup.js');
assert(app.includes('EveDeployment.relayFetch'));
assert(app.includes('EveDeployment.participantBaseUrl'));
assert(app.includes('EveDeployment.currentHash'));
assert(app.includes("!EveDeployment?.isGoogleWorkspace?.()"));
assert(cloud.includes("p==='google'&&global.EveDeployment?.isGoogleWorkspace?.()"));
assert(cloud.includes('global.EveDeployment.storageWrite'));
assert(cloud.includes('global.EveDeployment.storageRead'));
assert(cloud.includes('global.EveDeployment.storageList'));
assert(cloud.includes('global.EveDeployment.googleStoragePage'));

for(const fn of ['doGet','include','eveBootstrap','eveStorageWrite','eveStorageRead','eveStorageList','eveRelayRequest'])
  assert(code.includes(`function ${fn}`),`Apps Script function missing ${fn}`);
assert(code.includes("Session.getActiveUser().getEmail()"));
assert(code.includes('EVE_OWNER_HASH'));
assert(code.includes("Participant Panel is not available through the standalone Google Workspace response service yet."));
assert(code.includes("mode:'google-workspace-zero-access-relay'"));
assert(gIndex.includes("include('Styles')"));
assert(gIndex.includes("include('Scripts')"));
assert(gStyles.length>100000);
assert(gScripts.includes('eve-deployment.js'));
assert(gScripts.includes('EveDeployment.relayFetch'));
const manifestJson=JSON.parse(manifest);
assert(manifestJson.oauthScopes.some(x=>x.includes('/auth/drive')));
assert(fs.existsSync(path.join(root,'google-workspace','README.md')));
assert(fs.existsSync(path.join(root,'google-workspace','SETUP_CHECKLIST.md')));

console.log('v59 Google Workspace zero-install source contract passed');
