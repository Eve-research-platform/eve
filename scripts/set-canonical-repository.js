'use strict';
const fs=require('fs'),path=require('path');const root=path.join(__dirname,'..');
const slug=String(process.argv[2]||'').trim().replace(/^https:\/\/github\.com\//i,'').replace(/\.git$/i,'').replace(/^\/+|\/+$/g,'');
if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(slug)){console.error('Usage: node scripts/set-canonical-repository.js OWNER/REPOSITORY [revision]');process.exit(2)}
const version=fs.readFileSync(path.join(root,'VERSION'),'utf8').trim(),lower=slug.toLowerCase(),revision=String(process.argv[3]||`v${version}`);
const files=['deployment-config.js','deploy/azure/azuredeploy.json','deploy/azure/azuredeploy-private.json','deploy/azure/parameters.example.json'];
for(const file of files){const p=path.join(root,file);let s=fs.readFileSync(p,'utf8');s=s.replace(/https:\/\/github\.com\/(?:OWNER\/REPOSITORY|[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/g,`https://github.com/${slug}`).replace(/ghcr\.io\/(?:OWNER\/REPOSITORY|[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+):[^"'\s,]+/g,`ghcr.io/${lower}:${version}`);if(file==='deployment-config.js')s=s.replace(/revision:\s*"[^"]+"/,`revision: "${revision}"`);fs.writeFileSync(p,s)}
console.log(`Canonical Eve repository set to https://github.com/${slug}`);console.log(`Stable container image set to ghcr.io/${lower}:${version}`);console.log(`Deployment revision set to ${revision}`);
