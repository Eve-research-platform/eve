'use strict';
const assert=require('assert');
const Tx=require('../app/eve-transactions.js');

(async()=>{
  const state={value:'before'};
  let persisted='before',remote='before';

  let result=await Tx.run({
    key:'happy',
    snapshot:()=>Tx.clone(state),
    apply:()=>{state.value='after'},
    persist:()=>{persisted=state.value;return true},
    remote:()=>{remote=state.value;return true}
  });
  assert.equal(result.ok,true);
  assert.equal(state.value,'after');
  assert.equal(persisted,'after');
  assert.equal(remote,'after');
  assert.equal(Tx.busy('happy'),false);

  state.value='before';persisted='before';remote='before';
  result=await Tx.run({
    key:'persist-fail',
    snapshot:()=>Tx.clone(state),
    apply:()=>{state.value='after'},
    persist:()=>false,
    restore:ctx=>Object.assign(state,ctx.snapshot),
    rollbackPersist:()=>{throw new Error('must not run when first persist failed')}
  });
  assert.equal(result.ok,false);
  assert.equal(result.stage,'persist');
  assert.equal(state.value,'before');
  assert.equal(result.rollback.restored,true);

  state.value='before';persisted='before';
  result=await Tx.run({
    key:'remote-fail',
    snapshot:()=>Tx.clone(state),
    apply:()=>{state.value='after'},
    persist:()=>{persisted=state.value;return true},
    remote:()=>false,
    restore:ctx=>Object.assign(state,ctx.snapshot),
    rollbackPersist:()=>{persisted=state.value;return true}
  });
  assert.equal(result.ok,false);
  assert.equal(result.stage,'remote');
  assert.equal(state.value,'before');
  assert.equal(persisted,'before');
  assert.equal(result.rollback.persisted,true);

  state.value='before';persisted='before';remote='before';
  result=await Tx.run({
    key:'final-persist-fail',
    snapshot:()=>Tx.clone(state),
    apply:()=>{state.value='after'},
    persist:()=>{persisted=state.value;return true},
    remote:()=>{remote='after';return true},
    finalPersist:()=>false,
    rollbackRemote:()=>{remote='before';return true},
    restore:ctx=>Object.assign(state,ctx.snapshot),
    rollbackPersist:()=>{persisted=state.value;return true}
  });
  assert.equal(result.ok,false);
  assert.equal(result.stage,'final-persist');
  assert.equal(remote,'before');
  assert.equal(state.value,'before');
  assert.equal(persisted,'before');

  assert.equal(Tx.begin('busy'),true);
  const busy=await Tx.run({key:'busy'});
  assert.equal(busy.ok,false);
  assert.equal(busy.busy,true);
  Tx.end('busy');

  const button={
    textContent:'Save',
    disabled:false,
    dataset:{},
    attrs:new Map(),
    setAttribute(k,v){this.attrs.set(k,v)},
    removeAttribute(k){this.attrs.delete(k)}
  };
  Tx.setButtonBusy(button,true,'Saving…');
  assert.equal(button.disabled,true);
  assert.equal(button.textContent,'Saving…');
  assert.equal(button.attrs.get('aria-busy'),'true');
  Tx.setButtonBusy(button,false);
  assert.equal(button.disabled,false);
  assert.equal(button.textContent,'Save');
  assert.equal(button.attrs.has('aria-busy'),false);

  console.log('v56 transaction infrastructure tests passed');
})().catch(err=>{console.error(err);process.exit(1)});
