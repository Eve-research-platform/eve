'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app','app.js'),'utf8');
const theme=fs.readFileSync(path.join(root,'app','eve-v54-theme.css'),'utf8');
const polish=fs.readFileSync(path.join(root,'app','eve-v56-polish.css'),'utf8');
const sw=fs.readFileSync(path.join(root,'app','sw.js'),'utf8');

const display=(theme.match(/--eve-font-display:([^;]+);/)||[])[1]||'';
const body=(theme.match(/--eve-font-body:([^;]+);/)||[])[1]||'';
assert(display.includes('ui-sans-serif'));
assert(body.includes('ui-sans-serif'));
assert.equal(display,body,'display and body typography should use one consistent family');
assert.equal(theme.includes('Caprasimo'),false);
assert.equal(theme.includes('Figtree'),false);
assert.equal(theme.includes('Georgia,serif'),false);

assert(app.includes('aria-label="Study title — editable"'));
assert(app.includes('aria-label="Page title — editable"'));
assert(app.includes('aria-label="Section title — editable"'));

assert(polish.includes('/* v56.6 · Typography clarity + editable-text affordance'));
assert(polish.includes('.inline-title{'));
assert(polish.includes('border-bottom:1px dotted'));
assert(polish.includes('background-image:url("data:image/svg+xml'));
assert(polish.includes('.inline-title:hover'));
assert(polish.includes('.inline-title:focus'));
assert(polish.includes('.rich-editor-toolbar::after'));
assert(polish.includes('content:"Editable"'));
assert(polish.includes('.section-drag-overview .inline-title'));
assert(polish.includes('background-image:none!important'));

assert(sw.includes('eve-shell-v62-5-0-full'));

console.log('v56.6 typography/readability and editable-text affordance tests passed');
