'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const app=fs.readFileSync(path.join(__dirname,'..','app','app.js'),'utf8');
const runtime=fs.readFileSync(path.join(__dirname,'..','app','eve-v53-runtime.js'),'utf8');

function between(startMarker,nextMarker){
  const start=app.indexOf(startMarker);
  assert(start>=0,`${startMarker} not found`);
  const next=app.indexOf(nextMarker,start+startMarker.length);
  assert(next>start,`${nextMarker} not found after ${startMarker}`);
  return app.slice(start,next);
}

const source=[
  between('function addPage(','function duplicatePage('),
  between('function duplicatePage(','async function removePage('),
  between('async function removePage(','async function loadHighlighterImage(')
].join('\n');

let seq=100;
const study={
  id:'s1',title:'Test',updatedAt:0,
  pages:[{id:'p1',title:'Page 1'},{id:'p2',title:'Page 2'}],
  blocks:[
    {id:'b1',pageId:'p1',type:'text',title:'Question 1'},
    {id:'b2',pageId:'p2',type:'text',title:'Question 2'}
  ]
};
const state={activePageId:'p1',activeBlockId:'b1'};
const context={
  currentStudy:()=>study,state,
  recordStudyHistory:()=>{},ensureStudyPages:()=>{},uid:()=>`id${++seq}`,
  pageBlocks:(s,id)=>s.blocks.filter(b=>b.pageId===id),scheduleSave:()=>{},render:()=>{},
  scrollToBuilderPage:()=>{},toast:()=>{},miniConfirm:async()=>true,
  JSON,Date,structuredClone:global.structuredClone
};
vm.createContext(context);vm.runInContext(source,context);

const beforeAdd=study.pages.length;
context.addPage();
assert.equal(study.pages.length,beforeAdd+1,'New page must add a page');
assert.equal(state.activePageId,study.pages.at(-1).id,'New page becomes active');

state.activePageId='p1';
const beforeDupPages=study.pages.length,beforeDupBlocks=study.blocks.length;
context.duplicatePage('p1');
assert.equal(study.pages.length,beforeDupPages+1,'Duplicate page must add a page');
assert.equal(study.blocks.length,beforeDupBlocks+1,'Duplicate page must clone page blocks');
const duplicateId=state.activePageId;
assert(study.pages.some(p=>p.id===duplicateId),'Duplicated page must exist');
assert(study.blocks.some(b=>b.pageId===duplicateId),'Duplicated page must own cloned blocks');

(async()=>{
  const beforeDelete=study.pages.length;
  await context.removePage(duplicateId);
  assert.equal(study.pages.length,beforeDelete-1,'Delete page must remove a page');
  assert(!study.pages.some(p=>p.id===duplicateId),'Deleted page must be gone');
  assert(!study.blocks.some(b=>b.pageId===duplicateId),'Deleted page blocks must be removed');

  // Regression: local single-user mode must bypass team collaboration leases.
  assert(runtime.includes("if(authState?.local)return original.apply(this,args);"),
    'local structural actions must bypass collaboration guard');
  assert(runtime.includes("if(authState?.local)return originalPersist(...args);"),
    'local saves must bypass collaboration revision path');
  assert(runtime.includes("if(authState?.local)return true;\n    if(!r||authState?.membership?.role==='viewer'"),
    'local mode must not request resource leases');
  console.log('v53 local page actions regression tests passed');
})().catch(err=>{console.error(err);process.exit(1)});
