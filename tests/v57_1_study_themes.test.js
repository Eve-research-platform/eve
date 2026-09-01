'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const read=(...parts)=>fs.readFileSync(path.join(root,...parts),'utf8');

delete global.studyPresentationTheme;
delete global.studyThemeClass;
delete global.studyThemeSettingsMarkup;
require(path.join(root,'app','eve-study-themes.js'));

assert.equal(studyPresentationTheme({settings:{}}),'default');
assert.equal(studyPresentationTheme({settings:{presentationTheme:'default'}}),'default');
assert.equal(studyPresentationTheme({settings:{presentationTheme:'gds'}}),'gds');
assert.equal(studyPresentationTheme({settings:{presentationTheme:'unknown'}}),'default');
assert.equal(studyThemeClass({settings:{presentationTheme:'gds'}}),'study-theme-gds');
assert.equal(studyThemeClass({}, {theme:'gds'}),'study-theme-gds');

const defaultMarkup=studyThemeSettingsMarkup({settings:{presentationTheme:'default'}});
const gdsMarkup=studyThemeSettingsMarkup({settings:{presentationTheme:'gds'}});
assert(defaultMarkup.includes('Participant theme'));
assert(defaultMarkup.includes('aria-pressed="true"'));
assert(defaultMarkup.includes("sSetting('presentationTheme','gds')"));
assert(defaultMarkup.includes('Preview participant theme'));
assert(gdsMarkup.includes('Current: <b>GDS</b>'));
assert(gdsMarkup.includes('GDS uses GOV.UK-style colours'));

const app=read('app','app.js');
const index=read('app','index.html');
const css=read('app','eve-study-themes.css');
const sw=read('app','sw.js');

assert(app.includes("presentationTheme:'default'"));
assert(app.includes('${studyThemeSettingsMarkup(s)}'));
assert(app.includes('preview-participant-shell ${studyThemeClass(s)}'));
assert(app.includes('participant-shell ${studyThemeClass(s,receipt)}'));
assert(app.includes('participant-shell ${studyThemeClass(s)}'));
assert(app.includes('theme:studyPresentationTheme(s)'));

assert(index.indexOf('eve-study-themes.css')>index.indexOf('eve-v56-polish.css'));
assert(index.indexOf('eve-study-themes.js')<index.indexOf('app.js'));

for(const token of ['#0b0c0c','#1d70b8','#00703c','#ffdd00','#d4351c','#f3f2f1'])
  assert(css.includes(token),`GDS token missing ${token}`);
assert(css.includes('.study-theme-gds .participant-top'));
assert(css.includes('.study-theme-gds .btn.primary'));
assert(css.includes('.study-theme-gds .input:focus'));
assert(css.includes('.study-theme-gds .choice'));
assert(css.includes('Arial,Helvetica,sans-serif'));
assert(css.includes('It does not add GOV.UK branding')===false); // UI copy belongs in JS, not CSS.

assert(sw.includes('eve-shell-v62-5-0-full'));
assert(sw.includes('./eve-study-themes.css'));
assert(sw.includes('./eve-study-themes.js'));

console.log('v57.1 per-study Default/GDS presentation theme tests passed');
