'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createControlPlane } = require('../lib/control_plane');
const { redact } = require('../lib/ai_gateway');

function json(res,status,data){res.status=status;res.data=data;res.headers=res.headers||{}}
function body(req){return Promise.resolve(req._body||{})}
function req(method,pathname,_body={},cookie=''){return {method,headers:{cookie},socket:{encrypted:false},_body}}
function res(){return {headers:{},setHeader(k,v){this.headers[k]=v}}}
function cookieFrom(r){const s=String(r.headers['Set-Cookie']||'');return s.split(';')[0]}

(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eve-v50-'));
 process.env.EVE_BOOTSTRAP_EMAIL='admin@example.test';
 process.env.EVE_BOOTSTRAP_PASSWORD='correct horse battery staple';
 process.env.EVE_ORG_NAME='Example Research';
 const cp=createControlPlane({dataDir:dir,json,body});

 let r=res();
 await cp.handle(req('POST','/api/auth/login',{email:'admin@example.test',password:'wrong'}),r,new URL('http://x/api/auth/login'));
 assert.equal(r.status,401);

 r=res();
 await cp.handle(req('POST','/api/auth/login',{email:'admin@example.test',password:'correct horse battery staple'}),r,new URL('http://x/api/auth/login'));
 assert.equal(r.status,200);
 const cookie=cookieFrom(r);
 assert(cookie.includes('eve_session='));

 r=res();
 await cp.handle(req('GET','/api/auth/me',{},cookie),r,new URL('http://x/api/auth/me'));
 assert.equal(r.status,200);
 assert.equal(r.data.membership.role,'admin');

 r=res();
 await cp.handle(req('POST','/api/org/invitations',{email:'researcher@example.test',role:'researcher'},cookie),r,new URL('http://x/api/org/invitations'));
 assert.equal(r.status,201);
 assert(r.data.token);

 const inviteToken=r.data.token;
 r=res();
 await cp.handle(req('POST','/api/org/invitations/accept',{token:inviteToken,name:'Researcher',password:'a strong researcher password'}),r,new URL('http://x/api/org/invitations/accept'));
 assert.equal(r.status,200);

 const clean=redact({email:'person@example.com',freeText:'Call me on +44 7700 900123',question:'What did you think?'});
 assert.equal(clean.email,'[identifier removed]');
 assert(!JSON.stringify(clean).includes('person@example.com'));
 assert(!JSON.stringify(clean).includes('7700 900123'));

 r=res();
 await cp.handle(req('PUT','/api/collaboration/study_123',{expectedRevision:0},cookie),r,new URL('http://x/api/collaboration/study_123'));
 assert.equal(r.status,200);
 assert.equal(r.data.revision.revision,1);

 r=res();
 await cp.handle(req('PUT','/api/collaboration/study_123',{expectedRevision:0},cookie),r,new URL('http://x/api/collaboration/study_123'));
 assert.equal(r.status,409);

 console.log('v50 foundation tests passed');
})().catch(e=>{console.error(e);process.exit(1)});
