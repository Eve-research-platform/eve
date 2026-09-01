'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const client=fs.readFileSync(path.join(__dirname,'..','app','cloud-storage.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'..','app','app.js'),'utf8');
const index=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
const sw=fs.readFileSync(path.join(__dirname,'..','app','sw.js'),'utf8');
const {providerKey,mergeStudies,mergeById,compareCloudLocal}=require('../app/cloud-storage.js');

assert.equal(providerKey('Google Drive'),'google');
assert.equal(providerKey('SharePoint'),'microsoft');

const merged=mergeStudies(
 [{id:'a',updatedAt:10,value:'old'},{id:'local',updatedAt:5}],
 [{id:'a',updatedAt:20,value:'new'},{id:'cloud',updatedAt:3}]
);
assert.equal(merged.find(x=>x.id==='a').value,'new');
assert(merged.some(x=>x.id==='local'));
assert(merged.some(x=>x.id==='cloud'));

const responses=mergeById(
 [{id:'r1',submittedAt:10,value:'local'}],
 [{id:'r1',submittedAt:20,value:'cloud'},{id:'r2',submittedAt:4}]
);
assert.equal(responses.find(x=>x.id==='r1').value,'cloud');
assert.equal(responses.length,2);
assert.equal(compareCloudLocal({digest:'x'},{digest:'x'}),'aligned');
assert.equal(compareCloudLocal({studyCount:0,responseCount:0,latestActivity:0},{studyCount:1,responseCount:0,latestActivity:5}),'cloud-newer');
assert.equal(compareCloudLocal({studyCount:1,responseCount:0,latestActivity:10},{studyCount:1,responseCount:0,latestActivity:5}),'browser-newer');

assert(index.includes('<script src="cloud-storage.js"></script>'));
assert(sw.includes("'./cloud-storage.js'"));
assert(app.includes('globalThis.EveCloud?.scheduleAll?.()'));
assert(app.includes('globalThis.EveCloud?.scheduleForStudy?.(response.studyId)'));
assert(app.includes('globalThis.EveCloud?.storagePage'));
assert(!app.includes('simulateStorageConnection'));
assert(!app.includes('MVP simulation'));

assert(client.includes('`/api/connectors/${p}/start`'));
assert(client.includes("providerKey(value)"));
assert(client.includes('/api/connectors/microsoft/site'));
assert(client.includes('/api/connectors/microsoft/location'));
assert(client.includes("workspace.eve.json"));
assert(client.includes("recovery.eve.json"));
assert(client.includes("PBKDF2-SHA256"));
assert(client.includes("Reconcile safely"));
assert(client.includes("recordingPaths"));
assert(client.includes("encryption:'study-version-key'"));
assert(client.includes("connectors:{google:null,microsoft:null}"));
assert(client.includes("deleteStudyData"));

console.log('v53.7 cloud connector client tests passed');
