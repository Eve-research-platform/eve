'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const read=(...parts)=>fs.readFileSync(path.join(root,...parts),'utf8');

delete global.EveSetup;
require(path.join(root,'app','eve-setup.js'));
assert(global.EveSetup);

let setup=EveSetup.normalise(null,{legacy:false});
assert.equal(setup.completed,false);
assert.equal(setup.relayMode,'cloudflare');
assert.equal(EveSetup.needsOnboarding(setup),true);

const legacy=EveSetup.normalise(null,{legacy:true});
assert.equal(legacy.completed,true);
assert.equal(legacy.relayMode,'local');

const appState={setup:{relayMode:'cloudflare',relayUrl:'https://relay.example.workers.dev/',participantAppUrl:'',relayOwnerKey:'owner-secret'}};
assert.equal(EveSetup.relayUrl(appState,'/api/health'),'https://relay.example.workers.dev/api/health');
assert.equal(EveSetup.participantBaseUrl(appState),'https://relay.example.workers.dev');
assert.equal(EveSetup.ownerHeaders(appState,{'X-Test':'1'})['X-Eve-Owner'],'owner-secret');

const app=read('app','app.js'),index=read('app','index.html'),sw=read('app','sw.js'),setupJs=read('app','eve-setup.js'),setupCss=read('app','eve-setup.css'),cloud=read('app','cloud-storage.js'),capabilities=read('app','eve-capabilities.js');

assert(app.includes("legacySetup=!!loaded.exists&&!loaded.data?.setup"));
assert(app.includes("EveSetup.needsOnboarding(state.setup)"));
assert(app.includes("state.view==='setup'?EveSetup.view()"));
assert(app.includes("if(h==='/setup'){state.view='setup';return}"));
assert(app.includes("EveDeployment.relayFetch(RELAY_HEALTH"));
assert(app.includes("EveDeployment.participantBaseUrl(state)"));
assert(app.includes("EveSetup.ownerHeaders(state"));
assert(capabilities.includes("standalone Cloudflare relay"));

for(const route of ['/responses','/recordings','/invitations','/status'])
  assert(app.includes(route),`relay route missing ${route}`);

assert(index.indexOf('eve-setup.css')>index.indexOf('eve-study-themes.css'));
assert(index.indexOf('eve-setup.js')<index.indexOf('app.js'));
assert(sw.includes('eve-shell-v62-5-0-full'));
assert(sw.includes('./eve-setup.css'));
assert(sw.includes('./eve-setup.js'));

assert(setupJs.includes('FIRST-TIME SETUP'));
assert(setupJs.includes('Cloudflare relay'));
assert(setupJs.includes('Download relay setup file'));
assert(setupJs.includes('Download portable backup'));
assert(setupJs.includes('Run checks'));
assert(setupCss.includes('.setup-shell'));
assert(cloud.includes('Return to setup'));

for(const f of ['cloudflare-relay/wrangler.toml','cloudflare-relay/src/worker.mjs','cloudflare-relay/deploy-relay.bat','cloudflare-relay/deploy-relay.sh','cloudflare-relay/README.md'])
  assert(fs.existsSync(path.join(root,f)),`${f} missing`);

console.log('v58 downloadable first-run setup/distribution contract passed');
