'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app','app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'app','eve-v54-theme.css'),'utf8');

for(const glyph of ['⌕','◫','✦','◎','♙','☁','▣','▦','▧']){
  assert.equal(app.includes(glyph),false,`retired UI glyph still present: ${glyph}`);
}

assert(app.includes("sparkle:'<path"));
assert(app.includes("target:'<circle"));
assert(app.includes("video:'<rect"));
assert(app.includes("screen:'<rect"));
assert(app.includes("mail:'<rect"));

assert(app.includes('class="skip-link" href="#eve-main"'));
assert(app.includes('id="eve-main" tabindex="-1"'));

assert(app.includes('function reviewTabsKeydown('));
assert(app.includes("role=\"tablist\""));
assert(app.includes("role=\"tab\""));
assert(app.includes("aria-selected="));
assert(app.includes("'ArrowLeft','ArrowRight','Home','End'"));
assert(app.includes("event.key==='ArrowRight'"));
assert(app.includes("event.key==='Home'"));
assert(app.includes("event.key==='End'"));
assert(app.includes("Object.entries(counts).filter(([,count])=>count>0)"));
assert(app.includes("items.filter(([, ,count])=>count>0)"));

assert(app.includes("eveIcon('search',16)"));
assert(app.includes("eveIcon('insights',26)"));
assert(app.includes("eveIcon('participants',20)"));
assert(app.includes("eveIcon('storage',20)"));
assert(app.includes("eveIcon('sparkle',20)"));
assert(app.includes("eveIcon('mail',20)"));

assert(css.includes('/* v55.2.0 · Consistency + accessibility */'));
assert(css.includes('.skip-link{'));
assert(css.includes('button:focus-visible,'));
assert(css.includes('.review-tabs{'));
assert(css.includes('position:sticky'));
assert(css.includes('.review-tab[aria-selected="true"]'));
assert(css.includes('.review-overview-icon{'));

console.log('v55.2 consistency/accessibility tests passed');
