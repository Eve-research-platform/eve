'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app','app.js'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const security=fs.readFileSync(path.join(root,'lib','live_security.js'),'utf8');
const platform=fs.readFileSync(path.join(root,'lib','platform_services.js'),'utf8');
const cloud=fs.readFileSync(path.join(root,'lib','cloud_connectors.js'),'utf8');
const theme=fs.readFileSync(path.join(root,'app','eve-v54-theme.css'),'utf8');

assert(app.includes('async function capabilityProof(value)'));
assert(app.includes('participantHash=await capabilityProof(versionKey)'));
assert(app.includes("'X-Eve-Participant':proof"));
assert(app.includes("headers['X-Eve-Participant']=proof"));

assert(server.includes('function participantOk(req,record,version)'));
assert(server.includes("req.headers['x-eve-participant']"));
assert(server.includes('MAX_RESPONSES_PER_STUDY'));
assert(server.includes('mode:0o700'));
assert(server.includes('mode:0o600'));
assert(server.includes('MAX_RECORDINGS_PER_STUDY'));
assert(server.includes("return json(res,507,{reason:'This study has reached its response storage limit.'})"));
assert(server.includes("return json(res,507,{reason:'This study has reached its recording storage limit.'})"));
assert(server.includes("url.pathname==='/api/readiness'"));
assert(server.includes('createPlatformServices'));
assert(platform.includes('createLiveSecurity'));

assert(security.includes("process.env.EVE_LIVE_MODE"));
assert(security.includes("process.env.RESEARCHOS_RELAY_DATA"));
assert(security.includes("process.env.EVE_PUBLIC_ORIGIN"));
assert(security.includes("'X-Frame-Options','DENY'"));
assert(security.includes("'Strict-Transport-Security'"));
assert(security.includes("'Content-Security-Policy'"));
assert(security.includes("'Permissions-Policy'"));
assert(security.includes("'auth-login'"));
assert(security.includes("'study-publish'"));
assert(security.includes("'panel-join'"));
assert(security.includes("`response:${m[1]}`"));
assert(security.includes("`recording:${m[1]}`"));

assert(cloud.includes("authConfigured = () => false"));
assert(cloud.includes("roleOrLocal(req, res, role"));
assert.equal(theme.includes('fonts.googleapis.com'),false,'live build must not depend on Google Fonts');

console.log('v56.5 production security contract passed');
