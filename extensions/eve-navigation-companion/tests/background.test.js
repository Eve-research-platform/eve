const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const store = new Map();
const sent = [];
const tabUpdates = [];
const tabRemovals = [];
const windowUpdates = [];
let nextTabId = 20;
let messageHandler = null;
let removedHandler = null;

const chrome = {
  storage: {
    session: {
      async get(key) { return { [key]: store.get(key) }; },
      async set(obj) { for (const [k,v] of Object.entries(obj)) store.set(k,v); },
      async remove(key) { store.delete(key); }
    }
  },
  runtime: {
    getManifest() { return { version: '1.0.0' }; },
    onMessage: { addListener(fn) { messageHandler = fn; } }
  },
  tabs: {
    async create({url}) { return { id: nextTabId++, url }; },
    async sendMessage(tabId, message) { sent.push({tabId, message}); },
    async update(tabId, options) { tabUpdates.push({tabId, options}); return {id:tabId,...options}; },
    async remove(tabId) { tabRemovals.push(tabId); },
    onRemoved: { addListener(fn) { removedHandler = fn; } }
  },
  windows: {
    async update(windowId, options) { windowUpdates.push({windowId, options}); return {id:windowId,...options}; }
  }
};

const context = vm.createContext({ chrome, URL, Date, Math, console, setTimeout, clearTimeout });
const code = fs.readFileSync(require('path').join(__dirname,'..','background.js'),'utf8');
vm.runInContext(code, context, { filename: 'background.js' });
assert(messageHandler, 'background message handler registered');
assert(removedHandler, 'tab removal handler registered');

function dispatch(message, sender) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(()=>reject(new Error('message timeout')), 1000);
    messageHandler(message, sender, response => { clearTimeout(timeout); resolve(response); });
  });
}

(async()=>{
  const start = await dispatch({type:'EVE_NAV_START_TASK',task:{taskId:'task-1',instructions:'Find settings',startPage:'https://example.com/start',successPage:'https://example.com/success',timeoutSeconds:300,startedAt:Date.now()}},{tab:{id:7,windowId:3,url:'http://localhost/eve'}});
  assert.equal(start.ok,true);
  assert.equal(start.taskTabId,20);
  const active = store.get('eveActiveNavigationTask');
  assert(active && active.taskId==='task-1');
  assert.equal(active.sourceTabId,7);
  assert.equal(active.taskTabId,20);
  assert.equal(active.successPage,'https://example.com/success');

  const wrong = await dispatch({type:'EVE_NAV_COMPLETE_TASK'},{tab:{id:99,url:'https://example.com'}});
  assert.equal(wrong.ok,false);

  const taskForTab = await dispatch({type:'EVE_NAV_GET_TASK_FOR_TAB'},{tab:{id:20,url:'https://example.com/start'}});
  assert.equal(taskForTab.ok,true);
  assert.equal(taskForTab.task.taskId,'task-1');

  const done = await dispatch({type:'EVE_NAV_SUCCESS_REACHED'},{tab:{id:20,url:'https://example.com/success'}});
  assert.equal(done.ok,true);
  assert.equal(done.result.status,'completed');
  assert.equal(done.result.source,'eve-navigation-extension-auto');
  assert.equal(done.result.completionUrl,'https://example.com/success');
  assert.equal(store.has('eveActiveNavigationTask'),false);
  assert(sent.some(x=>x.tabId===7&&x.message.type==='EVE_NAV_TASK_RESULT'),'result sent back to Eve source tab');
  await new Promise(resolve=>setTimeout(resolve,180));
  assert(tabUpdates.some(x=>x.tabId===7&&x.options.active===true),'source Eve tab is reactivated after completion');
  assert(windowUpdates.some(x=>x.windowId===3&&x.options.focused===true),'source Eve window is focused after completion');
  assert(tabRemovals.includes(20),'navigation task tab is closed after completion');

  const sourceResult = await dispatch({type:'EVE_NAV_GET_SOURCE_RESULT'},{tab:{id:7,windowId:3,url:'http://localhost/eve'}});
  assert.equal(sourceResult.ok,true);
  assert.equal(sourceResult.result.taskId,'task-1');


  const start2 = await dispatch({type:'EVE_NAV_START_TASK',task:{taskId:'task-2',instructions:'Find help',startPage:'https://example.com/help',timeoutSeconds:0,startedAt:Date.now()}},{tab:{id:7,windowId:3,url:'http://localhost/eve'}});
  assert.equal(start2.ok,true);
  const manual = await dispatch({type:'EVE_NAV_SOURCE_RESULT',result:{taskId:'task-2',status:'completed',elapsedMs:1234}},{tab:{id:7,windowId:3,url:'http://localhost/eve'}});
  assert.equal(manual.ok,true);
  assert.equal(manual.result.status,'completed');
  assert.equal(manual.result.source,'eve-manual');
  assert.equal(store.has('eveActiveNavigationTask'),false);

  console.log('Eve Navigation Companion background tests passed');
})().catch(err=>{console.error(err);process.exit(1)});
