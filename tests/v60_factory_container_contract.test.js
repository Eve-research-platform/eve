'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..'),read=(...p)=>fs.readFileSync(path.join(root,...p),'utf8');

const docker=read('Dockerfile'),google=read('deploy','google','deploy.sh'),tutorial=read('deploy','google','tutorial.md');
const azure=JSON.parse(read('deploy','azure','azuredeploy.json')),factory=read('index.html'),factoryJs=read('deployment.js'),factoryCfg=read('deployment-config.js'),workflow=read('.github','workflows','publish-beta.yml');

assert(docker.includes('node:20-bookworm-slim'));
assert(docker.includes('USER node'));
assert(docker.includes('RESEARCHOS_RELAY_DATA=/data/eve'));
assert(docker.includes('HEALTHCHECK'));

assert(google.includes('gcloud run deploy'));
assert(google.includes('gcloud builds submit'));
assert(google.includes('secretmanager.googleapis.com'));
assert(google.includes('type=cloud-storage'));
assert(google.includes('--max="${MAX_INSTANCES}"'));
assert(google.includes('EVE_DEPLOYMENT_MODE=organisation-cloud'));
assert(google.includes('EVE_CLOUD_PROVIDER=google-cloud'));
assert(google.includes('EVE_DEFAULT_STORAGE_PROVIDER=organisation'));
assert(google.includes('EVE_ORG_STORAGE_ENABLED=true'));
assert(google.includes('EVE_LIVE_MODE=false'));
assert(google.includes('EVE_LIVE_MODE=true'));
assert(tutorial.includes('complete Eve platform'));

const types=azure.resources.map(x=>x.type);
assert(types.includes('Microsoft.App/containerApps'));
assert(types.includes('Microsoft.App/managedEnvironments/storages'));
assert(types.includes('Microsoft.Storage/storageAccounts/fileServices/shares'));
const app=azure.resources.find(x=>x.type==='Microsoft.App/containerApps');
assert.equal(app.properties.template.scale.maxReplicas,"[parameters('maxReplicas')]");
const env=Object.fromEntries(app.properties.template.containers[0].env.map(x=>[x.name,x]));
assert.equal(env.EVE_DEPLOYMENT_MODE.value,'organisation-cloud');
assert.equal(env.EVE_CLOUD_PROVIDER.value,'azure');
assert.equal(env.EVE_DEFAULT_STORAGE_PROVIDER.value,'organisation');
assert.equal(env.EVE_ORG_STORAGE_ENABLED.value,'true');
assert.equal(env.EVE_BOOTSTRAP_PASSWORD.secretRef,'bootstrap-password');
assert.equal(env.EVE_CONNECTOR_SECRET.secretRef,'connector-secret');
assert(app.properties.template.volumes.some(x=>x.storageType==='AzureFile'));

assert(factory.includes('Create your Eve.'));
assert(factory.includes('Where should Eve run?'));
assert(factory.includes('Create Eve on Google Cloud'));
assert(factory.includes('Microsoft Azure'));
assert(factory.includes("Your organisation's cloud"));
assert(factory.includes('This computer'));
assert(!factoryJs.includes('crypto.getRandomValues'));
assert.equal(azure.parameters.connectorSecret.defaultValue,'[newGuid()]');
assert(azure.parameters.databaseAdminPassword.defaultValue.includes('newGuid()'));
assert(factoryJs.includes('deploy.cloud.run'));
assert(factoryJs.includes('shell.cloud.google.com/cloudshell/editor'));
assert(factory.includes('Advanced fallback: Cloud Shell'));
assert(factoryJs.includes('portal.azure.com/#create/Microsoft.Template/uri/'));
assert(factoryCfg.includes('ghcr.io/OWNER/REPOSITORY:beta'));

assert(workflow.includes('docker/build-push-action@v6'));
assert(workflow.includes('ghcr.io/'));
assert(workflow.includes('actions/attest-build-provenance@v2'));

const ctx={globalThis:null,EveDeployment:{mode:()=> 'organisation-cloud'},state:{setup:{relayMode:'organisation'}},esc:v=>String(v||'')};ctx.globalThis=ctx;
vm.createContext(ctx);vm.runInContext(read('app','eve-capabilities.js'),ctx);
for(const f of ['recording','panel','email','ai','collaboration','sso','recruitment','navigationCapture'])
  assert.equal(ctx.EveCapabilities.supports(f),true,`${f} should remain available in full organisation cloud`);

const deployment=read('app','eve-deployment.js'),setup=read('app','eve-setup.js'),index=read('app','index.html');
assert(deployment.includes("isOrganisationCloud"));
assert(deployment.includes("Full Eve capability set"));
assert(setup.includes("relayMode='organisation'"));
assert(index.includes('eve-runtime-config.js'));

console.log('v60 full container + Eve Factory deployment contract passed');
