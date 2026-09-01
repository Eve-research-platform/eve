'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const css=fs.readFileSync(path.join(__dirname,'..','app','eve-v54-theme.css'),'utf8');

assert(css.includes('/* v54.0.4 · Off-white study chrome + circular flow numbers */'));
assert(css.includes('background:#fbf9f5!important'));
assert(css.includes('background:#f6f2f8!important'));
assert(css.includes('width:24px!important'));
assert(css.includes('height:24px!important'));
assert(css.includes('aspect-ratio:1 / 1!important'));
assert(css.includes('border-radius:50%!important'));
assert(css.includes('background:var(--eve-plum-500)!important'));
assert(css.includes('background:#9aac78!important'));

console.log('v54.0.4 off-white chrome tests passed');
