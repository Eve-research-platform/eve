'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');

const root=path.resolve(__dirname,'..');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'eve-v53-full-'));
const port=19000+Math.floor(Math.random()*2000);
const child=spawn(process.execPath,['server.js'],{
  cwd:root,
  env:{...process.env,PORT:String(port),HOST:'127.0.0.1',RESEARCHOS_RELAY_DATA:data},
  stdio:['ignore','pipe','pipe']
});
let logs='';
child.stdout.on('data',d=>logs+=d);
child.stderr.on('data',d=>logs+=d);
const base=`http://127.0.0.1:${port}`;

async function waitReady(){
  const end=Date.now()+8000;
  while(Date.now()<end){
    try{const r=await fetch(base+'/api/health');if(r.ok)return}catch{}
    await new Promise(r=>setTimeout(r,80));
  }
  throw new Error('Server did not start: '+logs);
}

(async()=>{
  try{
    await waitReady();
    let r=await fetch(base+'/');
    assert.equal(r.status,200);
    const html=await r.text();
    assert(html.includes('id="app"'));
    assert(html.includes('eve-v53-runtime.js'));
    assert(html.includes('cloud-storage.js'));
    assert(html.includes('eve-v54-theme.css'));
    r=await fetch(base+'/eve-v54-theme.css');
    assert.equal(r.status,200);
    const redesignCss=await r.text();
    assert(redesignCss.includes('--eve-plum-900:#3a2668'));
    assert(redesignCss.includes('--eve-ground:#f7f5fb'));
    r=await fetch(base+'/cloud-storage.js');
    assert.equal(r.status,200);
    const cloudClientSource=await r.text();
    assert(cloudClientSource.includes('global.EveCloud=apiSurface'));

    r=await fetch(base+'/api/health');
    assert.equal(r.status,200);
    const health=await r.json();
    assert.equal(health.ok,true);

    r=await fetch(base+'/api/mail/settings');
    assert.equal(r.status,200);
    const mailSettings=await r.json();
    assert.equal(mailSettings.ok,true);
    assert.equal(typeof mailSettings.configured,'boolean');
    assert(mailSettings.templates&&mailSettings.templates.panelWelcomeSubject);
    assert.equal(mailSettings.clientSecret,undefined);

    r=await fetch(base+'/api/panel/status');
    assert.equal(r.status,200);
    const panelStatus=await r.json();
    assert.equal(panelStatus.ok,true);
    assert.equal(panelStatus.count,0);

    r=await fetch(base+'/api/panel/register-study',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({studyId:'panel-integration-study',studyTitle:'Panel integration',studyVersion:1,panelSignup:null})
    });
    assert.equal(r.status,200);
    const panelRegistration=await r.json();
    assert(panelRegistration.completionToken);
    r=await fetch(base+'/api/panel/participation',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({token:panelRegistration.completionToken,email:'nobody@example.com',responseId:'none'})
    });
    assert.equal(r.status,200);
    const panelParticipation=await r.json();
    assert.equal(panelParticipation.matched,false);

    r=await fetch(base+'/api/connectors/config');
    assert.equal(r.status,200);
    const connectorConfig=await r.json();
    assert.equal(connectorConfig.ok,true);
    assert(connectorConfig.google&&connectorConfig.microsoft);
    assert(String(connectorConfig.google.redirectUri||'').endsWith('/api/connectors/google/callback'));
    assert(String(connectorConfig.microsoft.redirectUri||'').endsWith('/api/connectors/microsoft/callback'));

    const slug='integration-study';
    const admin='admin-capability-123';
    const envelope={iv:'abc',data:'ciphertext'};
    r=await fetch(base+`/api/studies/${slug}`,{
      method:'PUT',
      headers:{'content-type':'application/json','x-researchos-admin':admin},
      body:JSON.stringify({envelope,adminToken:admin,metadata:{studyId:'study1',version:1,status:'live',closeAtUtc:'',publishedAt:Date.now()}})
    });
    if(r.status!==200)throw new Error(`Expected 200, got ${r.status}: ${await r.text()}`);

    r=await fetch(base+`/api/studies/${slug}?version=1`);
    assert.equal(r.status,200);
    let payload=await r.json();
    assert.deepEqual(payload.envelope,envelope);
    assert.equal(payload.metadata.version,1);

    const invite='invite-token-1';
    r=await fetch(base+`/api/studies/${slug}/invitations`,{
      method:'POST',
      headers:{'content-type':'application/json','x-researchos-admin':admin},
      body:JSON.stringify({invitations:[{token:invite,campaignId:'camp1',segmentId:'seg1',version:1,emailHash:'hash'}]})
    });
    if(r.status!==200)throw new Error(`Expected 200, got ${r.status}: ${await r.text()}`);

    const recording={id:'rec_1',envelope:{v:1,iv:'recording-iv',data:'encrypted-media',mimeType:'audio/webm',size:1234},routing:{responseId:'resp_1',blockId:'recording_block',source:'customer-list',campaignId:'camp1',segmentId:'seg1',inviteToken:invite,version:1}};
    r=await fetch(base+`/api/studies/${slug}/recordings`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(recording)});
    if(r.status!==201)throw new Error(`Expected recording 201, got ${r.status}: ${await r.text()}`);
    payload=await r.json();
    assert.equal(payload.id,'rec_1');

    // Recording upload validates a controlled invitation but does not consume it; the response still can submit.
    r=await fetch(base+`/api/studies/${slug}/recordings/rec_1`,{headers:{'x-researchos-admin':admin}});
    assert.equal(r.status,200);
    payload=await r.json();
    assert.deepEqual(payload.envelope,recording.envelope);
    r=await fetch(base+`/api/studies/${slug}/recordings/rec_1`,{headers:{'x-researchos-admin':'wrong'}});
    assert.equal(r.status,403);

    const response={id:'resp_1',envelope:{iv:'iv',data:'encrypted-response'},routing:{source:'customer-list',campaignId:'camp1',segmentId:'seg1',inviteToken:invite,version:1}};
    r=await fetch(base+`/api/studies/${slug}/responses`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(response)});
    if(r.status!==201)throw new Error(`Expected 201, got ${r.status}: ${await r.text()}`);
    payload=await r.json();
    assert.equal(payload.ok,true);
    assert(Number.isFinite(payload.receivedAt));

    // One-use controlled invitation.
    r=await fetch(base+`/api/studies/${slug}/responses`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...response,id:'resp_2'})});
    assert.equal(r.status,409);

    r=await fetch(base+`/api/studies/${slug}/responses?offset=0&limit=250`,{headers:{'x-researchos-admin':admin}});
    assert.equal(r.status,200);
    payload=await r.json();
    assert.equal(payload.responses.length,1);
    assert.equal(payload.responses[0].id,'resp_1');

    r=await fetch(base+`/api/studies/${slug}/responses`,{headers:{'x-researchos-admin':'wrong'}});
    assert.equal(r.status,403);

    r=await fetch(base+`/api/studies/${slug}`,{
      method:'PATCH',headers:{'content-type':'application/json','x-researchos-admin':admin},body:JSON.stringify({status:'closed'})
    });
    assert.equal(r.status,200);
    r=await fetch(base+`/api/studies/${slug}?version=1`);
    assert.equal(r.status,410);

    // Permanent archive purge removes the encrypted study and its relay-owned data.
    r=await fetch(base+`/api/studies/${slug}`,{method:'DELETE',headers:{'x-researchos-admin':'wrong'}});
    assert.equal(r.status,403);
    r=await fetch(base+`/api/studies/${slug}`,{method:'DELETE',headers:{'x-researchos-admin':admin}});
    assert.equal(r.status,200);
    payload=await r.json();
    assert.equal(payload.deleted,true);
    r=await fetch(base+`/api/studies/${slug}?version=1`);
    assert.equal(r.status,404);
    r=await fetch(base+`/api/studies/${slug}/responses`,{headers:{'x-researchos-admin':admin}});
    assert.equal(r.status,404);

    // Local unconfigured mode must be possible: auth endpoints are present but not configured.
    r=await fetch(base+'/api/auth/config');
    assert.equal(r.status,200);
    payload=await r.json();
    assert.equal(payload.configured,false);

    console.log('full build integration tests passed');
  } finally {
    child.kill('SIGTERM');
  }
})().catch(err=>{console.error(err);child.kill('SIGTERM');process.exit(1)});
