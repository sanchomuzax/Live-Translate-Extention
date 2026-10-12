'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness({targetLanguageCode = 'hu', echoTargetLanguage = false, language = null} = {}) {
  const messages = [];
  const listeners = [];
  const chrome = {
    runtime: {
      id: 'test-extension',
      onMessage: {addListener(fn) {listeners.push(fn);}},
      sendMessage(msg) {messages.push(msg);return Promise.resolve();},
    },
  };
  const context = vm.createContext({chrome, TextDecoder});
  vm.runInContext(fs.readFileSync('offscreen.js','utf8'), context);
  const changes = [];
  const gain = {
    value: 1,
    cancelScheduledValues(t) { changes.push({op:'cancel',t}); },
    setValueAtTime(v,t) { changes.push({op:'set',v,t}); },
    setTargetAtTime(v,t,tau) { changes.push({op:'target',v,t,tau}); },
  };
  const s = {
    tabId:9, targetLanguageCode, echoTargetLanguage, sourceLanguageCode:language,
    originalAudioGain:{gain}, captureContext:{currentTime:10}, playbackContext:{currentTime:4},
    playbackPaused:false, duckingLevel:.15, originalAudioIntervals:[],
  };
  context.s = s;
  return {
    context, s, changes, messages,
    schedule(start=4.4,end=4.6) {vm.runInContext('scheduleOriginalAudioDucking(s, '+start+','+end+')',context);},
    detect(code) {vm.runInContext('updateSourceLanguage(s, '+JSON.stringify(code)+')',context);},
    onServer(data) {vm.runInContext('handleServerMessage(s, '+JSON.stringify(JSON.stringify(data))+')',context);},
  };
}

test('unknown source preserves existing ducking behavior',()=>{
  const h=harness();
  h.schedule();
  assert.ok(h.changes.some(e=>e.op==='target'&&e.v===.15));
});

test('target-language input with echo disabled restores 100% source and blocks further ducking',()=>{
  const h=harness();
  h.schedule();
  assert.ok(h.changes.some(e=>e.op==='target'&&e.v===.15));
  h.detect('hu-HU');
  assert.equal(h.s.sourceLanguageCode,'hu');
  assert.equal(h.s.originalAudioIntervals.length,0);
  assert.equal(h.changes.at(-1).v,1);
  const before=h.changes.length;
  h.schedule(4.8,5.0);
  assert.equal(h.changes.length,before,'no ducking for same language even if audio packets arrive');
});

test('another source language re-enables configured ducking after matching language',()=>{
  const h=harness();
  h.detect('hu');
  h.detect('en-US');
  const before=h.changes.length;
  h.schedule(4.4,4.6);
  assert.ok(h.changes.slice(before).some(e=>e.op==='target'&&e.v===.15));
});

test('when echo target-language is ON, original sound is ducked even for matching input',()=>{
  const h=harness({echoTargetLanguage:true});
  h.detect('hu');
  h.schedule();
  assert.ok(h.changes.some(e=>e.op==='target'&&e.v===.15));
});

test('language metadata is used with minimized captions and absent spoken output',()=>{
  const h=harness();
  vm.runInContext('captionsVisible = false',h.context);
  h.onServer({serverContent:{inputTranscription:{languageCode:'hu-HU',text:'Szia'}}});
  assert.equal(h.s.sourceLanguageCode,'hu');
  assert.ok(h.changes.some(e=>e.op==='target'&&e.v===1));
  const before=h.changes.length;
  h.schedule();
  assert.equal(h.changes.length,before);
});

test('missing or uncertain language codes do not invent a match',()=>{
  const h=harness();
  h.detect('und');
  h.detect('');
  h.detect('not a language');
  assert.equal(h.s.sourceLanguageCode,null);
  h.schedule();
  assert.ok(h.changes.some(e=>e.op==='target'&&e.v===.15));
});
