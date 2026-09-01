'use strict';
const assert=require('assert');
const Tx=require('../app/eve-transactions.js');
const {create}=require('../app/eve-study-lifecycle.js');

function clone(v){return JSON.parse(JSON.stringify(v))}
function harness(options={}){
  let clock=1000,persistIndex=0;
  const toasts=[],notices=[],navigations=[],panelCalls=[],publishCalls=[],lifecycleCalls=[];
  const remote={exists:false,latestVersion:0,lifecycle:{status:'closed'},statusAvailable:true};
  const study={
    id:'s1',slug:'study-one',title:'Study one',method:'Interview',
    status:'draft',version:1,publishedAt:null,publishedVersions:{},publishedSnapshot:null,
    relayPublished:false,relayVersionKeys:{},relayKey:'',relayAdminToken:'',
    panelStudyToken:'',hasUnpublishedChanges:false,
    settings:{closeAtUtc:''},pages:[{id:'p1',title:'Page 1'}],
    blocks:[{id:'b1',pageId:'p1',type:'intro',title:'Welcome'}],updatedAt:1
  };
  const state={studies:[study],relayOnline:null};
  const persistResults=options.persistResults||[];
  const deps={
    state,
    currentStudy:()=>study,
    refreshDirty:s=>s.hasUnpublishedChanges,
    latestPublishedVersion:s=>Math.max(0,...Object.keys(s.publishedVersions||{}).map(Number)),
    snapshotForVersion:(s,v)=>s.publishedVersions?.[String(v||s.version)]||null,
    publishedStudy:(s,v)=>s.publishedVersions?.[String(v||s.version)]?.data||null,
    closingInstant:s=>{const raw=s?.settings?.closeAtUtc;return raw?Date.parse(raw):null},
    validateStudy:()=>options.validateStudy!==false,
    preparePanelStudyRegistration:async(s,v)=>{
      panelCalls.push(v);
      if(options.panelError)throw options.panelError;
      s.panelStudyToken=`panel-${v}`;
      return {ok:true};
    },
    prepareRelayCredentials:(s,v)=>{
      s.relayVersionKeys=s.relayVersionKeys||{};
      s.relayVersionKeys[String(v)]=s.relayVersionKeys[String(v)]||`key-${v}`;
      s.relayKey=s.relayVersionKeys[String(v)];
      s.relayAdminToken=s.relayAdminToken||'admin-token';
      return true;
    },
    versionedStudyData:s=>clone({id:s.id,slug:s.slug,title:s.title,method:s.method,panelStudyToken:s.panelStudyToken,settings:s.settings,pages:s.pages,blocks:s.blocks}),
    relayHealth:async()=>options.relayHealth===undefined?true:!!options.relayHealth,
    relayPublishStudy:async(s,snapshot)=>{
      publishCalls.push(snapshot.version);
      if(options.publish){
        return options.publish({s,snapshot,remote});
      }
      remote.exists=true;remote.latestVersion=Math.max(remote.latestVersion,snapshot.version);remote.lifecycle.status=s.status;s.relayPublished=true;return true;
    },
    relayUpdateLifecycle:async s=>{
      lifecycleCalls.push(s.status);
      if(options.lifecycleUpdate)return options.lifecycleUpdate({s,remote});
      if(!remote.exists)return false;
      remote.lifecycle.status=s.status;return true;
    },
    relayStudyStatus:async()=>{
      if(!remote.statusAvailable||!remote.exists)return null;
      return {latestVersion:remote.latestVersion,lifecycle:{...remote.lifecycle}};
    },
    persistWorkspace:async()=>{
      const value=persistIndex<persistResults.length?persistResults[persistIndex++]:true;
      return value;
    },
    render:()=>{},
    toast:(message)=>toasts.push(message),
    miniNotice:async(title,message)=>notices.push({title,message}),
    navigate:path=>navigations.push(path),
    now:()=>++clock
  };
  return {ops:create(deps),study,state,remote,toasts,notices,navigations,panelCalls,publishCalls,lifecycleCalls,deps};
}
function publishV1(h,status='live'){
  const data=clone({id:h.study.id,slug:h.study.slug,title:h.study.title,method:h.study.method,panelStudyToken:'',settings:h.study.settings,pages:h.study.pages,blocks:h.study.blocks,version:1,status:'live'});
  const snap={version:1,publishedAt:900,data};
  h.study.version=1;h.study.publishedAt=900;h.study.publishedVersions={'1':snap};h.study.publishedSnapshot=snap;h.study.status=status;
  h.remote.exists=true;h.remote.latestVersion=1;h.remote.lifecycle.status=status;
  h.study.relayPublished=true;h.study.relayAdminToken='admin-token';h.study.relayKey='key-1';h.study.relayVersionKeys={'1':'key-1'};
}

