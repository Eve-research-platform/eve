'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','app','app.js'),'utf8');
const ops=fs.readFileSync(path.join(__dirname,'..','app','eve-archive-ops.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','app','styles.css'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
const {isStudyArchived,archiveDaysRemaining}=require('../app/app.js');

assert.equal(isStudyArchived({archivedAt:null}),false);
assert.equal(isStudyArchived({archivedAt:Date.now()}),true);
const now=Date.now();
assert.equal(archiveDaysRemaining({archivedAt:now,archivePurgeAt:now+30*24*60*60*1000},now),30);
assert.equal(archiveDaysRemaining({archivedAt:now,archivePurgeAt:now-1},now),0);

assert(src.includes("h==='/archive'"));
assert(src.includes("'/archive','archive','Archive'"));
assert(src.includes('function archivePage()'));
assert(src.includes('function archiveStudy(id){return archiveOps.archiveStudy(id)}'));
assert(src.includes('function restoreArchivedStudy(id){return archiveOps.restoreArchivedStudy(id)}'));
assert(src.includes('function purgeArchivedStudy(id,options){return archiveOps.purgeArchivedStudy(id,options)}'));
assert(src.includes('function purgeExpiredArchivedStudies(){return archiveOps.purgeExpiredArchivedStudies()}'));
assert(ops.includes('async function archiveStudy(id)'));
assert(ops.includes('async function restoreArchivedStudy(id)'));
assert(ops.includes('async function purgeArchivedStudy(id'));
assert(ops.includes('async function purgeExpiredArchivedStudies()'));
assert(src.includes('await purgeExpiredArchivedStudies();'));
assert(src.includes('ARCHIVE_RETENTION_MS=30*24*60*60*1000'));
assert(ops.includes("state.findings=(state.findings||[]).filter(f=>f.studyId!==id)"));
assert(ops.includes("state.participantSegments=(state.participantSegments||[]).filter(seg=>seg?.rules?.studyId!==id)"));
assert(ops.includes("s.status=from==='live'?'closed':from"));
assert(!src.includes("onclick=\"event.stopPropagation();deleteStudy("));

assert(server.includes("if(req.method==='DELETE')"));
assert(server.includes("fs.rmSync(responsePath(slug),{recursive:true,force:true})"));
assert(server.includes("fs.rmSync(recordingPath(slug),{recursive:true,force:true})"));
assert(server.includes("fs.rmSync(inviteFile(slug),{force:true})"));
assert(css.includes('/* v53.6.0 · Study Archive */'));
assert(css.includes('.archive-study-card'));

console.log('v53.6 archive tests passed');
