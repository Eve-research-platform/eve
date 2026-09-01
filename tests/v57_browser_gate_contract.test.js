'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const pkg=require(path.join(root,'package.json'));
const read=(...parts)=>fs.readFileSync(path.join(root,...parts),'utf8');

assert(Number(pkg.version.split('.')[0])>=57);
assert(pkg.scripts.e2e.includes('run-browser-e2e.js'));
assert(pkg.scripts['release:check'].includes('npm run e2e'));

const support=read('tests','browser','playwright_support.py');
const golden=read('tests','browser','golden_journey_playwright.py');
const recovery=read('tests','browser','participant_recovery_playwright.py');
const runner=read('scripts','run_playwright_release.py');
const wrapper=read('scripts','run-browser-e2e.js');
const requirements=read('requirements-e2e.txt');
const sw=read('app','sw.js');

assert(support.includes('from playwright.sync_api import sync_playwright'));
assert(support.includes('publish_simple_study'));
assert(support.includes('browser.new_context')||golden.includes('browser.new_context'));
assert(golden.includes('Browser release gate study'));
assert(golden.includes('Review →'));
assert(golden.includes('Save insight'));
assert(golden.includes('Turn off'));
assert(golden.includes('participant_context = browser.new_context'));
assert(golden.includes('closed_context = browser.new_context'));
assert(golden.includes('page.reload'));

assert(recovery.includes('Response waiting to send'));
assert(recovery.includes('Retry sending'));
assert(recovery.includes('route.fulfill'));
assert(recovery.includes('status=503'));
assert(recovery.includes('participant.unroute'));
assert(recovery.includes('Responses'));

assert(runner.includes('golden_journey_playwright.py'));
assert(runner.includes('participant_recovery_playwright.py'));
assert(wrapper.includes('requirements-e2e.txt'));
assert(requirements.includes('playwright'));
assert(sw.includes('eve-shell-v62-5-0-full'));

console.log('v57 Playwright browser-release-gate contract passed');
