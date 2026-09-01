'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..'),read=(...p)=>fs.readFileSync(path.join(root,...p),'utf8');

const server=read('server.js'),platform=read('lib','platform_services.js'),cloud=read('app','cloud-storage.js'),deployment=read('app','eve-deployment.js'),setup=read('app','eve-setup.js');
const google=read('deploy','google','deploy.sh'),azure=JSON.parse(read('deploy','azure','azuredeploy.json')),runtime=read('lib','runtime_config.js');

assert(platform.includes('createOrganisationStorage'));
assert(server.includes('organisationStorage.handle'));
assert(cloud.includes("return'organisation'"));
assert(cloud.includes('/api/organisation-storage/files'));
assert(cloud.includes("setDefaultProvider('organisation')"));
assert(deployment.includes("defaultStorageProvider='organisation'"));
assert(deployment.includes('No OAuth client required'));
assert(setup.includes("storageProvider=cfg.organisationStorage?.enabled!==false?'organisation'"));

assert(google.includes('EVE_DEFAULT_STORAGE_PROVIDER=organisation'));
assert(google.includes('EVE_ORG_STORAGE_ENABLED=true'));
assert(google.includes('No Google OAuth client is required to start researching'));
assert(!google.includes("Configure your organisation's Google Drive OAuth client in Eve before using Drive sync."));

const app=azure.resources.find(x=>x.type==='Microsoft.App/containerApps');
const env=Object.fromEntries(app.properties.template.containers[0].env.map(x=>[x.name,x.value||x.secretRef]));
assert.equal(env.EVE_DEFAULT_STORAGE_PROVIDER,'organisation');
assert.equal(env.EVE_ORG_STORAGE_ENABLED,'true');

assert(runtime.includes('organisationStorage'));
assert(runtime.includes('EVE_ORG_STORAGE_ENABLED'));
assert(runtime.includes('EVE_ORG_STORAGE_LABEL'));

console.log('v60.1 OAuth-free organisation storage contract passed');
