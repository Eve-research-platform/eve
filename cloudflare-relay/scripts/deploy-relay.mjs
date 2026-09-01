import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url));

const input=process.argv[2];
if(!input){
  console.error('Usage: node scripts/deploy-relay.mjs <eve-relay-setup.json>');
  process.exit(2);
}
const file=path.resolve(input.replace(/^["']|["']$/g,''));
const setup=JSON.parse(fs.readFileSync(file,'utf8'));
if(setup.format!=='eve-cloudflare-relay-setup-v1'||!setup.ownerKey){
  console.error('That file is not an Eve relay setup file.');
  process.exit(2);
}
const npx=process.platform==='win32'?'npx.cmd':'npx';
const run=(args,opts={})=>{
  const r=spawnSync(npx,['wrangler',...args],{cwd:path.resolve(HERE,'..'),stdio:opts.input?'pipe':'inherit',input:opts.input,encoding:opts.input?'utf8':undefined});
  return r.status??1;
};

console.log('\nEve Cloudflare relay setup');
console.log('---------------------------');
console.log('1. Preparing the small Cloudflare relay…');
const wranglerCheck=spawnSync(npx,['wrangler','--version'],{cwd:path.resolve(HERE,'..'),stdio:'ignore'});
if((wranglerCheck.status??1)!==0){
  console.log('Installing the bundled Cloudflare deployment dependency…');
  const npm=process.platform==='win32'?'npm.cmd':'npm';
  const install=spawnSync(npm,['install','--no-fund','--no-audit'],{cwd:path.resolve(HERE,'..'),stdio:'inherit'});
  if((install.status??1)!==0)process.exit(1);
}
console.log('2. Checking Cloudflare login…');
if(run(['whoami'])!==0){
  console.log('Opening Cloudflare sign-in…');
  if(run(['login'])!==0)process.exit(1);
}
console.log('\n3. Creating the R2 mailbox (safe if it already exists)…');
run(['r2','bucket','create',setup.bucketName||'eve-relay']);

console.log('\n4. Saving the private Eve relay owner key…');
if(run(['secret','put','EVE_RELAY_OWNER_KEY'],{input:`${setup.ownerKey}\n`})!==0)process.exit(1);

console.log('\n5. Deploying Eve Relay and participant app…');
const status=run(['deploy']);
if(status!==0)process.exit(status);

console.log('\nRelay deployed.');
console.log('Copy the workers.dev/custom-domain URL shown above back into Eve Setup and choose “Test relay”.');
