'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const index=fs.readFileSync(path.join(root,'app','index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'app','eve-v54-theme.css'),'utf8');
const app=fs.readFileSync(path.join(root,'app','app.js'),'utf8');

const baseIndex=index.indexOf('href="styles.css"');
const themeIndex=index.indexOf('href="eve-v54-theme.css"');
assert(baseIndex>=0,'legacy/base stylesheet missing');
assert(themeIndex>baseIndex,'v54 theme must load after styles.css');

assert(css.includes('/* v54.0.1 · Builder polish'));
assert(css.includes('grid-template-columns:286px minmax(0,1fr)'));
assert(css.includes('max-width:1080px!important'));
assert(css.includes('.rich-editor-shell{'));
assert(css.includes('.outline-page.active{'));
assert(css.includes('background:rgba(255,255,255,.68)!important'));
assert(css.includes('.page-canvas-heading{'));
assert(css.includes('border-radius:26px'));
assert(css.includes('.block-card.selected{'));
assert(css.includes('.section-order-btn{'));
assert(css.includes('.insert-step-between{'));
assert(css.includes('@media(max-width:900px)'));

assert(app.includes("grip:'<circle"));
assert(app.includes("arrowUp:'<path"));
assert(app.includes("arrowDown:'<path"));
assert(app.includes("eveIcon('grip',16)"));
assert(app.includes("eveIcon('arrowUp',15)"));
assert(app.includes("eveIcon('arrowDown',15)"));

console.log('v54.0.1 visual polish tests passed');
