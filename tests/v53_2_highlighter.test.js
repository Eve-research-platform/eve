'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const appPath=path.join(__dirname,'..','app','app.js');
const cssPath=path.join(__dirname,'..','app','styles.css');
const src=fs.readFileSync(appPath,'utf8');
const css=fs.readFileSync(cssPath,'utf8');
const {highlighterSafeColor,highlighterAlpha,highlighterMeanings}=require('../app/app.js');

assert.equal(highlighterSafeColor('#D14343'),'#d14343');
assert.equal(highlighterSafeColor('red'),'#e3a008');
assert.equal(highlighterAlpha('#2f9e62','34'),'#2f9e6234');
assert.deepEqual(highlighterMeanings({highlighterMeanings:[
  {id:'good',label:'Good',color:'#2f9e62'},
  {id:'bad',label:'Problem',color:'#d14343'}
]}),[
  {id:'good',label:'Good',color:'#2f9e62'},
  {id:'bad',label:'Problem',color:'#d14343'}
]);
assert.equal(highlighterMeanings({})[0].label,'Highlight','legacy studies get a default meaning');

assert(src.includes("highlighterMeanings:[{id:uid(),label:'Good',color:'#2f9e62'},{id:uid(),label:'Problem',color:'#d14343'}]"));
assert(src.includes('function addHighlighterMeaning('));
assert(src.includes('function removeHighlighterMeaning('));
assert(src.includes('data-highlighter-meaning='));
assert(src.includes('data-highlighter-touch-mode'));
assert(src.includes("window.matchMedia?.('(pointer: coarse)')"));
assert(src.includes("touchDrawMode=!coarse"));
assert(src.includes("Scroll or pinch-zoom normally."));
assert(src.includes("meaningId:activeMeaning.id"));
assert(src.includes("meaningLabel:activeMeaning.label"));
assert(src.includes("color:activeMeaning.color"));
assert(src.includes('function toggleHighlighterResultFilter('));
assert(src.includes('data-result-meaning='));
assert(src.includes('data-result-mark='));

assert(css.includes('@media (pointer:coarse)'));
assert(css.includes('.highlighter-stage{touch-action:pan-y pinch-zoom'));
assert(css.includes('.highlighter-runtime.touch-draw-enabled .highlighter-stage{touch-action:none'));
assert(css.includes('.highlighter-meaning-picker'));
assert(css.includes('.highlighter-result-legend'));

console.log('v53.2 semantic touch highlighter tests passed');
