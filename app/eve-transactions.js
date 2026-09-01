'use strict';

(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.EveTransactions=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const locks=new Set();

  function begin(key){
    const k=String(key||'');
    if(!k||locks.has(k))return false;
    locks.add(k);
    return true;
  }

  function end(key){locks.delete(String(key||''))}
  function busy(key){return locks.has(String(key||''))}

  function clone(value){
    if(typeof structuredClone==='function'){
      try{return structuredClone(value)}catch{}
    }
    return JSON.parse(JSON.stringify(value));
  }

  function setButtonBusy(button,isBusy,label='Working…'){
    if(!button)return;
    if(isBusy){
      if(!button.dataset.evePreviousText)button.dataset.evePreviousText=button.textContent;
      button.disabled=true;
      button.setAttribute('aria-busy','true');
      if(label)button.textContent=label;
      return;
    }
    button.disabled=false;
    button.removeAttribute('aria-busy');
    if(button.dataset.evePreviousText){
      button.textContent=button.dataset.evePreviousText;
      delete button.dataset.evePreviousText;
    }
  }

  function txError(stage,message,cause=null){
    const error=new Error(message||`Transaction failed at ${stage}`);
    error.name='EveTransactionError';
    error.stage=stage;
    if(cause)error.cause=cause;
    return error;
  }

  async function run(options={}){
    const key=String(options.key||'');
    if(!begin(key))return {ok:false,busy:true,stage:'lock',error:txError('lock','Transaction already in progress')};

    let snapshot;
    let applied=false;
    let persisted=false;
    let remoteCommitted=false;
    let finalPersisted=false;

    const ctx={
      key,
      get snapshot(){return snapshot},
      get applied(){return applied},
      get persisted(){return persisted},
      get remoteCommitted(){return remoteCommitted},
      get finalPersisted(){return finalPersisted}
    };

    try{
      snapshot=options.snapshot?await options.snapshot(ctx):undefined;
      if(options.prepare){
        const prepared=await options.prepare(ctx);
        if(prepared===false)throw txError('prepare',options.prepareError||'Transaction preparation failed');
      }
      if(options.apply){
        await options.apply(ctx);
        applied=true;
      }
      if(options.persist){
        const saved=await options.persist(ctx);
        if(saved===false)throw txError('persist',options.persistError||'Transaction could not be persisted');
        persisted=true;
      }
      if(options.remote){
        const remote=await options.remote(ctx);
        if(remote===false)throw txError('remote',options.remoteError||'Remote operation could not be confirmed');
        remoteCommitted=true;
      }
      if(options.finalize)await options.finalize(ctx);
      if(options.finalPersist){
        const saved=await options.finalPersist(ctx);
        if(saved===false)throw txError('final-persist',options.finalPersistError||'Final transaction state could not be persisted');
        finalPersisted=true;
      }
      if(options.commit)await options.commit(ctx);
      return {ok:true,busy:false,stage:'commit',snapshot,applied,persisted,remoteCommitted,finalPersisted};
    }catch(error){
      const stage=error?.stage||'execute';
      let remoteRollbackOk=true;
      let restored=true;
      let rollbackPersistOk=true;

      if(remoteCommitted&&options.rollbackRemote){
        try{remoteRollbackOk=(await options.rollbackRemote(ctx,error))!==false}
        catch{remoteRollbackOk=false}
      }
      if(options.restore){
        try{await options.restore(ctx,error)}
        catch{restored=false}
      }
      if(persisted&&options.rollbackPersist){
        try{rollbackPersistOk=(await options.rollbackPersist(ctx,error))!==false}
        catch{rollbackPersistOk=false}
      }
      if(options.rollback){
        try{await options.rollback(ctx,error)}
        catch{}
      }

      return {
        ok:false,busy:false,stage,error,
        snapshot,applied,persisted,remoteCommitted,finalPersisted,
        rollback:{remote:remoteRollbackOk,restored,persisted:rollbackPersistOk}
      };
    }finally{
      end(key);
    }
  }

  return {begin,end,busy,clone,setButtonBusy,txError,run};
});
