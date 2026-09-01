'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const css=fs.readFileSync(path.join(__dirname,'..','app','styles.css'),'utf8');

const marker='/* v53.4.3 · Mobile Study Builder scrolling';
const idx=css.indexOf(marker);
assert(idx>=0,'mobile builder scroll fix missing');
const tail=css.slice(idx);

assert(tail.includes('@media (max-width:780px)'));
assert(tail.includes('.view-builder .builder.builder-two-column'));
assert(tail.includes('height:auto!important'));
assert(tail.includes('overflow:visible!important'));
assert(tail.includes('.view-builder .builder>.canvas'));
assert(tail.includes('touch-action:pan-y pinch-zoom'));
assert(tail.includes('background-attachment:scroll!important'));
assert(tail.includes('.view-builder .canvas-block-drag-handle'));
assert(tail.includes('touch-action:pan-y'));
assert(tail.includes('padding-bottom:calc(96px + env(safe-area-inset-bottom))'));

console.log('v53.4.3 mobile builder scroll tests passed');
