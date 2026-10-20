// The spectrogram under the masthead: the features most speech recognition
// models are trained on, with pitch and formant tracks (js/dsp.js), in a
// Praat-style plot with two annotation tiers. It loops a passage from
// President Kennedy's 1962 speech at Rice University, with its words and
// phones as forced-aligned tiers, plays it out loud on request, or listens
// to the microphone. The analysis runs in a worker (js/analyser.js), so
// this thread only draws.

import { FRAME, HOP, NMELS, PITCH_LO, PITCH_WIN, SR, analyseClip, bandToHz, hzToBand, FrontEnd, Resampler, Stream, pack } from "./dsp.js?v=1";

const CLIP_URL = new URL("../audio/rice.flac", import.meta.url);
const TIMING_URL = new URL("../audio/rice.json", import.meta.url);
const WORKLET_URL = new URL("capture.js" + new URL(import.meta.url).search, import.meta.url);
const WORKER_URL = new URL("analyser.js" + new URL(import.meta.url).search, import.meta.url);
const CAP = 1400; // frames kept, 14 s
const RANGE_DB = 70; // dynamic range shown, as in Praat
const TIER_H = 24;
// Phones are written in IPA, which needs a font with those letters.
const IPA_FONT = 'ui-sans-serif, system-ui, "Segoe UI", Roboto, "Noto Sans", "DejaVu Sans", sans-serif';
const PITCH_HI = 500; // pitch axis, log scale from PITCH_LO
const MIN_RUN = 6; // shortest voiced stretch drawn, in frames
const LOW_END = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;

// ==== Display ==============================================================

