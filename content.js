// Injected on demand (chrome.scripting) when translation starts. Guarded so
// re-injection after navigation or a second start is a no-op.
(() => {
  if (window.__liveTranslateLoaded) return;
  window.__liveTranslateLoaded = true;

  const MAX_RAW = 600; // memory cap for accumulated transcript text
  const SHOW_OUT = 240; // visible caption window (translated text)
  const SHOW_IN = 150; // visible caption window (source text)

  let overlay = null;
  let statusTextEl = null;
  let outputEl = null;
  let inputEl = null;
  let rawOutput = '';
  let rawInput = '';
  let removeTimer = null;
  let toggleButton = null;
  let playbackButton = null;
  let playbackActive = false;
  let playbackPaused = false;
  let collapsed = false;
  let filterFillers = false;

  function ensureOverlay() {
    if (overlay && overlay.isConnected) return;
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = '__live-translate-overlay';

    const statusRow = document.createElement('div');
    statusRow.className = 'lt-status';
    const dot = document.createElement('span');
    dot.className = 'lt-dot';
    statusTextEl = document.createElement('span');
    statusTextEl.className = 'lt-status-text';
    statusRow.appendChild(dot);
    statusRow.appendChild(statusTextEl);

    outputEl = document.createElement('div');
    outputEl.className = 'lt-output';
    inputEl = document.createElement('div');
    inputEl.className = 'lt-input';

    const captionContent = document.createElement('div');
    captionContent.id = '__live-translate-caption-content';
    captionContent.className = 'lt-content';
    captionContent.append(statusRow, outputEl, inputEl);

    toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'lt-toggle';
    toggleButton.setAttribute('aria-controls', captionContent.id);

    const closeIcon = document.createElement('span');
    closeIcon.className = 'lt-close-icon';
    closeIcon.setAttribute('aria-hidden', 'true');
    closeIcon.textContent = '×';
    const openIcon = document.createElement('span');
    openIcon.className = 'lt-open-icon';
    openIcon.setAttribute('aria-hidden', 'true');
    openIcon.textContent = 'CC';
    toggleButton.append(closeIcon, openIcon);
    toggleButton.addEventListener('click', () => setCollapsed(!collapsed));

    // Both controls share one carrier: [ || CC ] / [ ▶ CC ] when collapsed.
    // In expanded mode the pause/play button is immediately left of X.
    const controls = document.createElement('div');
    controls.className = 'lt-controls';
    playbackButton = document.createElement('button');
    playbackButton.type = 'button';
    playbackButton.className = 'lt-playback-toggle';
    const pauseIcon = document.createElement('span');
    pauseIcon.className = 'lt-pause-bars';
    pauseIcon.setAttribute('aria-hidden', 'true');
    const playIcon = document.createElement('span');
    playIcon.className = 'lt-play-triangle';
    playIcon.setAttribute('aria-hidden', 'true');
    playbackButton.append(pauseIcon, playIcon);
    playbackButton.addEventListener('click', () => {
      if (!playbackActive) return;
      chrome.runtime.sendMessage({
        target: 'background',
        type: 'setPlaybackPaused',
        paused: !playbackPaused,
      }).catch(() => {});
    });
    controls.append(playbackButton, toggleButton);
    overlay.append(captionContent, controls);
    overlay.dataset.collapsed = String(collapsed);
    updateToggleLabel();
    updatePlaybackUI();
    (document.body || document.documentElement).appendChild(overlay);
  }

  function removeOverlay() {
    if (removeTimer) {
      clearTimeout(removeTimer);
      removeTimer = null;
    }
    if (overlay) overlay.remove();
    overlay = null;
    toggleButton = null;
    playbackButton = null;
    playbackActive = false;
    playbackPaused = false;
    rawOutput = '';
    rawInput = '';
    collapsed = false;
  }

  function updateToggleLabel() {
    if (!toggleButton) return;
    const label = collapsed ? 'Show live subtitles' : 'Hide live subtitles';
    toggleButton.setAttribute('aria-label', label);
    toggleButton.setAttribute('aria-expanded', String(!collapsed));
    toggleButton.title = label;
  }

  function updatePlaybackUI() {
    if (!overlay || !playbackButton) return;
    overlay.dataset.playbackActive = String(playbackActive);
    playbackButton.dataset.paused = String(playbackPaused);
    const label = playbackPaused ? 'Resume translated speech' : 'Pause translated speech';
    playbackButton.setAttribute('aria-label', label);
    playbackButton.setAttribute('aria-pressed', String(playbackPaused));
    playbackButton.title = label;
  }

  function setPlaybackState(active, paused) {
    playbackActive = active === true;
    playbackPaused = paused === true;
    ensureOverlay();
    updatePlaybackUI();
  }

  function setCollapsed(nextCollapsed, notify = true) {
    const previous = collapsed;
    collapsed = !!nextCollapsed;
    ensureOverlay();
    overlay.dataset.collapsed = String(collapsed);
    updateToggleLabel();

    if (collapsed && !previous) {
      // Drop the hidden transcript instead of updating invisible text nodes.
      rawOutput = '';
      rawInput = '';
      outputEl.textContent = '';
      inputEl.textContent = '';
    }

    if (notify && collapsed !== previous) {
      // Tell the offscreen document to stop forwarding captions while minimized.
      chrome.runtime.sendMessage({
        target: 'background',
        type: 'captionVisibility',
        collapsed,
      }).catch(() => {});
    }
  }

  function setStatus(state, text) {
    ensureOverlay();
    if (removeTimer) {
      clearTimeout(removeTimer);
      removeTimer = null;
    }
    overlay.dataset.state = state;
    statusTextEl.textContent = text;
  }

  // Match standalone hesitation noises in English/Hungarian, without stripping
  // embedded words (e.g. "summer" or "rumor"). Comma-separated discourse
  // markers are removed only at the start of a new sentence/utterance.
  function removeFillers(text) {
    return text
      // Never remove matching text from the middle of a normal word.
      .replace(/(^|[^\p{L}\p{N}])(?:[öő]+|izé|uh+m*|um+|erm+|er+|hmm+)(?=$|[^\p{L}\p{N}])\s*[,;]?\s*/giu, '$1')
      // Discourse markers can carry meaning. Only treat them as fillers
      // when used as comma-terminated, sentence-initial interjections.
      .replace(/(^|[.!?…]\s*)\s*(?:(?:you\s+know|i\s+mean|szóval|tudod|hát|well|so|like)\s*,\s*)+/giu, '$1')
      .replace(/(^|[.!?…]\s*)[,;]\s*/g, '$1')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\s+([,.;:!?…])/g, '$1');
  }

  function renderCaption(el, raw, maxShown) {
    let text = (filterFillers ? removeFillers(raw) : raw).trimStart();
    if (text.length > maxShown) {
      // Cut at the window, then drop the leading partial word.
      text = text.slice(-maxShown).replace(/^\S{0,30}\s+/, '');
      text = '…' + text;
    }
    el.textContent = text;
    el.style.display = text ? '' : 'none';
  }

  chrome.runtime.onMessage.addListener((message, sender) => {
    if (!sender || sender.id !== chrome.runtime.id) return;
    if (!message || typeof message.type !== 'string') return;

    if (message.type === 'status') {
      if (typeof message.filterFillers === 'boolean') filterFillers = message.filterFillers;
      // Restore the minimized state after a page navigation.
      if (typeof message.collapsed === 'boolean') setCollapsed(message.collapsed, false);
      if (typeof message.playbackActive === 'boolean') {
        setPlaybackState(message.playbackActive, message.playbackPaused);
      }
      switch (message.state) {
        case 'starting':
          setStatus('connecting', 'Connecting…');
          break;
        case 'running':
          setStatus('on', 'Translating live');
          break;
        case 'reconnecting':
          setStatus('connecting', 'Connection lost — retrying…');
          break;
        case 'error':
          setStatus('error', String(message.message || 'Something went wrong').slice(0, 300));
          removeTimer = setTimeout(removeOverlay, 8000);
          break;
        case 'stopped':
          removeOverlay();
          break;
      }
      return;
    }

    if (message.type === 'playbackState') {
      setPlaybackState(message.active, message.paused);
      return;
    }

    if (message.type === 'transcript') {
      if (collapsed) return;
      ensureOverlay();
      // Transcripts stream in as fragments — accumulate, then show a sliding window.
      if (message.role === 'output') {
        rawOutput = (rawOutput + message.text).slice(-MAX_RAW);
        renderCaption(outputEl, rawOutput, SHOW_OUT);
      } else {
        rawInput = (rawInput + message.text).slice(-MAX_RAW);
        renderCaption(inputEl, rawInput, SHOW_IN);
      }
      return;
    }

    if (message.type === 'turn') {
      if (collapsed) return;
      // Sentence boundary from the model: keep fragments from gluing together.
      if (rawOutput && !rawOutput.endsWith(' ')) rawOutput += ' ';
      if (rawInput && !rawInput.endsWith(' ')) rawInput += ' ';
    }
  });
})();
