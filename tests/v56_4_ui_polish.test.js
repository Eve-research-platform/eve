'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const index=fs.readFileSync(path.join(root,'app','index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'app','app.js'),'utf8');
const sw=fs.readFileSync(path.join(root,'app','sw.js'),'utf8');
const css=fs.readFileSync(path.join(root,'app','eve-v56-polish.css'),'utf8');

assert(index.includes('<link rel="stylesheet" href="eve-v56-polish.css" />'));
assert(index.indexOf('eve-v54-theme.css')<index.indexOf('eve-v56-polish.css'),'polish layer must load after the theme');
assert(sw.includes("'./eve-v56-polish.css'"),'polish layer must work offline');
assert(sw.includes('eve-shell-v62-5-0-full'));

assert(css.includes('/* Eve v56.4 · Platform polish layer'));
assert(css.includes('--eve-control-h:44px'));
assert(css.includes('.study-card:hover'));
assert(css.includes('.launch-check:hover'));
assert(css.includes('.review-evidence-list>button:hover'));
assert(css.includes('.input:focus,'));
assert(css.includes('.modal-card{'));
assert(css.includes('.participant-card{'));
assert(css.includes('.participant-page-nav{'));
assert(css.includes('@media(max-width:760px)'));
assert(css.includes('@media(prefers-reduced-motion:reduce)'));
assert(css.includes('animation-duration:.01ms!important'));

assert(app.includes("scheduled?'Scheduled':'Live'"));
assert(app.includes("?'Ended':currentVersion?'Off':'Draft'"));
assert(!app.includes("'◷ Scheduled'"));
assert(!app.includes("'● Live'"));
assert(!app.includes("'>● Start recording</button>'"));
assert(!app.includes("'>■ Stop</button>'"));
assert(app.includes("${eveIcon('mic',16)}"));

const opened=(css.match(/\{/g)||[]).length,closed=(css.match(/\}/g)||[]).length;
assert.equal(opened,closed,'polish stylesheet braces must balance');

console.log('v56.4 platform UI/UX polish tests passed');
