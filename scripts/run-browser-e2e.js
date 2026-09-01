'use strict';

const {spawnSync}=require('child_process');
const path=require('path');

const candidates=process.platform==='win32'
  ? [['py',['-3']],['python',[]],['python3',[]]]
  : [['python',[]],['python3',[]]];

let python=null,prefix=[];
for(const [cmd,args] of candidates){
  const probe=spawnSync(cmd,[...args,'-c','import sys; print(sys.executable)'],{encoding:'utf8'});
  if(probe.status===0){python=cmd;prefix=args;break}
}
if(!python){
  console.error('Eve browser E2E requires Python 3.');
  process.exit(2);
}

const dependency=spawnSync(
  python,[...prefix,'-c','from playwright.sync_api import sync_playwright; print("ok")'],
  {encoding:'utf8'}
);
if(dependency.status!==0){
  console.error('Playwright is not installed for Python.');
  console.error('Run: python -m pip install -r requirements-e2e.txt');
  console.error('Then: python -m playwright install chromium');
  process.exit(2);
}

const runner=path.join(__dirname,'run_playwright_release.py');
const result=spawnSync(python,[...prefix,runner],{stdio:'inherit',env:process.env});
process.exit(result.status==null?1:result.status);
