'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app','app.js'),'utf8');
const submit=fs.readFileSync(path.join(root,'app','eve-participant-submit.js'),'utf8');
const delivery=fs.readFileSync(path.join(root,'app','eve-participant-delivery.js'),'utf8');
const css=fs.readFileSync(path.join(root,'app','eve-v54-theme.css'),'utf8');

assert(app.includes("responseId:String(form.dataset.responseId||'')"));
assert(app.includes("form.dataset.responseId=String(draft.responseId||'')"));
assert(submit.includes("responseId=form.dataset.responseId||uid()"));
assert(submit.includes("form.dataset.responseId=responseId"));
assert(submit.includes("participantDelivery.persistRecording"));
assert(submit.includes("participantDelivery.deliverResponse"));
assert(app.includes("participantDelivery.loadPending(form.dataset.sessionKey)"));
assert(app.includes("setTimeout(()=>resumePendingParticipantDelivery(form),0)"));
assert(app.includes("Response waiting to send"));
assert(app.includes("retry.textContent='Retry sending'"));
assert(app.includes("Your completed response is safely held in this tab"));
assert(delivery.includes("const PENDING_PREFIX='eve-participant-pending-v1:'"));
assert(delivery.includes("session.recordingId=session.recordingId||uid()"));
assert(css.includes('/* v56.3 · Recoverable participant submission */'));
assert(css.includes('.participant-pending-retry'));

console.log('v56.3 participant recovery UI tests passed');
