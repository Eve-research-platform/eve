'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app','app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'app','eve-v54-theme.css'),'utf8');

assert(app.includes("state.previewDevice==='mobile'?'mobile':'desktop'"));
assert(app.includes('preview-device-control'));
assert(app.includes('Desktop</button>'));
assert(app.includes('Mobile</button>'));
assert(app.includes('participant-page-panel preview-study-page'));
assert(app.includes('participant-page-heading'));
assert(app.includes('participant-study-title'));
assert(app.includes('preview-participant-shell'));
assert(app.includes('Private research study · preview'));
assert(!app.includes('preview-mode-note'));

assert(app.includes('function setParticipantSessionStatus('));
assert(app.includes('id="p-session-status"'));
assert(app.includes("setParticipantSessionStatus('saving'"));
assert(app.includes("setParticipantSessionStatus('restored'"));
assert(app.includes("setParticipantSessionStatus('submitting'"));
assert(app.includes("setParticipantSessionStatus('error'"));
assert(app.includes('Progress could not be saved'));

assert(app.includes('function evidenceInsightFor('));
assert(app.includes("✓ Saved insight"));
assert(app.includes("if(el.dataset.insightId)return editInsight(el.dataset.insightId)"));

assert(!app.includes('<section class="send-fix-strip">'));
assert(!app.includes('<div class="review-insight-capture-tip">'));
assert(!app.includes('class="outline-issue-link"'));

assert(css.includes('/* v55.1.0 · Preview fidelity + participant session clarity */'));
assert(css.includes('.preview-participant-shell.mobile-preview'));
assert(css.includes('.participant-session-status{'));
assert(css.includes('@keyframes eve-session-pulse'));
assert(css.includes('.review-quote.has-saved-insight'));

console.log('v55.1 preview/participant workflow tests passed');
