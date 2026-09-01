'use strict';

const fs=require('fs');
const path=require('path');

function createRelayResponseIndex({responsePath,safeId}={}){
  if(typeof responsePath!=='function'||typeof safeId!=='function')throw new Error('response index requires responsePath and safeId');

  const fileFor=slug=>path.join(responsePath(slug),'_index.json');
  const readJson=(file,fallback=null)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}};
  function writeJsonAtomic(file,data){
    fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
    const tmp=`${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp,JSON.stringify(data),{mode:0o600});
    fs.renameSync(tmp,file);
  }
  function index(slug,repair=true){
    const file=fileFor(slug),stored=readJson(file);
    if(Array.isArray(stored))return stored;
    if(!repair)return[];
    const dir=responsePath(slug);
    fs.mkdirSync(dir,{recursive:true,mode:0o700});
    const rows=fs.readdirSync(dir)
      .filter(x=>x.endsWith('.json')&&x!=='_index.json')
      .map(x=>readJson(path.join(dir,x)))
      .filter(x=>x?.id)
      .map(x=>({id:safeId(x.id),receivedAt:Number(x.receivedAt||0)}))
      .filter(x=>x.id)
      .sort((a,b)=>a.receivedAt-b.receivedAt||a.id.localeCompare(b.id));
    writeJsonAtomic(file,rows);
    return rows;
  }
  function append(slug,id,receivedAt){
    const rows=index(slug,true),clean=safeId(id);
    if(!clean||rows.some(x=>x.id===clean))return rows;
    rows.push({id:clean,receivedAt:Number(receivedAt||Date.now())});
    rows.sort((a,b)=>a.receivedAt-b.receivedAt||a.id.localeCompare(b.id));
    writeJsonAtomic(fileFor(slug),rows);
    return rows;
  }

  return {fileFor,index,append};
}

module.exports={createRelayResponseIndex};
