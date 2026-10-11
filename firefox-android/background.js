// Firefox Android: WebSocket resides in the MV2 extension background context.
// Audio capture and playback take place in the selected web page's content script.
const WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const MODEL = 'models/gemini-3.5-live-translate-preview';
const sessions = new Map();
let activeTabId = null;
const MAX_BUFFERED_BYTES = 256 * 1024;

async function send(tabId, message) {
  try { await browser.tabs.sendMessage(tabId, message); } catch (_) { /* tab closed */ }
}
function stopSocket(s) {
  s.stopped = true;
  s.ready = false;
  if (s.retryTimer) clearTimeout(s.retryTimer);
  if (s.socket) {
    const ws = s.socket;
    s.socket = null;
    try { ws.close(1000); } catch (_) {}
  }
}
async function stop(tabId, notify = true) {
  const s = sessions.get(tabId);
  if (s) { stopSocket(s); sessions.delete(tabId); }
  if (activeTabId === tabId) activeTabId = null;
  if (notify) await send(tabId, {type: 'firefox-stop'});
  try { await browser.browserAction.setBadgeText({tabId, text: ''}); } catch (_) {}
}
function connect(s) {
  if (s.stopped || sessions.get(s.tabId) !== s) return;
  s.ready = false;
  const ws = new WebSocket(WS_URL + '?key=' + encodeURIComponent(s.config.apiKey));
  s.socket = ws;
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => {
    if (s.stopped || s.socket !== ws) return;
    ws.send(JSON.stringify({setup: {
      model: MODEL,
      generationConfig: {
        responseModalities: ['AUDIO'],
        translationConfig: {targetLanguageCode: s.config.targetLanguageCode, echoTargetLanguage: !!s.config.echoTargetLanguage}
      },
      inputAudioTranscription: {}, outputAudioTranscription: {}
    }}));
  };
  ws.onmessage = event => {
    if (s.stopped || s.socket !== ws) return;
    let message;
    try { message = JSON.parse(typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data)); }
    catch (_) { return; }
    if (message.setupComplete) {
      s.ready = true;
      s.everReady = true;
      s.attempts = 0;
      send(s.tabId, {type: 'status', state: 'running'});
      browser.browserAction.setBadgeText({tabId: s.tabId, text: 'ON'}).catch(() => {});
      return;
    }
    if (message.goAway) { try { ws.close(1000, 'Reconnecting'); } catch (_) {} return; }
    const c = message.serverContent;
    if (!c) return;
    if (c.inputTranscription?.text) send(s.tabId, {type:'transcript', role:'input', text:c.inputTranscription.text});
    if (c.outputTranscription?.text) send(s.tabId, {type:'transcript', role:'output', text:c.outputTranscription.text});
    if (c.turnComplete) send(s.tabId, {type:'turn'});
    if (Array.isArray(c.modelTurn?.parts)) {
      for (const part of c.modelTurn.parts) {
        if (typeof part.inlineData?.data === 'string') send(s.tabId, {type:'firefox-audio', data:part.inlineData.data});
      }
    }
  };
  ws.onerror = () => { /* onclose handles errors */ };
  ws.onclose = event => {
    if (s.stopped || s.socket !== ws) return;
    s.socket = null;
    s.ready = false;
    if (!s.everReady || s.attempts >= 4) {
      const error = event.reason || 'The translation connection failed. Check the API key and network.';
      send(s.tabId, {type:'firefox-stop', error});
      stop(s.tabId, false);
      return;
    }
    s.attempts++;
    send(s.tabId, {type:'status', state:'reconnecting'});
    s.retryTimer = setTimeout(() => connect(s), Math.min(500 * (2 ** (s.attempts-1)), 5000));
  };
}

browser.browserAction.onClicked.addListener(async tab => {
  if (typeof tab.id !== 'number') return;
  const tabId = tab.id;
  if (sessions.has(tabId)) { await stop(tabId); return; }
  if (activeTabId !== null) await stop(activeTabId);
  const config = await browser.storage.local.get(['apiKey','targetLanguageCode','bufferMode','echoTargetLanguage','filterFillers','originalAudioDucking','duckingLevel']);
  if (!config.apiKey) { await browser.runtime.openOptionsPage(); return; }
  const s = {tabId, config:{...config, targetLanguageCode:config.targetLanguageCode || 'hu'}, socket:null, ready:false, everReady:false, attempts:0, stopped:false, retryTimer:null};
  try {
    await browser.tabs.insertCSS(tabId, {file:'overlay.css'});
    await browser.tabs.executeScript(tabId, {file:'firefox-content.js'});
    sessions.set(tabId, s);
    activeTabId = tabId;
    const result = await browser.tabs.sendMessage(tabId, {type:'firefox-start', settings:s.config});
    if (!result?.capturing) throw new Error(result?.reason || 'No capturable audio found on this page.');
    connect(s);
    await browser.browserAction.setBadgeText({tabId, text:'…'});
  } catch (err) {
    await send(tabId, {type:'firefox-stop', error:String(err?.message || err)});
    await stop(tabId, false);
  }
});

browser.runtime.onMessage.addListener((message, sender) => {
  const tabId = sender.tab?.id;
  if (typeof tabId !== 'number' || !message) return undefined;
  const s = sessions.get(tabId);
  if (message.type === 'firefox-pcm') {
    if (s && !s.stopped && s.ready && s.socket?.readyState === WebSocket.OPEN &&
        s.socket.bufferedAmount < MAX_BUFFERED_BYTES && typeof message.base64 === 'string') {
      try { s.socket.send(JSON.stringify({realtimeInput:{audio:{data:message.base64,mimeType:'audio/pcm;rate=16000'}}})); }
      catch (_) { /* drop stale packet */ }
    }
  } else if (message.type === 'firefox-media-ended' && s) {
    stop(tabId);
  }
  return undefined;
});
browser.tabs.onRemoved.addListener(tabId => { if (sessions.has(tabId)) stop(tabId, false); });
browser.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'loading' && sessions.has(tabId)) stop(tabId, false);
});
