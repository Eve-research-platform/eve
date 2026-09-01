import assert from 'node:assert';
import worker from '../cloudflare-relay/src/worker.mjs';

class Obj{constructor(value){this.value=value}async json(){return JSON.parse(this.value)}}
class R2{
  constructor(){this.map=new Map()}
  async get(key){return this.map.has(key)?new Obj(this.map.get(key)):null}
  async put(key,value){this.map.set(key,String(value))}
  async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])this.map.delete(key)}
  async list({prefix='',cursor,limit=1000}={}){const keys=[...this.map.keys()].filter(k=>k.startsWith(prefix)).sort(),start=cursor?Number(cursor):0,slice=keys.slice(start,start+limit),next=start+slice.length;return{objects:slice.map(key=>({key})),truncated:next<keys.length,cursor:next<keys.length?String(next):undefined}}
}
const env={EVE_RELAY:new R2(),EVE_RELAY_OWNER_KEY:'owner-key',EVE_RECORDING_RELAY_GRACE_HOURS:'1',ASSETS:{fetch:async()=>new Response('ok')}};
const call=(path,init={})=>worker.fetch(new Request(`https://relay.example${path}`,init),env);
const admin={'Content-Type':'application/json','X-Eve-Owner':'owner-key','X-ResearchOS-Admin':'study-admin'};
const participant='participant-proof';
let r=await call('/api/studies/study-one',{method:'PUT',headers:admin,body:JSON.stringify({envelope:{v:1},adminToken:'study-admin',metadata:{studyId:'s1',version:1,status:'live',participantHash:participant}})});
assert.equal(r.status,200);
r=await call('/api/studies/study-one/recordings',{method:'POST',headers:{'Content-Type':'application/json','X-Eve-Participant':participant},body:JSON.stringify({id:'rec-1',envelope:{v:1,data:'cipher'},routing:{responseId:'r1',blockId:'b1',version:1}})});
assert.equal(r.status,201);
r=await call('/api/studies/study-one/recordings/rec-1',{method:'POST'});assert.equal(r.status,403);
const before=Date.now();r=await call('/api/studies/study-one/recordings/rec-1',{method:'POST',headers:admin});assert.equal(r.status,200);
const scheduled=await r.json();assert.equal(scheduled.retention.status,'scheduled');assert(scheduled.retention.purgeAfter>=before+3590000);
assert(env.EVE_RELAY.map.has('recordings/study-one/rec-1.json'));
await worker.scheduled({scheduledTime:scheduled.retention.purgeAfter+1},env,{});
assert(!env.EVE_RELAY.map.has('recordings/study-one/rec-1.json'));
r=await call('/api/studies/study-one/recordings/rec-1',{headers:admin});assert.equal(r.status,404);
console.log('v62.5 relay recording retention lifecycle passed');
