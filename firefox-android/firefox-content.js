// Firefox Android WebExtension content script. Captures one playing HTMLMediaElement.
// This is intentionally not a replacement for Chromium tabCapture.
(() => {
  if (window.__liveTranslateFirefoxLoaded) return;
  window.__liveTranslateFirefoxLoaded = true;

  let session = null;
  let overlay = null;
  let collapsed = false;
  let statusElement, inputElement, outputElement, toggleElement;
  let rawInput = '', rawOutput = '';
  let filterFillers = false;
  let removeTimer = null;
  const CHUNK_MS = 100;
  const WS_AUDIO_RATE = 16000;
  const OUT_RATE = 24000;
  const BUFFER_MODES = {fast: 0.2, balanced: 0.4, smooth: 0.8};

  function ensureOverlay() {
    if (overlay?.isConnected) return;
    overlay = document.createElement('section');
    overlay.id = '__live_translate_firefox';
    overlay.dataset.collapsed = String(collapsed);
    overlay.setAttribute('aria-label','Live Translate subtitles');
    const body = document.createElement('div');
    body.className = 'lt-body';
    statusElement = document.createElement('div'); statusElement.className='lt-status';
    outputElement = document.createElement('div'); outputElement.className='lt-output';
    inputElement = document.createElement('div'); inputElement.className='lt-input';
    body.append(statusElement, outputElement, inputElement);
    toggleElement = document.createElement('button');
    toggleElement.type = 'button';
    toggleElement.addEventListener('click', () => {
      collapsed = !collapsed;
      overlay.dataset.collapsed = String(collapsed);
      updateToggle();
      if (collapsed) {
        rawInput=''; rawOutput='';
        inputElement.textContent=''; outputElement.textContent='';
      }
    });
    overlay.append(body, toggleElement);
    updateToggle();
    (document.body || document.documentElement).appendChild(overlay);
  }
  function updateToggle() {
    if (!toggleElement) return;
    toggleElement.textContent = collapsed ? 'CC' : '×';
    toggleElement.setAttribute('aria-label',collapsed ? 'Show subtitles' : 'Hide subtitles');
    toggleElement.setAttribute('aria-expanded', String(!collapsed));
  }
  function setStatus(state, text) {
    ensureOverlay();
    if (removeTimer) {clearTimeout(removeTimer);removeTimer=null;}
    statusElement.textContent = text;
    overlay.dataset.state = state;
    if(state==='error')removeTimer=setTimeout(()=>{overlay?.remove();overlay=null;},14000);
  }
  function filter(text) {
    return text
      .replace(/(^|[^\p{L}\p{N}])(?:[öő]+|izé|uh+m*|um+|erm+|er+|hmm+)(?=$|[^\p{L}\p{N}])\s*[,;]?\s*/giu,'$1')
      .replace(/(^|[.!?…]\s*)\s*(?:(?:you\s+know|i\s+mean|szóval|tudod|hát|well|so|like)\s*,\s*)+/giu,'$1')
      .replace(/(^|[.!?…]\s*)[,;]\s*/g,'$1')
      .replace(/[ \t]{2,}/g,' ')
      .replace(/\s+([,.;:!?…])/g,'$1');
  }
  function onTranscript(role, text) {
    if (collapsed || typeof text !== 'string') return;
    ensureOverlay();
    const isInput=role==='input';
    const accumulated=((isInput?rawInput:rawOutput)+text).slice(-600);
    if(isInput)rawInput=accumulated; else rawOutput=accumulated;
    const cleaned=filterFillers?filter(accumulated):accumulated;
    const max=isInput?150:240;
    const el=isInput?inputElement:outputElement;
    el.textContent=cleaned.length>max?'…'+cleaned.slice(-max):cleaned;
  }
  function getMedia() {
    const elements=[...document.querySelectorAll('video,audio')];
    const playable=elements.filter(el=>
      !el.paused && !el.ended && el.readyState>=2 &&
      (typeof el.captureStream==='function'||typeof el.mozCaptureStream==='function'));
    return playable[0]||null;
  }
  function floatToPCM(samples,sourceRate) {
    const ratio=sourceRate/WS_AUDIO_RATE;
    const count=Math.round(samples.length/ratio);
    const bytes=new Uint8Array(count*2);
    const view=new DataView(bytes.buffer);
    for(let i=0;i<count;i++) {
      const pos=i*ratio;
      const low=Math.floor(pos), high=Math.min(low+1,samples.length-1);
      const f=pos-low;
      const value=Math.max(-1,Math.min(1,samples[low]*(1-f)+samples[high]*f));
      view.setInt16(i*2,value<0?Math.round(value*32768):Math.round(value*32767),true);
    }
    let text='';
    for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(text);
  }
  function decodePCM(b64) {
    const binary=atob(b64);
    const length=Math.floor(binary.length/2);
    const samples=new Float32Array(length);
    for(let i=0;i<length;i++) {
      let sample=binary.charCodeAt(i*2)+(binary.charCodeAt(i*2+1)<<8);
      if(sample>=32768)sample-=65536;
      samples[i]=sample/(sample<0?32768:32767);
    }
    return samples;
  }
  function refreshOriginalGain(s, start, end) {
    if (!s.originalGain) return;
    const now=s.captureContext.currentTime;
    const offset=now-s.playbackContext.currentTime;
    const startCapture=Math.max(now,start+offset), endCapture=end+offset;
    if(endCapture<=now)return;
    s.duckIntervals=s.duckIntervals.filter(interval=>interval.end>now);
    s.duckIntervals.push({start:startCapture,end:endCapture});
    s.duckIntervals.sort((a,b)=>a.start-b.start);
    const combined=[];
    for(const interval of s.duckIntervals) {
      const last=combined[combined.length-1];
      if(last && interval.start<=last.end+0.12)last.end=Math.max(last.end,interval.end);
      else combined.push({...interval});
    }
    s.duckIntervals=combined;
    const gain=s.originalGain.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value,now);
    for(const interval of combined){
      gain.setTargetAtTime(s.duckLevel,Math.max(now,interval.start-0.04),0.025);
      gain.setTargetAtTime(1,interval.end,0.10);
    }
  }
  function playAudio(base64) {
    const s=session;
    if (!s || !base64) return;
    try {
      const samples=decodePCM(base64);
      if(!samples.length)return;
      const context=s.playbackContext;
      if(context.state==='suspended')context.resume().catch(()=>{});
      const buffer=context.createBuffer(1,samples.length,OUT_RATE);
      buffer.copyToChannel(samples,0);
      const source=context.createBufferSource();
      source.buffer=buffer;
      source.connect(context.destination);
      const start=Math.max(s.nextPlayTime,context.currentTime+s.initialLead);
      const end=start+buffer.duration;
      refreshOriginalGain(s,start,end);
      source.start(start);
      s.nextPlayTime=end;
    }catch(e){console.warn('Firefox translated audio playback failed',e);}
  }
  async function start(settings) {
    let stage = 'initialization';
    let captureContext, playbackContext, media, originalMuted, processor;
    try {
      if (session) await stop();
      filterFillers = !!settings.filterFillers;
      collapsed = false; rawInput = ''; rawOutput = '';
      ensureOverlay(); updateToggle();
      setStatus('connecting', 'Capturing media…');

      stage = 'find HTML5 media';
      media = getMedia();
      if (!media) throw new Error('No playing HTML5 video/audio element found. Start playback first. Embedded/DRM players may not work.');
      originalMuted = media.muted;
      stage = 'captureStream';
      const capture = media.captureStream || media.mozCaptureStream;
      const stream = capture.call(media);
      if (!stream?.getAudioTracks().length) throw new Error('This media element exposes no capturable audio track.');

      stage = 'create audio context';
      captureContext = new AudioContext();
      playbackContext = new AudioContext();
      stage = 'create media source';
      const source = captureContext.createMediaStreamSource(stream);

      stage = 'initialize audio processor';
      let useWorklet = false;
      try {
        await captureContext.audioWorklet.addModule(browser.runtime.getURL('pcm-worklet.js'));
        // Firefox must structured-clone AudioWorkletNode options. Passing even a
        // simple processorOptions object can fail across isolated worlds.
        // The worklet already has a self-contained default chunk size.
        processor = new AudioWorkletNode(captureContext, 'firefox-pcm-capture');
        useWorklet = true;
      } catch (workletError) {
        stage = 'ScriptProcessor fallback';
        if (typeof captureContext.createScriptProcessor !== 'function') {
          throw new Error('AudioWorklet failed (' + workletError.message + '); no ScriptProcessor fallback available.');
        }
        console.warn('AudioWorklet unavailable, using Firefox ScriptProcessor fallback:', workletError);
        processor = captureContext.createScriptProcessor(4096, 1, 1);
        const chunkSize = Math.round(captureContext.sampleRate * CHUNK_MS / 1000);
        let pending = new Float32Array(chunkSize), filled = 0;
        processor.onaudioprocess = event => {
          event.outputBuffer.getChannelData(0).fill(0);
          const input = event.inputBuffer.getChannelData(0);
          for (let i = 0; i < input.length; i++) {
            pending[filled++] = input[i];
            if (filled === chunkSize) {
              const chunk = pending;
              pending = new Float32Array(chunkSize);
              filled = 0;
              if (session?.processor === processor) sendPCM(chunk, captureContext.sampleRate);
            }
          }
        };
      }

      stage = 'connect audio graph';
      const silent = captureContext.createGain(); silent.gain.value = 0;
      source.connect(processor); processor.connect(silent); silent.connect(captureContext.destination);
      const duck = settings.originalAudioDucking === true;
      const originalGain = duck ? captureContext.createGain() : null;
      if (originalGain) {
        originalGain.gain.value = 1;
        source.connect(originalGain);
        originalGain.connect(captureContext.destination);
      }
      const s = {
        media, stream, captureContext, playbackContext, source, processor, silent, originalGain,
        duckLevel: [0, .15, .3].includes(Number(settings.duckingLevel)) ? Number(settings.duckingLevel) : .15,
        duckIntervals: [], nextPlayTime: 0,
        initialLead: BUFFER_MODES[settings.bufferMode] ?? .4,
        wasMuted: originalMuted
      };
      session = s;
      if (useWorklet) {
        processor.port.onmessage = event => {
          if (session !== s) return;
          sendPCM(event.data, captureContext.sampleRate);
        };
        processor.onprocessorerror = () => setStatus('error', 'AudioWorklet runtime failure; restart translation.');
      }

      stage = 'start audio';
      media.muted = true;
      if (captureContext.state === 'suspended') await captureContext.resume();
      if (playbackContext.state === 'suspended') await playbackContext.resume();
      setStatus('connecting', 'Connecting to translation…');
      return {capturing: true};
    } catch (error) {
      const reason = stage + ': ' + (error?.message || String(error));
      console.error('Live Translate startup failed:', reason, error);
      if (session) await stop();
      else {
        if (media && originalMuted !== undefined) media.muted = originalMuted;
        if (captureContext) try {await captureContext.close();} catch (_) {}
        if (playbackContext) try {await playbackContext.close();} catch (_) {}
      }
      throw new Error(reason);
    }
  }
  function sendPCM(samples, sampleRate) {
    try {
      const base64 = floatToPCM(samples, sampleRate);
      browser.runtime.sendMessage({type: 'firefox-pcm', base64}).catch(() => {});
    } catch (error) {
      console.warn('Firefox PCM message failed', error);
    }
  }
  async function stop() {
    const s = session; session = null;
    if (!s) return;
    try {
      if (s.processor.port) s.processor.port.onmessage = null;
      s.processor.onaudioprocess = null;
      s.source.disconnect(); s.processor.disconnect();
      s.silent.disconnect(); s.originalGain?.disconnect();
    } catch (_) {}
    try { s.media.muted = s.wasMuted; } catch (_) {}
    try { await s.captureContext.close(); await s.playbackContext.close(); } catch (_) {}
    if (overlay) {overlay.remove(); overlay = null;}
    collapsed = false; rawInput = ''; rawOutput = '';
  }
  browser.runtime.onMessage.addListener(message=>{
    if(message?.type==='firefox-start')return start(message.settings||{}).catch(error=>{
      setStatus('error',error.message);
      return {capturing:false,reason:error.message};
    });
    if(message?.type==='firefox-stop'){
      stop().then(()=>{if(message.error)setStatus('error',message.error);});
      return undefined;
    }
    if(message?.type==='firefox-audio'){playAudio(message.data);return undefined;}
    if(message?.type==='transcript'){onTranscript(message.role,message.text);return undefined;}
    if(message?.type==='turn'){
      if(rawOutput && !rawOutput.endsWith(' '))rawOutput+=' ';
      if(rawInput && !rawInput.endsWith(' '))rawInput+=' ';
      return undefined;
    }
    if(message?.type==='status'){
      const text={running:'Translating live',reconnecting:'Connection lost — retrying',error:message.message||'Error'}[message.state] || 'Connecting…';
      setStatus(message.state,text);
    }
    return undefined;
  });
  window.addEventListener('pagehide',()=>stop(),{once:true});
})();
