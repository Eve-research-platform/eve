'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','app','app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','app','styles.css'),'utf8');

assert(src.includes('function blockOverflowMenuMarkup'));
assert(src.includes('class="block-overflow-menu"'));
assert(src.includes('class="icon-btn block-overflow-trigger"'));
assert(src.includes('<b>Settings</b>'));
assert(src.includes('<b>Duplicate</b>'));
assert(src.includes('class="block-menu-delete"'));
assert(src.includes('<b>Delete</b>'));
assert(src.includes('blockOverflowMenuMarkup(b)'));
assert(!src.includes('<h4>Section actions</h4>'));

const blockEditorStart=src.indexOf('function blockEditor(b)');
const blockEditorEnd=src.indexOf('function openSectionSettings',blockEditorStart);
const blockEditor=src.slice(blockEditorStart,blockEditorEnd);
assert(!blockEditor.includes('section-settings-button'));
assert(!blockEditor.includes('aria-label="Remove section"'));
assert(blockEditor.includes('section-order-controls'));
assert(blockEditor.includes('section-page-move'));

assert(css.includes('/* v53.4.4 · Block overflow actions */'));
assert(css.includes('.block-overflow-popover'));
assert(css.includes('.block-menu-delete'));
assert(css.includes('bottom:calc(76px + env(safe-area-inset-bottom))'));

console.log('v53.4.4 block overflow menu tests passed');
