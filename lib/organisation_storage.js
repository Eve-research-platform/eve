'use strict';
const fs=require('fs'),path=require('path');

function createOrganisationStorage({dataDir,json,body,requireRole,authConfigured,enabled=true,label='Organisation cloud storage',stateStore=null}={}){
  const root=path.join(dataDir,'organisation-storage');
  fs.mkdirSync(root,{recursive:true,mode:0o700});
  const MAX=80*1024*1024;

  function roleOrLocal(req,res,role='researcher'){
    if(!authConfigured?.())return {local:true,membership:{role:'admin'}};
    return requireRole?.(req,res,role)||null;
  }
  function safe(value,{empty=false}={}){
    const raw=String(value||'').replace(/\\/g,'/').replace(/^\/+|\/+$/g,'');
    if(!raw&&empty)return'';
    if(!raw||raw.includes('..')||raw.split('/').some(x=>!x||x==='.'||x.length>180)||raw.length>1400)
      throw Object.assign(new Error('Invalid organisation storage path.'),{status:400});
    return raw;
  }
  function fileFor(p){const rel=safe(p),full=path.resolve(root,rel);if(full!==root&&!full.startsWith(root+path.sep))throw Object.assign(new Error('Invalid storage path.'),{status:400});return full}
  function atomic(file,content){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const tmp=`${file}.${process.pid}.${Date.now()}.tmp`;fs.writeFileSync(tmp,String(content),{mode:0o600});fs.renameSync(tmp,file)}
  function walk(dir,prefix='',out=[]){
    if(out.length>10000)throw Object.assign(new Error('Organisation storage listing exceeded safety limit.'),{status:413});
    for(const e of fs.readdirSync(dir,{withFileTypes:true})){
      const rel=prefix?`${prefix}/${e.name}`:e.name,full=path.join(dir,e.name);
      if(e.isDirectory())walk(full,rel,out);
      else{const st=fs.statSync(full);out.push({path:rel,modifiedAt:st.mtime.toISOString(),size:st.size})}
    }
    return out;
  }
  async function handle(req,res,url){
    if(!url.pathname.startsWith('/api/organisation-storage'))return false;
    if(!enabled)return json(res,503,{ok:false,error:'organisation_storage_disabled'});
    try{
      if(!roleOrLocal(req,res,url.pathname.endsWith('/status')?'viewer':'researcher'))return true;
      if(url.pathname==='/api/organisation-storage/status'&&req.method==='GET')
        return json(res,200,{ok:true,connected:true,label,location:label,encryptedPayloads:true});
      if(url.pathname==='/api/organisation-storage/files'&&req.method==='PUT'){
        const d=await body(req,MAX),p=safe(d.path);if(typeof d.content!=='string')throw Object.assign(new Error('Encrypted file content must be a string.'),{status:400});
        const write=async()=>{const file=fileFor(p);atomic(file,d.content);const st=fs.statSync(file);return json(res,200,{ok:true,path:p,metadata:{modifiedAt:st.mtime.toISOString(),size:st.size}})};
        return stateStore?.info?.().postgres?stateStore.advisoryLock(`organisation-storage:${p}`,write):write();
      }
      if(url.pathname==='/api/organisation-storage/files'&&req.method==='GET'){
        const p=safe(url.searchParams.get('path')),file=fileFor(p);if(!fs.existsSync(file)||!fs.statSync(file).isFile())return json(res,404,{ok:false,error:'file_not_found',path:p});
        const st=fs.statSync(file);return json(res,200,{ok:true,path:p,content:fs.readFileSync(file,'utf8'),metadata:{modifiedAt:st.mtime.toISOString(),size:st.size}});
      }
      if(url.pathname==='/api/organisation-storage/files'&&req.method==='DELETE'){
        const d=await body(req,64*1024),p=safe(d.path||url.searchParams.get('path')),file=fileFor(p),deleted=fs.existsSync(file);
        const remove=async()=>{const exists=fs.existsSync(file);if(exists)fs.rmSync(file,{force:true});return json(res,200,{ok:true,deleted:exists,path:p})};
        return stateStore?.info?.().postgres?stateStore.advisoryLock(`organisation-storage:${p}`,remove):remove();
      }
      if(url.pathname==='/api/organisation-storage/files/list'&&req.method==='GET'){
        const prefix=safe(url.searchParams.get('prefix')||'',{empty:true}),dir=prefix?fileFor(prefix):root;
        if(!fs.existsSync(dir))return json(res,200,{ok:true,prefix,files:[]});
        if(!fs.statSync(dir).isDirectory())return json(res,400,{ok:false,error:'prefix_not_directory'});
        return json(res,200,{ok:true,prefix,files:walk(dir,prefix,[])});
      }
      return false;
    }catch(err){return json(res,Number(err.status)||500,{ok:false,error:'organisation_storage_error',message:err.message})}
  }
  return {handle,root};
}
module.exports={createOrganisationStorage};
