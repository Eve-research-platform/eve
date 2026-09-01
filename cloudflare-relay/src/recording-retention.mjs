function graceMs(env){
  const hours=Math.max(1,Math.min(168,Number(env.EVE_RECORDING_RELAY_GRACE_HOURS||48)||48));
  return hours*60*60*1000;
}
async function readJson(bucket,key){
  const obj=await bucket.get(key);if(!obj)return null;
  try{return await obj.json()}catch{return null}
}
async function writeJson(bucket,key,value){
  await bucket.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'}})
}
export async function scheduleRecordingPurge(bucket,key,env,now=Date.now()){
  const record=await readJson(bucket,key);if(!record)return null;
  const purgeAfter=Number(record.retention?.purgeAfter)||now+graceMs(env);
  record.retention={status:'scheduled',scheduledAt:Number(record.retention?.scheduledAt)||now,purgeAfter};
  await writeJson(bucket,key,record);
  return record.retention;
}
export async function purgeExpiredRecordings(bucket,now=Date.now(),maxDeletes=1000){
  let cursor,deleted=0,checked=0;
  do{
    const listed=await bucket.list({prefix:'recordings/',cursor,limit:250});
    for(const obj of listed.objects){
      if(deleted>=maxDeletes)return{deleted,checked,limited:true};
      checked++;
      const record=await readJson(bucket,obj.key),purgeAfter=Number(record?.retention?.purgeAfter||0);
      if(purgeAfter&&purgeAfter<=now){await bucket.delete(obj.key);deleted++}
    }
    cursor=listed.truncated?listed.cursor:undefined;
  }while(cursor);
  return{deleted,checked,limited:false}
}
