'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),cp=require('child_process');
const root=path.join(__dirname,'..'),read=(...p)=>fs.readFileSync(path.join(root,...p),'utf8');
const pkg=JSON.parse(read('package.json')),launcher=read('index.html'),js=read('deployment.js'),cfg=read('deployment-config.js'),pages=read('.github','workflows','publish-beta.yml'),server=read('server.js'),guide=read('deploy','local','README.md');
assert.equal(pkg.version,'63.0.0');
assert(launcher.includes('This computer'));
assert(launcher.includes('id="localFlow"'));
assert(launcher.includes('id="localDownload"'));
assert(js.includes("goProvider('local')"));
assert(/h\s*===\s*['\"]#local['\"]/.test(js));
assert(cfg.includes('Eve-beta-local-relay-kit.zip'));
assert(server.includes("const HOST=process.env.HOST||'127.0.0.1';"));
assert(guide.includes('participant devices never connect to the researcher machine'));
assert(pages.includes('stage-deployment-site.sh'));assert(read('scripts','stage-deployment-site.sh').includes('build-local-relay-kit.sh'));
assert(read('scripts','set-canonical-repository.js').includes("readFileSync(path.join(root,'VERSION')"));
assert(fs.existsSync(path.join(root,'cloudflare-relay','src','worker.mjs')));
const out=path.join(root,'.tmp-local-kit-test.zip');
try{cp.execFileSync('bash',[path.join(root,'scripts','build-local-relay-kit.sh'),out],{stdio:'pipe'});assert(fs.statSync(out).size>100000);const list=cp.execFileSync('unzip',['-l',out],{encoding:'utf8'});for(const f of ['start-eve.bat','start-eve.command','server.js','cloudflare-relay/src/worker.mjs','README.md'])assert(list.includes(f),`local kit missing ${f}`)}finally{try{fs.unlinkSync(out)}catch{}}
console.log('v62.4 local + relay installation tests passed');
