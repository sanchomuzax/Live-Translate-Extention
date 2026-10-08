'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.className = '';
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.listeners = {};
    this.textContent = '';
    this.isConnected = false;
  }
  appendChild(child) { this.children.push(child); child.isConnected = true; return child; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  remove() { this.isConnected = false; }
}

function find(element, className) {
  if (element.className === className) return element;
  for (const child of element.children) {
    const found = find(child, className);
    if (found) return found;
  }
  return null;
}

test('caption panel minimize, restore, navigate, and start again', () => {
  const root = new Element('body');
  const listeners = [];
  const outgoing = [];
  const chrome = {
    runtime: {
      id: 'test-extension',
      onMessage: { addListener(fn) { listeners.push(fn); } },
      sendMessage(msg) { outgoing.push(msg); return Promise.resolve(); },
    },
  };
  const document = {
    body: root,
    documentElement: new Element('html'),
    createElement(tag) { return new Element(tag); },
  };
  const context = vm.createContext({
    window: {}, document, chrome, setTimeout() { return 1; }, clearTimeout() {},
  });
  vm.runInContext(fs.readFileSync('content.js', 'utf8'), context);
  const receive = (message) => listeners.forEach(fn => fn(message, { id: chrome.runtime.id }));

  receive({ type: 'status', state: 'starting' });
  const overlay = root.children.at(-1);
  const toggle = find(overlay, 'lt-toggle');
  const caption = find(overlay, 'lt-output');

  assert.equal(overlay.dataset.collapsed, 'false');
  assert.equal(toggle.attributes['aria-label'], 'Hide live subtitles');
  receive({ type: 'transcript', role: 'output', text: 'Hello' });
  assert.equal(caption.textContent, 'Hello');

  toggle.listeners.click();
  assert.equal(overlay.dataset.collapsed, 'true');
  assert.equal(toggle.attributes['aria-expanded'], 'false');
  assert.equal(caption.textContent, '');
  assert.equal(outgoing.at(-1).collapsed, true);
  receive({ type: 'transcript', role: 'output', text: 'Hidden' });
  assert.equal(caption.textContent, '');

  toggle.listeners.click();
  assert.equal(overlay.dataset.collapsed, 'false');
  assert.equal(outgoing.at(-1).collapsed, false);
  receive({ type: 'transcript', role: 'output', text: 'Visible' });
  assert.equal(caption.textContent, 'Visible');

  const before = outgoing.length;
  receive({ type: 'status', state: 'running', collapsed: true });
  assert.equal(overlay.dataset.collapsed, 'true');
  assert.equal(outgoing.length, before);

  receive({ type: 'status', state: 'stopped' });
  receive({ type: 'status', state: 'starting' });
  assert.equal(root.children.at(-1).dataset.collapsed, 'false');
});

test('offscreen does not forward hidden text but continues translated audio', () => {
  const listeners = [];
  const outgoing = [];
  const audioChunks = [];
  const chrome = {
    runtime: {
      id: 'test-extension',
      onMessage: { addListener(fn) { listeners.push(fn); } },
      sendMessage(msg) { outgoing.push(msg); return Promise.resolve(); },
    },
  };
  const context = vm.createContext({ chrome, TextDecoder, audioChunks });
  vm.runInContext(fs.readFileSync('offscreen.js', 'utf8'), context);
  vm.runInContext(
    'captionTabId = 123; captionsVisible = true; playTranslatedAudio = (_s, data) => audioChunks.push(data);',
    context,
  );
  const message = JSON.stringify({
    serverContent: {
      inputTranscription: { text: 'original' },
      outputTranscription: { text: 'translated' },
      turnComplete: true,
      modelTurn: { parts: [{ inlineData: { data: 'audio-chunk' } }] },
    },
  });
  const handle = () => vm.runInContext('handleServerMessage({tabId: 123}, ' + JSON.stringify(message) + ')', context);
  const receive = (msg) => listeners[0](msg, { id: chrome.runtime.id });

  handle();
  assert.equal(outgoing.length, 3);
  assert.equal(audioChunks.length, 1);
  receive({ target: 'offscreen', type: 'captionVisibility', tabId: 123, visible: false });
  handle();
  assert.equal(outgoing.length, 3);
  assert.equal(audioChunks.length, 2);

  receive({ target: 'offscreen', type: 'captionVisibility', tabId: 999, visible: true });
  handle();
  assert.equal(outgoing.length, 3);
  receive({ target: 'offscreen', type: 'captionVisibility', tabId: 123, visible: true });
  handle();
  assert.equal(outgoing.length, 6);
  assert.equal(audioChunks.length, 4);
});

test('v1.5.0 manifest keeps minimal Chrome permissions', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, '1.5.0');
  assert.equal(manifest.homepage_url, 'https://github.com/sanchomuzax/Live-Translate-Extention');
  assert.deepEqual(manifest.permissions, ['tabCapture', 'offscreen', 'storage', 'activeTab', 'scripting']);
});
