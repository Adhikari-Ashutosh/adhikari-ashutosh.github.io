// Audio worklet: hands microphone samples on every 20 ms, to the analysis
// worker over the channel the page sends, or to the page itself if it sends
// none. Until then it drops them. Nothing is stored or sent anywhere else.
registerProcessor(
  "capture",
  class extends AudioWorkletProcessor {
    constructor() {
      super();
      this.batch = new Float32Array(Math.round(sampleRate / 50));
      this.filled = 0;
      this.out = null;
      this.port.onmessage = (e) => (this.out = e.data.port || this.port);
    }

    process(inputs) {
      const input = inputs[0] && inputs[0][0];
      if (!input || !this.out) return true;
      for (let i = 0; i < input.length; ) {
        const n = Math.min(input.length - i, this.batch.length - this.filled);
        this.batch.set(input.subarray(i, i + n), this.filled);
        this.filled += n;
        i += n;
        if (this.filled === this.batch.length) {
          // Copied, not transferred, so this thread never allocates.
          this.out.postMessage(this.batch);
          this.filled = 0;
        }
      }
      return true;
    }
  },
);
