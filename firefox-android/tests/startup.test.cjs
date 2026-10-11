const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'..','firefox-content.js'),'utf8');
function setup({captureError=false,workletError=false}={}){
  let listener, createdProcessor, status='', scriptProcessorUses=0;
  const elt=()=>({dataset:{},setAttribute(){},append(){},addEventListener(){},remove(){},get isConnected(){return true;}, set textContent(text){this._textContent=text;if(typeof text==='string' && text.includes('captureStream'))status=text;}});
  const media={paused:false,ended:false,readyState:4,muted:false,captureStream(){if(captureError)throw new Error('The object could not be cloned.');return {getAudioTracks:()=>[{}]};}};
  class AudioContextMock{
    constructor(){this.state='running';this.sampleRate=48000;this.currentTime=0;this.destination={};this.audioWorklet={addModule:async()=>{if(workletError)throw new Error('The object could not be cloned.');}};}
    createMediaStreamSource(){return {connect(){},disconnect(){}};}
    createGain(){return {gain:{value:0},connect(){},disconnect(){}};}
    createScriptProcessor(){scriptProcessorUses++;createdProcessor={onaudioprocess:null,connect(){},disconnect(){}};return createdProcessor;}
    async close(){};
  }
  const document={createElement:elt,querySelectorAll:()=>[media],body:{appendChild(){}}};
  const browser={runtime:{getURL:()=> 'moz-extension://test/pcm-worklet.js',onMessage:{addListener(fn){listener=fn;}},sendMessage:async()=>{} }};
  const sandbox={document,browser,window:{addEventListener(){}},AudioContext:AudioContextMock,AudioWorkletNode:class{constructor(){createdProcessor={port:{onmessage:null},connect(){},disconnect(){}};return createdProcessor;}},console:{warn(){},error(){},log(){}},setTimeout:()=>1,clearTimeout:()=>{}};
  vm.runInNewContext(code,sandbox);
  return {send:message=>listener(message),getProcessor:()=>createdProcessor,getScriptProcessorUses:()=>scriptProcessorUses,getStatus:()=>status,media};
}
test('AudioWorklet failure uses ScriptProcessor fallback and captures',async()=>{
  const ctx=setup({workletError:true});
  const result=await ctx.send({type:'firefox-start',settings:{}});
  assert.equal(result.capturing,true);
  assert.equal(ctx.getScriptProcessorUses(),1);
  assert.equal(ctx.media.muted,true);
  await ctx.send({type:'firefox-stop'});
});
test('media capture failure reports precise phase',async()=>{
  const ctx=setup({captureError:true});
  const result=await ctx.send({type:'firefox-start',settings:{}});
  assert.equal(result.capturing,false);
  assert.match(result.reason,/^captureStream: The object could not be cloned/);
  assert.equal(ctx.media.muted,false);
});
