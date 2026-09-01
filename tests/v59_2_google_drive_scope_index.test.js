'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'),read=(...p)=>fs.readFileSync(path.join(root,...p),'utf8');
const code=read('google-workspace','Code.gs');
const manifest=JSON.parse(read('google-workspace','appsscript.json'));

assert(manifest.oauthScopes.includes('https://www.googleapis.com/auth/drive.file'));
assert(manifest.oauthScopes.includes('https://www.googleapis.com/auth/script.external_request'));
assert(!manifest.oauthScopes.includes('https://www.googleapis.com/auth/drive'));
assert(!code.includes('DriveApp.'),'Google runtime should no longer require broad DriveApp access');
assert(code.includes('ScriptApp.getOAuthToken()'));
assert(code.includes('https://www.googleapis.com/drive/v3/files'));
assert(code.includes('function driveStore_()'));
assert(code.includes('__EVE_TEST_DRIVE__'));

assert(code.includes('function responseIndexPath_'));
assert(code.includes('function responseIndex_'));
assert(code.includes("writeJsonPath_(relayRoot_(),responseIndexPath_(slug),index)"));
const responseGet=code.slice(code.indexOf("if (method === 'GET')",code.indexOf('function handleResponses_')),code.indexOf("return relayJson_(405",code.indexOf('function handleResponses_')));
assert(responseGet.includes('responseIndex_(slug,true)'));
assert(responseGet.includes('index.slice(offset,offset+limit)'));
assert(!responseGet.includes("listJsonFolder_('responses/'+slug)"),'normal paged GET should not re-read every response file');

console.log('v59.2 Google drive.file + response index contract passed');
