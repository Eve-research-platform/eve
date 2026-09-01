'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const css=fs.readFileSync(path.join(root,'app','eve-v54-theme.css'),'utf8');
const index=fs.readFileSync(path.join(root,'app','index.html'),'utf8');

assert(index.indexOf('styles.css') < index.indexOf('eve-v54-theme.css'));
assert(css.includes('/* v54.0.2 · Legacy-style neutralisation'));
assert(css.includes('.view-builder .block-card,'));
assert(css.includes('background:#fff!important'));
assert(css.includes('.view-builder .block-card:before{display:none!important}'));
assert(css.includes('.view-builder .block-card.selected{'));
assert(css.includes('border:1.5px solid var(--eve-plum-500)!important'));
assert(css.includes('.view-builder .list-item,'));
assert(css.includes('.view-builder .consent-builder-panel,'));
assert(css.includes('.view-builder .navigation-recording-builder,'));
assert(css.includes('.view-builder .panel-signup-builder,'));
assert(css.includes('.view-builder .rich-editor-shell,'));
assert(css.includes('.rating-scale-choice:focus-visible,'));
assert(css.includes('outline:2px solid var(--eve-plum-500)!important'));
assert(css.includes('.participant-shell .choice:has(input:checked)'));

console.log('v54.0.2 neutral Builder tests passed');
