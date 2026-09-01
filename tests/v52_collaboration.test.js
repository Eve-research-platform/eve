'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {createControlPlane}=require('../lib/control_plane');
const {createCollaborationV2,conflict}=require('../lib/collaboration_v2');

function json(res,status,data){res.status=status;res.data=data;res.headers=res.headers||{}}
function body(req){return Promise.resolve(req._body||{})}
function req(method,_body={},cookie=''){return {method,headers:{cookie,host:'eve.example.test'},socket:{encrypted:false},_body}}
function res(){return {headers:{},setHeader(k,v){this.headers[k]=v}}}
function cookieFrom(r){return String(r.headers['Set-Cookie']||'').split(';')[0]}

(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eve-v52-collab-'));
 process.env.EVE_BOOTSTRAP_EMAIL='admin@example.test';
 process.env.EVE_BOOTSTRAP_PASSWORD='correct horse battery staple';
 process.env.EVE_ORG_NAME='Example';
 const cp=createControlPlane({dataDir:dir,json,body});
 let r=res();
 await cp.handle(req('POST',{email:'admin@example.test',password:'correct horse battery staple'}),r,new URL('http://x/api/auth/login'));
 assert.equal(r.status,200);const cookie=cookieFrom(r);
 const c=createCollaborationV2({dataDir:dir,json,body,requireRole:cp.requireRole,appendAudit:cp.appendAudit});

 // Two different blocks on the same page are independently editable.
 assert.equal(conflict({resourceId:'block:a',parentResourceId:'page:p1'},{resourceId:'block:b',parentResourceId:'page:p1'}),false);
 // Page/structure changes correctly conflict with child edits.
 assert.equal(conflict({resourceId:'page:p1'},{resourceId:'block:a',parentResourceId:'page:p1'}),true);
 assert.equal(conflict({resourceId:'study:structure'},{resourceId:'block:a',parentResourceId:'page:p1'}),true);

 r=res();
 await c.handle(req('POST',{clientId:'tabA',parentResourceId:'page:p1'},cookie),r,new URL('http://x/api/collaboration-v2/study1/resources/block%3Aa/lease'));
 assert.equal(r.status,200);

 r=res();
 await c.handle(req('POST',{clientId:'tabB',parentResourceId:'page:p1'},cookie),r,new URL('http://x/api/collaboration-v2/study1/resources/block%3Ab/lease'));
 assert.equal(r.status,200);

 r=res();
 await c.handle(req('POST',{clientId:'tabB'},cookie),r,new URL('http://x/api/collaboration-v2/study1/resources/page%3Ap1/lease'));
 assert.equal(r.status,409);
 assert.equal(r.data.error,'resource_edit_locked');

 r=res();
 await c.handle(req('PUT',{expectedRevision:0,parentResourceId:'page:p1'},cookie),r,new URL('http://x/api/collaboration-v2/study1/resources/block%3Aa/revision'));
 assert.equal(r.status,200);assert.equal(r.data.revision.revision,1);

 r=res();
 await c.handle(req('PUT',{expectedRevision:0,parentResourceId:'page:p1'},cookie),r,new URL('http://x/api/collaboration-v2/study1/resources/block%3Aa/revision'));
 assert.equal(r.status,409);assert.equal(r.data.error,'resource_revision_conflict');

 console.log('v52 granular collaboration tests passed');
})().catch(e=>{console.error(e);process.exit(1)});
