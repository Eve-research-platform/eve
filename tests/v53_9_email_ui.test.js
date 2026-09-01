'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const app=fs.readFileSync(path.join(__dirname,'..','app','app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','app','styles.css'),'utf8');
const routes=fs.readFileSync(path.join(__dirname,'..','v52_routes.js'),'utf8');
const runtime=fs.readFileSync(path.join(__dirname,'..','app','eve-v53-runtime.js'),'utf8');
const panel=fs.readFileSync(path.join(__dirname,'..','lib','participant_panel.js'),'utf8');

assert(app.includes('MICROSOFT 365 EMAIL'));
assert(app.includes('Organisation email'));
assert(app.includes('global-mail-tenant'));
assert(app.includes('global-mail-client'));
assert(app.includes('global-mail-secret'));
assert(app.includes('global-mail-sender'));
assert(app.includes('Send a test email'));
assert(app.includes('global-mail-test-recipient'));
assert(app.includes('GLOBAL EMAIL DEFAULTS'));
assert(app.includes('Recruitment invitation'));
assert(app.includes('Panel welcome email'));
assert(app.includes('Panel removal email'));
assert(app.includes("'/api/mail/settings'"));
assert(app.includes("'/api/mail/test'"));
assert(app.includes('saveGlobalEmailSettings'));
assert(app.includes('sendGlobalTestEmail'));
assert(app.includes('Use Global Settings default'));
assert(app.includes("panelWelcomeSubject:''"));
assert(app.includes("panelWelcomeMessage:''"));

assert(routes.includes('mailer.handle(req, res, url)'));
assert(runtime.includes('getMailStatus(true)'));
assert(runtime.includes("status.templates?.recruitmentSubject"));
assert(runtime.includes("status.templates?.recruitmentMessage"));
assert(panel.includes("mailer?.panelWelcomeTemplate"));
assert(panel.includes("mailer?.panelRemovalTemplate"));

assert(css.includes('/* v53.9.0 · Global Microsoft 365 email settings */'));
assert(css.includes('.global-settings-wide'));
assert(css.includes('.email-settings-columns'));
assert(css.includes('.email-template-group'));

console.log('v53.9 global email settings UI tests passed');