(async()=>{
  {
    const h=harness();
    assert.equal(await h.ops.goLiveStudy('s1'),true);
    assert.equal(h.study.status,'live');
    assert.equal(h.study.version,1);
    assert.equal(h.study.relayPublished,true);
    assert(h.study.publishedVersions['1']);
    assert.deepEqual(h.publishCalls,[1]);
    assert.deepEqual(h.panelCalls,[1]);
    assert.equal(h.remote.lifecycle.status,'live');
  }

  {
    const h=harness({relayHealth:false});
    assert.equal(await h.ops.goLiveStudy('s1'),false);
    assert.equal(h.study.status,'draft');
    assert.equal(h.study.panelStudyToken,'','prepare mutations must roll back when relay is unavailable');
    assert.equal(h.publishCalls.length,0);
  }

  {
    const panelError=Object.assign(new Error('mail'),{data:{error:'mail_not_configured'}});
    const h=harness({panelError});
    assert.equal(await h.ops.goLiveStudy('s1'),false);
    assert.equal(h.study.status,'draft');
    assert.equal(h.notices.at(-1).title,'Panel sign-up is not ready');
    assert(h.notices.at(-1).message.includes('Microsoft 365 email'));
  }

  {
    const h=harness({persistResults:[false]});
    assert.equal(await h.ops.goLiveStudy('s1'),false);
    assert.equal(h.study.status,'draft');
    assert.equal(h.publishCalls.length,0);
  }

  {
    const h=harness({
      publish:({s,snapshot,remote})=>{
        // Simulate server commit + lost browser response.
        remote.exists=true;remote.latestVersion=snapshot.version;remote.lifecycle.status='live';
        s.relayPublished=false;
        return false;
      }
    });
    assert.equal(await h.ops.goLiveStudy('s1'),true,'admin status reconciliation should resolve an ambiguous publish');
    assert.equal(h.study.status,'live');
    assert.equal(h.study.relayPublished,true);
    assert.equal(h.remote.latestVersion,1);
  }

  {
    const h=harness({persistResults:[true,false,true]});
    assert.equal(await h.ops.goLiveStudy('s1'),false);
    assert.equal(h.study.status,'draft');
    assert.equal(h.remote.lifecycle.status,'closed','confirmed remote publication must be closed when final local persistence fails');
  }

  {
    const h=harness({persistResults:[true,false,true,true]});
    publishV1(h,'live');
    h.study.hasUnpublishedChanges=true;
    h.study.title='Changed title';
    assert.equal(await h.ops.goLiveStudy('s1'),false);
    assert.equal(h.study.status,'closed','failed update rollback must align the local study with remotely closed access');
    assert.equal(h.study.hasUnpublishedChanges,true);
    assert.equal(h.remote.latestVersion,2);
    assert.equal(h.remote.lifecycle.status,'closed');
    assert(h.toasts.at(-1).includes('now Off'));
  }

  {
    const h=harness();
    publishV1(h,'closed');
    assert.equal(await h.ops.goLiveStudy('s1'),true);
    assert.equal(h.study.status,'live');
    assert.equal(h.remote.lifecycle.status,'live');
  }

  {
    const h=harness();
    publishV1(h,'closed');
    h.study.settings.closeAtUtc=new Date(500).toISOString();
    h.study.publishedVersions['1'].data.settings.closeAtUtc=h.study.settings.closeAtUtc;
    assert.equal(await h.ops.goLiveStudy('s1'),false);
    assert.equal(h.study.status,'closed');
    assert.equal(h.navigations.at(-1),'/study/s1/settings');
  }

  {
    const h=harness({
      lifecycleUpdate:({s,remote})=>{
        // Server applies Off but browser loses the PATCH response.
        remote.lifecycle.status=s.status;
        return false;
      }
    });
    publishV1(h,'live');
    assert.equal(await h.ops.turnOffStudy('s1'),true);
    assert.equal(h.study.status,'closed');
    assert.equal(h.remote.lifecycle.status,'closed');
  }

  {
    const h=harness({
      lifecycleUpdate:()=>false,
      persistResults:[true,true]
    });
    publishV1(h,'live');
    h.remote.lifecycle.status='live';
    assert.equal(await h.ops.turnOffStudy('s1'),false);
    assert.equal(h.study.status,'live');
    assert.equal(h.remote.lifecycle.status,'live');
  }

  {
    const h=harness();
    assert.equal(Tx.begin('lifecycle:s1'),true);
    try{
      assert.equal(await h.ops.goLiveStudy('s1'),false);
      assert(h.toasts.at(-1).includes('already in progress'));
      assert.equal(h.study.status,'draft');
    }finally{Tx.end('lifecycle:s1')}
  }

  console.log('v56.2 Study lifecycle failure matrix passed');
})().catch(err=>{console.error(err);process.exit(1)});
