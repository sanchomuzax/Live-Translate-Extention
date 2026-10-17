'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const files = Object.fromEntries(
  ['options.html', 'options.js', 'background.js', 'offscreen.js'].map(name => [
    name, fs.readFileSync(name, 'utf8')
  ]),
);

function setupMessage(reduceFalseSpeechStarts) {
  const wsInstances = [];
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.sent = [];
      wsInstances.push(this);
    }
    send(payload) { this.sent.push(JSON.parse(payload)); }
  }
  const chrome = {
    runtime: {
      id: 'test-extension',
      onMessage: {addListener() {}},
    },
  };
  const context = vm.createContext({chrome, WebSocket:FakeWebSocket});
  vm.runInContext(files['offscreen.js'], context);
  const s = {
    tabId: 21, apiKey:'test-key', targetLanguageCode:'hu',
    echoTargetLanguage:false, reduceFalseSpeechStarts,
    closedByUs:false,
  };
  context.s = s;
  vm.runInContext('session = s; connectWebSocket(s)', context);
  assert.equal(wsInstances.length, 1);
  wsInstances[0].onopen();
  assert.equal(wsInstances[0].sent.length,1);
  return wsInstances[0].sent[0].setup;
}

test('conservative start-of-speech detection uses documented Gemini setup field only when enabled', () => {
  const setup = setupMessage(true);
  assert.equal(setup.model, 'models/gemini-3.5-live-translate-preview');
  assert.equal(setup.realtimeInputConfig.automaticActivityDetection.startOfSpeechSensitivity,
    'START_SENSITIVITY_LOW');
  assert.equal(setup.realtimeInputConfig.automaticActivityDetection.disabled, undefined);
  assert.ok(setup.inputAudioTranscription);
  assert.ok(setup.outputAudioTranscription);
  assert.equal(setup.generationConfig.translationConfig.targetLanguageCode, 'hu');
  assert.equal(setup.generationConfig.realtimeInputConfig, undefined,
    'VAD must be under setup, not generationConfig');
});

test('existing Gemini VAD remains completely unchanged when option is disabled', () => {
  const setup = setupMessage(false);
  assert.equal(setup.realtimeInputConfig, undefined);
  assert.equal(setup.generationConfig.translationConfig.targetLanguageCode, 'hu');
});

test('experimental control is saved, restored, and sent to the audio session', () => {
  assert.match(files['options.html'], /id="reduceFalseSpeechStarts"/);
  assert.match(files['options.js'], /reduceFalseSpeechStartsCheckbox.checked = !!reduceFalseSpeechStarts/);
  assert.match(files['options.js'], /reduceFalseSpeechStarts: reduceFalseSpeechStartsCheckbox.checked/);
  assert.match(files['background.js'], /reduceFalseSpeechStarts: !!reduceFalseSpeechStarts/);
  assert.match(files['offscreen.js'], /reduceFalseSpeechStarts: !!reduceFalseSpeechStarts/);
});
