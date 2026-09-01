'use strict';

const fs=require('fs');
const path=require('path');

function clone(value){return value==null?value:JSON.parse(JSON.stringify(value))}
function readJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return clone(fallback)}}
function atomicWrite(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=`${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp,JSON.stringify(value,null,2),{mode:0o600});
  fs.renameSync(tmp,file);
}

function createStateStore({dataDir,namespace='eve',backendOverride=null,poolOverride=null}={}){
  if(!dataDir)throw new Error('state store requires dataDir');
  const pgEnvConfigured=!!(process.env.PGHOST&&process.env.PGUSER&&process.env.PGDATABASE);
  const backend=String(backendOverride||process.env.EVE_STATE_BACKEND||((process.env.EVE_DATABASE_URL||process.env.DATABASE_URL||pgEnvConfigured)?'postgres':'file')).trim().toLowerCase();
  const databaseUrl=String(process.env.EVE_DATABASE_URL||process.env.DATABASE_URL||'').trim();
  const cache=new Map(),dirty=new Set(),registry=new Map();
  let pool=null,ready=false,chain=Promise.resolve();
  function key(prefix,name){return `${String(prefix||'').replace(/^\/+|\/+$/g,'')}/${String(name||'').replace(/^\/+|\/+$/g,'')}`}
  function register(fullKey,legacyFile,fallback){registry.set(fullKey,{legacyFile,fallback:clone(fallback)});if(cache.has(fullKey))return;if(legacyFile&&fs.existsSync(legacyFile)){cache.set(fullKey,readJson(legacyFile,fallback));if(backend==='postgres')dirty.add(fullKey)}}
  function scope(prefix,mapping={}){for(const [name,entry] of Object.entries(mapping)){const spec=typeof entry==='string'?{legacyFile:entry,fallback:[]}:(entry||{});register(key(prefix,name),spec.legacyFile||'',spec.fallback===undefined?[]:spec.fallback)}return{
    read(name,fallback=[]){const full=key(prefix,name),reg=registry.get(full);if(backend==='file')return readJson(reg?.legacyFile||path.join(dataDir,'state',`${full}.json`),fallback);return cache.has(full)?clone(cache.get(full)):clone(reg?.fallback===undefined?fallback:reg.fallback)},
    write(name,value){const full=key(prefix,name),reg=registry.get(full);if(backend==='file'){atomicWrite(reg?.legacyFile||path.join(dataDir,'state',`${full}.json`),value);return value}cache.set(full,clone(value));dirty.add(full);return value},
    remove(name){const full=key(prefix,name),reg=registry.get(full);if(backend==='file'){try{fs.rmSync(reg?.legacyFile||path.join(dataDir,'state',`${full}.json`),{force:true})}catch{};return}cache.delete(full);dirty.add(full)}
  }}
  async function initialize(){if(ready)return;if(backend!=='postgres'){ready=true;return}if(!poolOverride&&!databaseUrl&&!pgEnvConfigured)throw new Error('EVE_STATE_BACKEND=postgres requires EVE_DATABASE_URL/DATABASE_URL or standard PGHOST/PGUSER/PGDATABASE settings.');if(poolOverride)pool=poolOverride;else{let Pg;try{Pg=require('pg')}catch{throw new Error('Postgres state backend requires the "pg" package. Run npm install before starting Eve.')}pool=new Pg.Pool({...(databaseUrl?{connectionString:databaseUrl}:{}),max:Math.max(2,Number(process.env.EVE_DB_POOL_SIZE||10)),idleTimeoutMillis:30000,connectionTimeoutMillis:10000,ssl:String(process.env.EVE_DATABASE_SSL||'').toLowerCase()==='require'?{rejectUnauthorized:false}:undefined})}await pool.query(`CREATE TABLE IF NOT EXISTS eve_state (namespace text NOT NULL,key text NOT NULL,value jsonb NOT NULL,version bigint NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(namespace,key))`);const rows=await pool.query('SELECT key,value FROM eve_state WHERE namespace=$1',[namespace]);for(const row of rows.rows)cache.set(row.key,row.value);ready=true}
  async function flushWith(client,{insertOnly=false}={}){for(const full of [...dirty]){if(cache.has(full)){const value=cache.get(full);if(insertOnly)await client.query('INSERT INTO eve_state(namespace,key,value) VALUES($1,$2,$3::jsonb) ON CONFLICT(namespace,key) DO NOTHING',[namespace,full,JSON.stringify(value)]);else await client.query(`INSERT INTO eve_state(namespace,key,value,version) VALUES($1,$2,$3::jsonb,1) ON CONFLICT(namespace,key) DO UPDATE SET value=EXCLUDED.value,version=eve_state.version+1,updated_at=now()`,[namespace,full,JSON.stringify(value)])}else await client.query('DELETE FROM eve_state WHERE namespace=$1 AND key=$2',[namespace,full]);dirty.delete(full)}}
  async function flushInitial(){if(backend!=='postgres'||!dirty.size)return;await initialize();const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${namespace}:bootstrap`]);await flushWith(client,{insertOnly:true});await client.query('COMMIT');const rows=await pool.query('SELECT key,value FROM eve_state WHERE namespace=$1',[namespace]);cache.clear();for(const row of rows.rows)cache.set(row.key,row.value)}catch(err){try{await client.query('ROLLBACK')}catch{};throw err}finally{client.release()}}
  async function refreshWith(client){const rows=await client.query('SELECT key,value FROM eve_state WHERE namespace=$1',[namespace]);cache.clear();for(const row of rows.rows)cache.set(row.key,row.value);for(const [full,reg] of registry){if(cache.has(full))continue;if(reg.legacyFile&&fs.existsSync(reg.legacyFile)){cache.set(full,readJson(reg.legacyFile,reg.fallback));dirty.add(full)}}}
  function serial(fn){const run=chain.then(fn,fn);chain=run.catch(()=>{});return run}
  async function withControlPlane(fn){if(backend!=='postgres')return fn();await initialize();return serial(async()=>{const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${namespace}:control-plane`]);dirty.clear();await refreshWith(client);const result=await fn();await flushWith(client);await client.query('COMMIT');return result}catch(err){try{await client.query('ROLLBACK')}catch{};throw err}finally{client.release()}})}
  async function advisoryLock(lockKey,fn){if(backend!=='postgres')return fn();await initialize();const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${namespace}:${String(lockKey).slice(0,500)}`]);const result=await fn(client);await client.query('COMMIT');return result}catch(err){try{await client.query('ROLLBACK')}catch{};throw err}finally{client.release()}}
  async function health(){if(backend!=='postgres')return{ok:true,backend:'file',concurrent:false};try{await initialize();const start=Date.now();await pool.query('SELECT 1');return{ok:true,backend:'postgres',concurrent:true,latencyMs:Date.now()-start}}catch(err){return{ok:false,backend:'postgres',concurrent:false,error:String(err?.message||err)}}}
  async function close(){if(pool)await pool.end()}
  function info(){return{backend,postgres:backend==='postgres',concurrent:backend==='postgres'}}
  function isReady(){return ready}
  return{initialize,flushInitial,scope,withControlPlane,advisoryLock,health,close,info,isReady,pgPool:()=>pool};
}
module.exports={createStateStore};
