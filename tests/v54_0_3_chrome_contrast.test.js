'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const css=fs.readFileSync(path.join(__dirname,'..','app','eve-v54-theme.css'),'utf8');

assert(css.includes('/* v54.0.3 · Sidebar contrast + lighter study chrome */'));
assert(css.includes('color:#eee7f7!important'));
assert(css.includes('background:#6f54a8!important'));
assert(css.includes('background:#8067b6!important'));
assert(css.includes('.study-flow .flow-step.active{'));
assert(css.includes('background:#fff!important'));
assert(css.includes('background:#3b2768!important'));

console.log('v54.0.3 sidebar/header contrast tests passed');
