// Audio worklet: hands microphone samples to the page in batches of 512.
// Nothing is stored or sent anywhere.
registerProcessor(
  "capture",
  class extends AudioWorkletProcessor {
    constructor() {
      super();
      this.batch = new Float32Array(512);
      this.filled = 0;
    }

    process(inputs) {
      const input = inputs[0] && inputs[0][0];
      for (let i = 0; input && i < input.length; ) {
        const n = Math.min(input.length - i, this.batch.length - this.filled);
        this.batch.set(input.subarray(i, i + n), this.filled);
        this.filled += n;
        i += n;
        if (this.filled === this.batch.length) {
          this.port.postMessage(this.batch.slice(0));
          this.filled = 0;
        }
      }
      return true;
    }
  },
);
