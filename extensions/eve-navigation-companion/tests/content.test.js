const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const chrome = {
  runtime: {
    getManifest(){ return {version:'1.2.0'}; },
    sendMessage: async()=>({ok:true,task:null}),
    onMessage:{ addListener(){} }
  }
};
const document = {
  readyState:'loading',
  querySelector(){ return null; },
  addEventListener(){},
  getElementById(){ return null; },
  documentElement:{ appendChild(){} }
};
const window = { addEventListener(){}, postMessage(){}};
const context = vm.createContext({chrome,document,window,URL,console,setInterval,clearInterval,setTimeout,clearTimeout,location:{href:'https://example.com/start'}});
const code = fs.readFileSync(path.join(__dirname,'..','content.js'),'utf8');
vm.runInContext(code,context,{filename:'content.js'});
assert.equal(typeof context.successUrlMatches,'function');
assert.equal(context.successUrlMatches('https://example.com/success','https://example.com/success'),true);
assert.equal(context.successUrlMatches('https://example.com/success/','https://example.com/success'),true);
assert.equal(context.successUrlMatches('https://example.com/success#done','https://example.com/success'),true);
assert.equal(context.successUrlMatches('https://example.com/success?mode=1','https://example.com/success'),true);
assert.equal(context.successUrlMatches('https://example.com/success?mode=1','https://example.com/success?mode=1'),true);
assert.equal(context.successUrlMatches('https://example.com/success?mode=2','https://example.com/success?mode=1'),false);
assert.equal(context.successUrlMatches('https://other.example.com/success','https://example.com/success'),false);
assert.equal(context.successUrlMatches('https://example.com/not-success','https://example.com/success'),false);
console.log('Eve Navigation Companion success URL tests passed');
