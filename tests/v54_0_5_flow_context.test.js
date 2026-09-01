'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const css=fs.readFileSync(path.join(__dirname,'..','app','eve-v54-theme.css'),'utf8');

assert(css.includes('/* v54.0.5 · Flow-state hierarchy + polished study context */'));
assert(css.includes('.study-flow .flow-step{'));
assert(css.includes('background:#eee8f3!important'));
assert(css.includes('.study-flow .flow-step:hover,'));
assert(css.includes('.study-flow .flow-step.active{'));
assert(css.includes('background:#fff!important'));
assert(css.includes('.topbar .topbar-context{'));
assert(css.includes('background:#60448f!important'));
assert(css.includes('color:#fff!important'));
assert(css.includes('.topbar .topbar-context .topbar-status.draft{'));
assert(css.includes('background:#f4f0f8!important'));
assert(css.includes('.topbar .topbar-context .topbar-version{'));

console.log('v54.0.5 flow/context styling tests passed');
