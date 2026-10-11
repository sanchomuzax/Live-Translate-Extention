// Firefox-specific 100ms capture worklet. Never renders input audio directly.
class FirefoxPCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.chunkSize = Math.max(256, options.processorOptions?.chunkSize || 4800);
    this.pending = new Float32Array(this.chunkSize);
    this.filled = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) return true;
    const channels = input.length;
    const count = input[0].length;
    for (let i = 0; i < count; i++) {
      let sample = 0;
      for (let c = 0; c < channels; c++) sample += input[c][i] || 0;
      this.pending[this.filled++] = sample / channels;
      if (this.filled === this.chunkSize) {
        const chunk = this.pending;
        this.port.postMessage(chunk, [chunk.buffer]);
        this.pending = new Float32Array(this.chunkSize);
        this.filled = 0;
      }
    }
    return true;
  }
}
registerProcessor('firefox-pcm-capture', FirefoxPCMProcessor);
