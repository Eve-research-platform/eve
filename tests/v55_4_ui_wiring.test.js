'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','app','app.js'),'utf8');

const defined=new Set();
for(const m of src.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g))defined.add(m[1]);
for(const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g))defined.add(m[1]);

const methodNames=new Set([
 'stopPropagation','preventDefault','getElementById','querySelector','querySelectorAll',
 'closest','find','filter','map','forEach','remove','click','focus','then','catch',
 'scrollIntoView','classList','toggle','add','removeAttribute','setAttribute','at'
]);
const builtins=new Set([
 'Math','Number','String','Date','Array','Object','Promise','JSON','setTimeout',
 'clearTimeout','parseInt','parseFloat','encodeURIComponent','decodeURIComponent'
]);

const attrs=[...src.matchAll(/\b(?:onclick|onchange|oninput|onkeydown|onsubmit|ondragstart|ondragend|ondrop|ondragover|ondragleave)\s*=\s*"([^"]+)"/g)].map(m=>m[1]);
const missing=new Set();
for(const body of attrs){
 for(const m of body.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)){
   const fn=m[1];
   if(defined.has(fn)||methodNames.has(fn)||builtins.has(fn))continue;
   if(['if','for','while','switch'].includes(fn))continue;
   missing.add(fn);
 }
}
assert.deepEqual([...missing].sort(),[],'inline UI handler references missing functions');

const staticIds=[...src.matchAll(/\bid="([^"$`{]+)"/g)].map(m=>m[1]);
const counts=new Map();
for(const id of staticIds)counts.set(id,(counts.get(id)||0)+1);
const duplicates=[...counts].filter(([,n])=>n>1);
assert.deepEqual(duplicates,[],'duplicate static IDs found in application templates');

console.log('v55.4 UI wiring audit passed');