async function start(figure) {
  const canvas = figure.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const axis = (name) => figure.querySelector(`.scope-axis.${name}`);
  const pauseButton = figure.querySelector(".pill.pause");
  const soundButton = figure.querySelector(".pill.sound");
  const micButton = figure.querySelector(".pill.mic");
  const status = figure.querySelector(".status");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  // The clip, with a short pause before it loops (a whole number of hops,
  // so every pass lands its frames on the same samples), and the times of
  // its words and phones.
  let clip;
  let timing = { words: [], phones: [] };
  try {
    // FLAC is lossless and has no encoder delay, so the samples, and the
    // timings with them, come back exactly; decoding at 16 kHz skips any
    // resampling.
    const [audio, times] = await Promise.all([fetch(CLIP_URL), fetch(TIMING_URL)]);
    const decoded = await new OfflineAudioContext(1, 1, SR).decodeAudioData(await audio.arrayBuffer());
    const pcm = decoded.getChannelData(0);
    clip = new Float32Array(Math.ceil((pcm.length + 0.7 * SR) / HOP) * HOP);
    for (let i = 0; i < clip.length; i++) clip[i] = (i < pcm.length ? pcm[i] : 0) + (Math.random() - 0.5) * 2e-5;
    timing = await times.json().catch(() => timing);
  } catch {
    return;
  }

  // The word and phone under each frame of the clip, by frame centre. With
  // the microphone the tiers mark speech and voicing instead.
  const SPEECH = 1000;
  const VOICED = 1001;
  const steps = clip.length / HOP;
  const wordAt = new Int16Array(steps).fill(-1);
  const phoneAt = new Int16Array(steps).fill(-1);
  for (const [list, into] of [[timing.words, wordAt], [timing.phones, phoneAt]]) {
    list.forEach(([from, to], id) => {
      for (let k = Math.ceil((from * SR) / HOP); k < Math.min(steps, (to * SR) / HOP); k++) into[k] = id;
    });
  }
  const tierText = (id, list) => (id === SPEECH ? "speech" : id === VOICED ? "voiced" : list[id][2]);
  // Label widths, measured once: measuring text every frame adds up.
  const widths = new Map();
  const widthOf = (font, text) => {
    let w = widths.get(font + text);
    if (w === undefined) widths.set(font + text, (w = ctx.measureText(text).width));
    return w;
  };

  // The clip is analysed once, up front, in a worker, and comes back a
  // second at a time, well ahead of the plot. The microphone is analysed
  // there too. Without a worker, it all happens here.
  const clipFrames = new Float32Array(steps * FRAME);
  const SILENCE = new Float32Array(FRAME).fill(-Infinity, 0, NMELS);
  let ready = 0; // clip frames in
  const arrive = (frames, from) => {
    clipFrames.set(frames, from * FRAME);
    ready = from + frames.length / FRAME;
    if (!from || ready === steps) update();
  };
  let worker = null;
  try {
    worker = new Worker(WORKER_URL, { type: "module" });
    worker.addEventListener("message", ({ data }) => (data.type === "clip" ? arrive(data.frames, data.from) : receive(data.frames)));
    worker.addEventListener("error", () => {
      worker = null;
      if (ready < steps) analyseClip(clip, arrive);
    });
    const samples = clip.slice();
    worker.postMessage({ type: "clip", samples }, [samples.buffer]);
  } catch {
    worker = null;
    setTimeout(() => analyseClip(clip, arrive));
  }

  // Ring buffers for everything on screen, indexed by frame number.
  const ring = {
    db: new Float32Array(CAP * NMELS).fill(-Infinity),
    ref: new Float32Array(CAP),
    f0: new Float32Array(CAP),
    fm: new Float32Array(CAP * 4),
    words: new Int16Array(CAP).fill(-1),
    phones: new Int16Array(CAP).fill(-1),
  };
  let head = 0; // frames pushed so far
  let pending = 0; // pushed but not yet painted

  // The spectrogram image: one pixel column per frame, newest on the right.
  const image = document.createElement("canvas");
  image.width = CAP;
  image.height = NMELS;
  const ictx = image.getContext("2d");
  let strip = ictx.createImageData(16, NMELS);
  let colors = readColors();
  let lut = buildLut(colors);

  // Adds one packed frame (see dsp.js) to the rings, with its tier labels.
  const push = (frames, at, word, phone) => {
    const slot = head % CAP;
    ring.db.set(frames.subarray(at, at + NMELS), slot * NMELS);
    ring.ref[slot] = frames[at + NMELS];
    ring.f0[slot] = frames[at + NMELS + 1];
    ring.fm.set(frames.subarray(at + NMELS + 2, at + NMELS + 6), slot * 4);
    ring.words[slot] = word;
    ring.phones[slot] = phone;
    head++;
    pending++;
  };
  const pushMic = (frames, at) =>
    push(frames, at, frames[at + NMELS + 6] ? SPEECH : -1, frames[at + NMELS + 1] > 0 ? VOICED : -1);

  // Paints frames (ages newest..newest+count-1) into the image in one call.
  function paint(newest, count) {
    if (strip.width < count) strip = ictx.createImageData(count, NMELS);
    const px = strip.data;
    const w = strip.width;
    for (let c = 0; c < count; c++) {
      const slot = (head - 1 - (newest + count - 1 - c)) % CAP;
      const floor = ring.ref[slot] - RANGE_DB;
      for (let b = 0; b < NMELS; b++) {
        const v = Math.round(((ring.db[slot * NMELS + b] - floor) / RANGE_DB) * 255);
        const k = Math.max(0, Math.min(255, v)) * 3;
        const o = ((NMELS - 1 - b) * w + c) * 4;
        px[o] = lut[k];
        px[o + 1] = lut[k + 1];
        px[o + 2] = lut[k + 2];
        px[o + 3] = 255;
      }
    }
    ictx.putImageData(strip, CAP - newest - count, 0, 0, 0, count, NMELS);
  }

  // Repaints only what can still be seen: the plot only ever shows the
  // newest columns, and anything older has scrolled out for good.
  function repaint() {
    pending = 0;
    const count = Math.min(head, CAP, view.frames + 2);
    ictx.fillStyle = `rgb(${lut[0]}, ${lut[1]}, ${lut[2]})`;
    ictx.fillRect(0, 0, CAP, NMELS);
    for (let done = 0; done < count; done += 256) paint(done, Math.min(256, count - done));
  }

  // Layout ----------------------------------------------------------------

  const view = { w: 0, h: 0, spec: 0, tiers: 2, frames: 600, dpr: 1, shift: 0 };
  let cursor = null;

  const bandY = (b) => view.spec * (1 - (b + 0.5) / NMELS);
  const yBand = (y) => (1 - y / view.spec) * NMELS - 0.5;
  const pitchY = (f) => view.spec * (1 - Math.log(f / PITCH_LO) / Math.log(PITCH_HI / PITCH_LO));

  function layout() {
    const r = canvas.getBoundingClientRect();
    view.w = r.width;
    view.h = r.height;
    // Phones need room; a narrow plot keeps just the words.
    view.tiers = view.w < 520 ? 1 : 2;
    view.spec = view.h - view.tiers * TIER_H;
    view.dpr = Math.min(LOW_END ? 1.25 : 2, devicePixelRatio || 1);
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
    view.frames = Math.max(200, Math.min(CAP - 2, Math.round(view.w / (view.w < 640 ? 1.4 : 2.6))));
    labelAxes();
  }

  function label(text, pos, side = "top", cls = "") {
    const el = document.createElement("span");
    el.textContent = text;
    el.style[side] = `${pos}px`;
    if (cls) el.className = cls;
    return el;
  }

  function labelAxes() {
    const clampY = (y) => Math.max(0, Math.min(view.spec, y));
    axis("hz").replaceChildren(
      ...[[8000, "8k"], [4000, "4k"], [2000, "2k"], [1000, "1k"], [500, "500"]].map(([f, t]) => label(t, clampY(bandY(hzToBand(f))))),
      ...(mode === "mic" ? ["you", "voiced"] : ["words", "phones"])
        .slice(0, view.tiers)
        .map((name, i) => label(name, view.spec + (i + 0.5) * TIER_H, "top", "tier")),
    );
    axis("pitch").replaceChildren(...[500, 300, 200, 100].map((f) => label(String(f), pitchY(f))));
    const ppf = view.w / view.frames;
    const marks = [label("now", view.w, "left")];
    for (let s = 1; view.w - s * 100 * ppf > 24; s++) marks.push(label(`−${s} s`, view.w - s * 100 * ppf, "left"));
    axis("time").replaceChildren(...marks);
  }

  // Drawing -----------------------------------------------------------------

  // Voiced stretches worth drawing: at least MIN_RUN frames with smooth
  // pitch. runs[age] holds a run number, 0 for frames drawn as unvoiced.
  const runs = new Int32Array(CAP);

  function findRuns(visible) {
    runs.fill(0, 0, visible);
    let start = -1;
    let prev = 0;
    let id = 0;
    for (let age = visible - 1; age >= -1; age--) {
      const f = age >= 0 ? ring.f0[(head - 1 - age) % CAP] : 0;
      const smooth = f > 0 && prev > 0 && Math.abs(Math.log(f / prev)) < 0.18;
      if (start >= 0 && !smooth) {
        if (start - age >= MIN_RUN) {
          id++;
          for (let a = start; a > age; a--) runs[a] = id;
        }
        start = -1;
      }
      if (f > 0 && start < 0) start = age;
      prev = f;
    }
  }

  function draw() {
    if (pending) {
      const count = Math.min(pending, CAP);
      ictx.drawImage(image, -count, 0);
      paint(0, count);
      pending = 0;
    }
    const { w, spec, frames, dpr } = view;
    const ppf = w / frames;
    const right = w - view.shift * ppf;
    const n = Math.min(frames + 1, CAP);
    const visible = Math.min(n, head);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, view.h);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, spec);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "low";
    ctx.drawImage(image, CAP - n, 0, n, NMELS, right - n * ppf, 0, n * ppf, spec);

    // Formants as dotted tracks, pitch as a line, both in ink on a paper
    // halo so they read over any shade.
    findRuns(visible);
    const every = ppf < 1.2 ? 3 : 2;
    for (const [color, size] of [[colors.paper, 4.2], [colors.ink, 2]]) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let age = visible - 1; age >= 0; age--) {
        if (!runs[age] || (head - 1 - age) % every) continue;
        const slot = (head - 1 - age) % CAP;
        const x = right - (age + 0.5) * ppf;
        for (let k = 0; k < 4; k++) {
          const f = ring.fm[slot * 4 + k];
          if (f <= 0) continue;
          const y = bandY(hzToBand(f));
          ctx.moveTo(x + size / 2, y);
          ctx.arc(x, y, size / 2, 0, 2 * Math.PI);
        }
      }
      ctx.fill();
    }
    ctx.lineJoin = ctx.lineCap = "round";
    for (const [color, width] of [[colors.paper, 6], [colors.ink, 2.5]]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      let run = 0;
      for (let age = visible - 1; age >= 0; age--) {
        if (!runs[age]) {
          run = 0;
          continue;
        }
        const f0 = Math.max(PITCH_LO, Math.min(PITCH_HI, ring.f0[(head - 1 - age) % CAP]));
        const x = right - (age + 0.5) * ppf;
        if (runs[age] === run) ctx.lineTo(x, pitchY(f0));
        else ctx.moveTo(x, pitchY(f0));
        run = runs[age];
      }
      ctx.stroke();
    }
    ctx.restore();

    drawTier(ring.words, timing.words, spec, right, ppf, visible, `500 12px ${colors.font}`);
    if (view.tiers > 1) drawTier(ring.phones, timing.phones, spec + TIER_H, right, ppf, visible, `400 12px ${IPA_FONT}`);
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(0.5, 0.5, w - 1, view.h - 1);
    for (let i = 0; i < view.tiers; i++) {
      ctx.moveTo(0, spec + i * TIER_H + 0.5);
      ctx.lineTo(w, spec + i * TIER_H + 0.5);
    }
    ctx.stroke();
    if (cursor) drawCursor(right, ppf, visible);
  }

  // One annotation tier, as in a Praat TextGrid: an interval for each run
  // of frames with the same label, bounded by thin lines, with the label
  // written in when it fits.
  function drawTier(ids, list, top, right, ppf, visible, font) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, view.w, TIER_H);
    ctx.clip();
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = colors.graphite;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const spans = [];
    let id = -1;
    let start = -1;
    for (let age = visible - 1; age >= -1; age--) {
      const cur = age >= 0 ? ids[(head - 1 - age) % CAP] : -1;
      if (cur === id) continue;
      if (id >= 0) {
        const x0 = right - (start + 1) * ppf;
        const x1 = right - (age + 1) * ppf;
        for (const x of [x0, x1]) {
          ctx.moveTo(Math.round(x) + 0.5, top);
          ctx.lineTo(Math.round(x) + 0.5, top + TIER_H);
        }
        spans.push(id, x0, x1);
      }
      id = cur;
      start = age;
    }
    ctx.stroke();
    ctx.fillStyle = colors.ink;
    for (let i = 0; i < spans.length; i += 3) {
      const a = Math.max(spans[i + 1], 0);
      const b = Math.min(spans[i + 2], view.w);
      const text = tierText(spans[i], list);
      if (b - a > widthOf(font, text) + 3) ctx.fillText(text, (a + b) / 2, top + TIER_H / 2 + 0.5);
    }
    ctx.restore();
  }

  // Praat-style cursor: dashed lines and a readout of what's under it.
  function drawCursor(right, ppf, visible) {
    const { x, y } = cursor;
    const age = Math.floor((right - x) / ppf);
    if (age < 0 || age >= visible || y < 0 || y > view.h) return;
    const slot = (head - 1 - age) % CAP;
    // Where the word and phone under the cursor sit in the clip.
    const spans = [];
    const at = (kind, list, id) => {
      if (id < 0 || id >= SPEECH) return;
      const [from, to, text] = list[id];
      spans.push(`${kind}: ${kind === "phone" ? `/${text}/` : text}, ${from.toFixed(2)}–${to.toFixed(2)} s`);
    };
    at("word", timing.words, ring.words[slot]);
    at("phone", timing.phones, ring.phones[slot]);
    const lines = [];
    if (y > view.spec) {
      if (!spans.length) return;
      lines.push(...spans);
    } else {
      const level = ring.db[slot * NMELS + Math.max(0, Math.min(NMELS - 1, Math.round(yBand(y))))] - ring.ref[slot];
      lines.push(
        `${Math.round(bandToHz(yBand(y)) / 10) * 10} Hz`,
        Number.isFinite(level) ? `${level < 0 ? "−" : ""}${Math.abs(Math.round(level))} dB` : "silence",
        age < 3 ? "now" : `${(age / 100).toFixed(2)} s ago`,
      );
    }
    if (y <= view.spec && runs[age]) {
      const f0 = ring.f0[slot];
      let nearest = -1;
      let gap = 10;
      for (let k = 0; k < 4; k++) {
        const f = ring.fm[slot * 4 + k];
        const d = f > 0 ? Math.abs(bandY(hzToBand(f)) - y) : Infinity;
        if (d < gap) [gap, nearest] = [d, k];
      }
      if (nearest >= 0) lines.unshift(`formant F${nearest + 1}: ${Math.round(ring.fm[slot * 4 + nearest] / 10) * 10} Hz`);
      else if (Math.abs(pitchY(Math.max(PITCH_LO, Math.min(PITCH_HI, f0))) - y) < 10) lines.unshift(`pitch: ${Math.round(f0)} Hz`);
      if (!lines[0].startsWith("pitch")) lines.push(`pitch ${Math.round(f0)} Hz`);
    }
    if (y <= view.spec) lines.push(...spans.map((l) => l.replace(": ", " ")));

    ctx.save();
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, view.h);
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(view.w, Math.round(y) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `500 12px ${colors.font}`;
    ctx.textBaseline = "top";
    const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
    const bh = lines.length * 16 + 10;
    const bx = x + 12 + bw > view.w ? x - 12 - bw : x + 12;
    const by = Math.max(0, y + 12 + bh > view.spec ? y - 12 - bh : y + 12);
    ctx.fillStyle = colors.paper;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.fillStyle = colors.ink;
    lines.forEach((l, i) => {
      ctx.font = `${i === 0 && l.includes(":") ? 650 : 500} 12px ${colors.font}`;
      ctx.fillText(l, bx + 8, by + 7 + i * 16);
    });
    ctx.restore();
  }

  // Sources -----------------------------------------------------------------
  // The clip's frames go onto the plot at the pace of a clock: wall time
  // while idle, the audio clock while playing. The microphone's come from
  // the worker.

  let mode = "idle";
  let clipPos = 0;
  let fed = 0; // clip samples fed, as a running total

  // The newest frame is centred half a pitch window behind the input, as
  // it would be if the clip were being analysed live.
  function feedClip(until) {
    while (fed + HOP <= until) {
      clipPos = (clipPos + HOP) % clip.length;
      fed += HOP;
      const j = ((clipPos - PITCH_WIN / 2) / HOP + steps) % steps;
      if (j < ready) push(clipFrames, j * FRAME, wordAt[j], phoneAt[j]);
      else push(SILENCE, 0, -1, -1);
    }
  }

  const playback = { ctx: null, source: null, start: 0, base: 0 };
  const mic = { ctx: null, stream: null, node: null };

  // Microphone frames wait in a short queue and leave it at 100 a second,
  // LAG frames behind the newest, so the plot scrolls as evenly as it does
  // for the clip. None arrive while the plot is stopped, so none pile up.
  const QUEUE = 64;
  const LAG = 5;
  const queue = new Float32Array(QUEUE * FRAME);
  let got = 0; // frames received
  let taken = 0; // frames moved onto the plot
  let micClock = 0; // plot position, in frames

  function receive(frames) {
    if (mode !== "mic" || !running) return;
    for (let at = 0; at < frames.length; at += FRAME) queue.set(frames.subarray(at, at + FRAME), (got++ % QUEUE) * FRAME);
  }

  function setButton(button, on, onText, offText) {
    button.setAttribute("aria-pressed", String(on));
    button.textContent = on ? onText : offText;
  }


  async function play() {
    if (mode === "mic") stopMic();
    if (paused) setPaused(false);
    playback.ctx ??= new AudioContext();
    const actx = playback.ctx;
    await actx.resume();
    const buffer = actx.createBuffer(1, clip.length, SR);
    buffer.copyToChannel(clip, 0);
    const source = actx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(actx.destination);
    // Start the sound where the picture is. The analysis sits about 20 ms
    // behind its input, so aim for the sample after the last one fed.
    playback.start = actx.currentTime + 0.05;
    playback.base = fed + (actx.outputLatency || 0) * SR;
    source.start(playback.start, clipPos / SR);
    playback.source = source;
    mode = "play";
    soundButton.setAttribute("aria-pressed", "true");
    update();
  }

  function stopPlay() {
    try {
      playback.source?.stop();
    } catch {
      // Already stopped.
    }
    playback.source = null;
    if (mode === "play") mode = "idle";
    soundButton.setAttribute("aria-pressed", "false");
    update();
  }

  async function listen() {
    if (!navigator.mediaDevices?.getUserMedia) {
      status.textContent = "This browser doesn’t allow microphone access here.";
      return;
    }
    micButton.disabled = true;
    let media;
    try {
      media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      });
    } catch (err) {
      micButton.disabled = false;
      status.textContent = err?.name === "NotFoundError" ? "No microphone found." : "Microphone access was blocked. Allow it in your browser’s site settings to try again.";
      return;
    }
    stopPlay();
    // Ask for 16 kHz; browsers that can't resample a live stream get their
    // native rate and the resampler does the work.
    let actx;
    let source;
    try {
      actx = new AudioContext({ sampleRate: SR });
      source = actx.createMediaStreamSource(media);
    } catch {
      actx?.close();
      actx = new AudioContext();
      source = actx.createMediaStreamSource(media);
    }
    got = taken = 0;
    micClock = -LAG;
    let node;
    let worklet = true;
    try {
      await actx.audioWorklet.addModule(WORKLET_URL);
      node = new AudioWorkletNode(actx, "capture");
    } catch {
      worklet = false;
      node = actx.createScriptProcessor(1024, 1, 1);
    }
    if (worker) {
      // The worklet sends its samples straight to the worker.
      const channel = worklet ? new MessageChannel() : null;
      if (channel) node.port.postMessage({ port: channel.port1 }, [channel.port1]);
      else
        node.onaudioprocess = (e) => {
          if (mode !== "mic" || !running) return;
          const samples = e.inputBuffer.getChannelData(0).slice();
          worker?.postMessage({ type: "samples", samples }, [samples.buffer]);
        };
      worker.postMessage({ type: "mic", rate: actx.sampleRate, on: running, port: channel?.port2 }, channel ? [channel.port2] : []);
    } else {
      const stream = new Stream(new FrontEnd());
      const resampler = new Resampler(actx.sampleRate);
      const analyse = (x) => mode === "mic" && running && stream.push(resampler.process(x), (out) => pack(out, queue, (got++ % QUEUE) * FRAME));
      if (worklet) {
        node.port.onmessage = (e) => analyse(e.data);
        node.port.postMessage({ port: null });
      } else node.onaudioprocess = (e) => analyse(e.inputBuffer.getChannelData(0));
    }
    const mute = actx.createGain();
    mute.gain.value = 0;
    source.connect(node).connect(mute).connect(actx.destination);
    await actx.resume();
    Object.assign(mic, { ctx: actx, stream: media, node });
    mode = "mic";
    labelAxes();
    micButton.disabled = false;
    setButton(micButton, true, "Stop mic", "Use mic");
    status.textContent = "Listening. Audio stays on this page.";
    update();
  }

  function stopMic() {
    worker?.postMessage({ type: "stop" });
    mic.stream?.getTracks().forEach((t) => t.stop());
    mic.node?.disconnect();
    mic.ctx?.close();
    Object.assign(mic, { ctx: null, stream: null, node: null });
    if (mode === "mic") {
      mode = "idle";
      clipPos = 0;
    }
    labelAxes();
    setButton(micButton, false, "Stop mic", "Use mic");
    status.textContent = "";
    update();
  }

  // Pause freezes the picture, and the sound with it, so the tracks can be
  // read with the cursor at leisure.
  let paused = false;

  function setPaused(on) {
    paused = on;
    pauseButton.setAttribute("aria-pressed", String(on));
    pauseButton.setAttribute("aria-label", on ? "Resume" : "Pause");
    pauseButton.firstElementChild.textContent = on ? "Resume" : "Pause";
    if (mode === "play") (on ? playback.ctx.suspend() : playback.ctx.resume()).catch(() => {});
    update();
    if (on) draw();
  }

  // Clock -------------------------------------------------------------------

  let running = false;
  let visible = true;
  let covered = false;
  let halfRate = LOW_END;
  let skip = false;
  let cost = 0;
  let last = 0;
  let clockFed = 0; // idle clock position, in samples

  function frame(now) {
    if (!running) return;
    const dt = last ? Math.min(100, now - last) : 0;
    last = now;
    if (mode === "idle") {
      clockFed = Math.min(clockFed + (dt / 1000) * SR, fed + view.frames * HOP);
      feedClip(clockFed);
      view.shift = (clockFed - fed) / HOP;
    } else if (mode === "play") {
      const target = playback.base + (playback.ctx.currentTime - playback.start) * SR;
      if (target - fed > view.frames * HOP) fed = target - view.frames * HOP;
      feedClip(target);
      clockFed = Math.max(fed, target);
      view.shift = Math.max(0, Math.min(1, (target - fed) / HOP));
    } else {
      // Ease towards LAG frames behind the newest, never get ahead of what
      // has arrived, and catch up at once after a long stall.
      micClock += (dt / 1000) * (SR / HOP) + (got - LAG - micClock) * Math.min(1, dt / 1000);
      micClock = Math.max(got - 3 * LAG, Math.min(got, micClock));
      taken = Math.max(taken, got - QUEUE);
      for (; taken + 1 <= micClock; taken++) pushMic(queue, (taken % QUEUE) * FRAME);
      view.shift = Math.max(0, Math.min(1, micClock - taken));
    }
    // On slow machines, draw every other frame.
    if (!(halfRate && (skip = !skip))) {
      const t0 = performance.now();
      draw();
      cost = 0.9 * cost + 0.1 * (performance.now() - t0);
      // Halve the drawing rate when frames get expensive, and go back to
      // full rate once they are cheap again (never on low-end devices).
      if (cost > 7) halfRate = true;
      else if (cost < 3.5 && !LOW_END) halfRate = false;
    }
    requestAnimationFrame(frame);
  }

  function update() {
    const motion = mode !== "idle" || !reduced.matches;
    const on = (ready > 0 || mode === "mic") && !paused && motion && visible && !covered && !document.hidden;
    if (!motion) still();
    if (on === running) return;
    running = on;
    // The worker analyses the microphone only while the plot runs.
    worker?.postMessage({ type: "active", on });
    if (on) {
      last = 0;
      clockFed = Math.max(clockFed, fed);
      requestAnimationFrame(frame);
    }
  }

  // Reduced motion: a still of the first seconds of the clip.
  function still() {
    head = 0;
    clipPos = 0;
    fed = 0;
    feedClip((view.frames + 4) * HOP);
    view.shift = 0;
    draw();
  }

  // Wiring ------------------------------------------------------------------

  layout();
  repaint();
  draw();

  new ResizeObserver(() => {
    layout();
    repaint();
    if (!running) draw();
  }).observe(canvas);
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    update();
  }).observe(canvas);
  addEventListener("herocover", (e) => {
    covered = e.detail;
    update();
  });
  addEventListener("themechange", () => {
    colors = readColors();
    lut = buildLut(colors);
    repaint();
    draw();
  });
  document.addEventListener("visibilitychange", update);
  reduced.addEventListener("change", update);

  let cursorTimer = 0;
  const pointAt = (e) => {
    const r = canvas.getBoundingClientRect();
    cursor = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (!running) draw();
  };
  const clearCursor = () => {
    cursor = null;
    if (!running) draw();
  };
  canvas.addEventListener("pointermove", (e) => (e.pointerType === "mouse" || e.buttons) && pointAt(e));
  canvas.addEventListener("pointerdown", (e) => {
    clearTimeout(cursorTimer);
    pointAt(e);
  });
  canvas.addEventListener("pointerup", (e) => e.pointerType !== "mouse" && !paused && (cursorTimer = setTimeout(clearCursor, 1600)));
  canvas.addEventListener("pointercancel", clearCursor);
  canvas.addEventListener("pointerleave", (e) => e.pointerType === "mouse" && clearCursor());

  pauseButton.addEventListener("click", () => setPaused(!paused));
  // The page starts muted; the sound button plays the clip in step with
  // the picture, from wherever it is.
  soundButton.addEventListener("click", () => (mode === "play" ? stopPlay() : play()));
  micButton.addEventListener("click", () => (mode === "mic" ? stopMic() : listen()));
  pauseButton.hidden = soundButton.hidden = micButton.hidden = false;
  update();
}

function readColors() {
  const s = getComputedStyle(document.documentElement);
  return {
    paper: s.getPropertyValue("--paper").trim(),
    ink: s.getPropertyValue("--ink").trim(),
    graphite: s.getPropertyValue("--graphite").trim(),
    font: s.getPropertyValue("--font").trim(),
  };
}

// As in a phonetics lab, louder is more ink: a ramp from the theme's paper
// to its ink, three bytes per level.
const probe = document.createElement("canvas").getContext("2d");

function rgbOf(color) {
  probe.fillStyle = "#000";
  probe.fillStyle = color;
  const hex = probe.fillStyle;
  if (hex[0] === "#") return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return hex.match(/\d+/g).slice(0, 3).map(Number);
}

function buildLut({ paper, ink }) {
  const p = rgbOf(paper);
  const k = rgbOf(ink);
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = Math.pow(i / 255, 1.6);
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = Math.round(p[c] + (k[c] - p[c]) * t);
  }
  return lut;
}

const figure = document.querySelector(".scope");
if (figure) start(figure);
