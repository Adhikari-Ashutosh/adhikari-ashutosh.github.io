// Worker: runs the speech analysis off the page's main thread. The clip is
// analysed once, up front, and sent back a second at a time. Microphone
// samples come straight from the audio worklet over their own channel, and
// each batch's frames go back to the page in one message.
import { FRAME, FrontEnd, Resampler, Stream, analyseClip, pack } from "./dsp.js?v=1";

let mic = null;
let active = true;
let scratch = new Float32Array(16 * FRAME);
let filled = 0;

function collect(out) {
  if ((filled + 1) * FRAME > scratch.length) {
    const more = new Float32Array(2 * scratch.length);
    more.set(scratch);
    scratch = more;
  }
  pack(out, scratch, filled++ * FRAME);
}

function take(samples) {
  if (!mic || !active) return;
  filled = 0;
  mic.stream.push(mic.resampler.process(samples), collect);
  if (!filled) return;
  const frames = scratch.slice(0, filled * FRAME);
  self.postMessage({ type: "frames", frames }, [frames.buffer]);
}

function stop() {
  mic?.port?.close();
  mic = null;
}

self.onmessage = ({ data }) => {
  if (data.type === "clip") {
    analyseClip(data.samples, (frames, from) => self.postMessage({ type: "clip", frames, from }, [frames.buffer]));
  } else if (data.type === "mic") {
    stop();
    mic = { stream: new Stream(new FrontEnd()), resampler: new Resampler(data.rate), port: data.port };
    active = data.on;
    if (data.port) data.port.onmessage = (e) => take(e.data);
  } else if (data.type === "samples") {
    take(data.samples);
  } else if (data.type === "active") {
    active = data.on;
  } else if (data.type === "stop") {
    stop();
  }
};
