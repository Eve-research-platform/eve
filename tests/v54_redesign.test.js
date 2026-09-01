'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app','app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'app','eve-v54-theme.css'),'utf8');
const index=fs.readFileSync(path.join(root,'app','index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'app','sw.js'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'app','manifest.webmanifest'),'utf8'));

assert(index.includes('eve-v54-theme.css'));
assert.equal(manifest.theme_color,'#3a2668');
assert.equal(manifest.background_color,'#f7f5fb');
assert(sw.includes('eve-shell-v62-5-0-full'));
assert(sw.includes("'./eve-v54-theme.css'"));

assert(app.includes('function eveIcon(name,size=20)'));
assert(app.includes('function eveBrandMark()'));
assert(app.includes("'/','home','Home'"));
assert(app.includes("'/studies','studies','Studies'"));
assert(app.includes("'/participants','participants','Participants'"));
assert(app.includes("'/repository','insights','Insights'"));
assert(app.includes("'/archive','archive','Archive'"));
assert(app.includes("'/settings','settings','Settings'"));
const nav=app.slice(app.indexOf('function nav(){'),app.indexOf('function shell(',app.indexOf('function nav(){')));
for(const glyph of ['⌂','▣','♙','◫','◇','▤','⚙','☁'])assert(!nav.includes(glyph),`legacy nav glyph remains: ${glyph}`);

assert(app.includes('home-dashboard'));
assert(app.includes('Responses, 14 days'));
assert(app.includes('Panel members'));
assert(app.includes('Needs you'));
assert(app.includes('study-filter-segments'));
assert(app.includes("setStudyLibraryStatus('live')"));
assert(app.includes('study-progress-track'));
assert(app.includes("['panelSignup','participants','Panel sign-up'"));

for(const token of [
  '--eve-ink:#241a41','--eve-plum-900:#3a2668','--eve-plum-500:#7c5cd0','--eve-plum-100:#f3effc',
  '--eve-ground:#f7f5fb','--eve-desk:#efeaf7','--eve-border:#e0d7f4','--eve-sage:#7a8a5e'
])assert(css.includes(token),`missing ${token}`);
assert(css.includes('grid-template-columns:250px minmax(0,1fr)'));
assert(css.includes('grid-template-columns:92px minmax(0,1fr)'));
assert(css.includes('border-radius:999px!important'));
assert(css.includes('.study-flow{'));
assert(css.includes('.builder.vertical-pages.builder-two-column'));
assert(css.includes('.participant-runtime>form'));
assert(css.includes('@media(max-width:900px)'));
assert(css.includes('height:auto!important;display:block!important;min-height:0!important;overflow:visible!important'));
console.log('v54 purple redesign tests passed');
