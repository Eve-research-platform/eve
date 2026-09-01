import assert from 'node:assert';
import worker from '../cloudflare-relay/src/worker.mjs';

class Obj {
  constructor(value){this.value=value}
  async json(){return JSON.parse(this.value)}
}
class R2 {
  constructor(){this.map=new Map()}
  async get(key){return this.map.has(key)?new Obj(this.map.get(key)):null}
  async put(key,value){this.map.set(key,String(value))}
  async delete(keyOrKeys){
    if(Array.isArray(keyOrKeys))for(const k of keyOrKeys)this.map.delete(k);
    else this.map.delete(keyOrKeys);
  }
  async list({prefix='',cursor,limit=1000}={}){
    const keys=[...this.map.keys()].filter(k=>k.startsWith(prefix)).sort();
    const start=cursor?Number(cursor):0,slice=keys.slice(start,start+limit),next=start+slice.length;
    return {objects:slice.map(key=>({key})),truncated:next<keys.length,cursor:next<keys.length?String(next):undefined};
  }
}
const env={EVE_RELAY:new R2(),EVE_RELAY_OWNER_KEY:'owner-key',EVE_MAX_RESPONSES_PER_STUDY:'10000',ASSETS:{fetch:async()=>new Response('<!doctype html><title>Eve</title>',{headers:{'content-type':'text/html'}})}};
const call=(path,init={})=>worker.fetch(new Request(`https://relay.example${path}`,init),env);
const json=async r=>({status:r.status,data:await r.json()});

let r=await call('/api/health');
assert.equal(r.status,200);
assert.equal((await r.json()).mode,'cloudflare-zero-access-relay');

r=await call('/api/owner-check',{headers:{'X-Eve-Owner':'wrong'}});
assert.equal(r.status,403);
r=await call('/api/owner-check',{headers:{'X-Eve-Owner':'owner-key'}});
assert.equal(r.status,200);

const participantHash='participant-proof';
const publication={envelope:{v:1,iv:'x',data:'cipher'},adminToken:'study-admin',metadata:{studyId:'s1',version:1,status:'live',closeAtUtc:'',participantHash}};
r=await call('/api/studies/study-one',{method:'PUT',headers:{'Content-Type':'application/json','X-Eve-Owner':'wrong','X-ResearchOS-Admin':'study-admin'},body:JSON.stringify(publication)});
assert.equal(r.status,403);
r=await call('/api/studies/study-one',{method:'PUT',headers:{'Content-Type':'application/json','X-Eve-Owner':'owner-key','X-ResearchOS-Admin':'study-admin'},body:JSON.stringify(publication)});
assert.equal(r.status,200);

r=await call('/api/studies/study-one');
assert.equal(r.status,403);
r=await call('/api/studies/study-one',{headers:{'X-Eve-Participant':participantHash}});
assert.equal(r.status,200);

const response={id:'response-one',envelope:{v:1,iv:'r',data:'cipher-response'},routing:{version:1,source:'direct'}};
r=await call('/api/studies/study-one/responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(response)});
assert.equal(r.status,403);
r=await call('/api/studies/study-one/responses',{method:'POST',headers:{'Content-Type':'application/json','X-Eve-Participant':participantHash},body:JSON.stringify(response)});
assert.equal(r.status,201);
assert.equal((await r.json()).idempotent,false);
r=await call('/api/studies/study-one/responses',{method:'POST',headers:{'Content-Type':'application/json','X-Eve-Participant':participantHash},body:JSON.stringify(response)});
assert.equal(r.status,200);
assert.equal((await r.json()).idempotent,true);

r=await call('/api/studies/study-one/responses',{headers:{'X-Eve-Owner':'owner-key','X-ResearchOS-Admin':'study-admin'}});
assert.equal(r.status,200);
assert.equal((await r.json()).total,1);

r=await call('/api/studies/study-one',{method:'PATCH',headers:{'Content-Type':'application/json','X-Eve-Owner':'owner-key','X-ResearchOS-Admin':'study-admin'},body:JSON.stringify({status:'closed'})});
assert.equal(r.status,200);
r=await call('/api/studies/study-one',{headers:{'X-Eve-Participant':participantHash}});
assert.equal(r.status,410);

r=await call('/');
assert.equal(r.status,200);
assert.equal(r.headers.get('x-frame-options'),'DENY');

console.log('v58 Cloudflare R2 relay integration test passed');
