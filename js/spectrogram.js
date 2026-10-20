// The spectrogram under the masthead. It computes the features most speech
// recognition models are trained on (NVIDIA NeMo's defaults: 16 kHz audio,
// pre-emphasis 0.97, 25 ms Hann windows every 10 ms, a 512-point FFT and 80
// Slaney mel bands up to 8 kHz, as log power), plus pitch from normalised
// cross-correlation and formants from an LPC envelope, and scrolls them in a
// Praat-style plot with two annotation tiers. It loops a passage from
// President Kennedy's 1962 speech at Rice University, with its words and
// phones as forced-aligned tiers, plays it out loud on request, or listens
// to the microphone.

const SR = 16000;
const WIN = 400;
const HOP = 160;
const NFFT = 512;
const NMELS = 80;
const PREEMPH = 0.97;

const CLIP_URL = new URL("../audio/rice.flac", import.meta.url);
const TIMING_URL = new URL("../audio/rice.json", import.meta.url);
const WORKLET_URL = new URL("capture.js" + new URL(import.meta.url).search, import.meta.url);
const CAP = 1400; // frames kept, 14 s
const RANGE_DB = 70; // dynamic range shown, as in Praat
const TIER_H = 24;
// Phones are written in IPA, which needs a font with those letters.
const IPA_FONT = 'ui-sans-serif, system-ui, "Segoe UI", Roboto, "Noto Sans", "DejaVu Sans", sans-serif';
const PITCH_LO = 75; // pitch axis, log scale
const PITCH_HI = 500;
const MIN_RUN = 6; // shortest voiced stretch drawn, in frames
const LOW_END = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;

// ==== Analysis =============================================================

// Slaney mel scale, as in librosa: linear below 1 kHz, logarithmic above.
const F_SP = 200 / 3;
const LOG_HZ = 1000;
const LOG_MEL = LOG_HZ / F_SP;
const LOG_STEP = Math.log(6.4) / 27;
const hzToMel = (f) => (f < LOG_HZ ? f / F_SP : LOG_MEL + Math.log(f / LOG_HZ) / LOG_STEP);
const melToHz = (m) => (m < LOG_MEL ? m * F_SP : LOG_HZ * Math.exp(LOG_STEP * (m - LOG_MEL)));
const MEL_STEP = hzToMel(SR / 2) / (NMELS + 1);
const hzToBand = (f) => hzToMel(Math.max(0, f)) / MEL_STEP - 1; // 0 = centre of the lowest band
const bandToHz = (b) => melToHz((b + 1) * MEL_STEP);

const PITCH_WIN = 640; // 40 ms: two periods at 75 Hz
const LPC_ORDER = 16;
const ENV_STEP = 20; // Hz between LPC envelope samples
const ENV_POINTS = 5000 / ENV_STEP + 1;

class FrontEnd {
  constructor() {
    this.re = new Float64Array(NFFT);
    this.im = new Float64Array(NFFT);
    this.cos = Float64Array.from({ length: NFFT / 2 }, (_, i) => Math.cos((2 * Math.PI * i) / NFFT));
    this.sin = Float64Array.from({ length: NFFT / 2 }, (_, i) => Math.sin((2 * Math.PI * i) / NFFT));
    this.rev = Uint16Array.from({ length: NFFT }, (_, i) => {
      let r = 0;
      for (let b = 0, n = Math.log2(NFFT); b < n; b++) r |= ((i >> b) & 1) << (n - 1 - b);
      return r;
    });
    this.hann = Float64Array.from({ length: WIN }, (_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (WIN - 1)));
    this.hamming = Float64Array.from({ length: WIN }, (_, n) => 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (WIN - 1)));

    // Triangular mel filters with Slaney area normalisation.
    const edges = Array.from({ length: NMELS + 2 }, (_, i) => melToHz(i * MEL_STEP));
    this.filters = edges.slice(0, NMELS).map((lo, m) => {
      const mid = edges[m + 1];
      const hi = edges[m + 2];
      const weights = [];
      let first = -1;
      for (let k = 0; k <= NFFT / 2; k++) {
        const w = Math.min(((k * SR) / NFFT - lo) / (mid - lo), (hi - (k * SR) / NFFT) / (hi - mid));
        if (w > 0) {
          if (first < 0) first = k;
          weights.push((w * 2) / (hi - lo));
        } else if (first >= 0) break;
      }
      return { first, weights: Float64Array.from(weights) };
    });

    this.nccf = new Float64Array(Math.ceil(SR / PITCH_LO) + 2);
    this.energy = new Float64Array(PITCH_WIN + 1);
    this.lpc = new Float64Array(LPC_ORDER + 1);
    this.tmp = new Float64Array(LPC_ORDER + 1);
    this.ac = new Float64Array(LPC_ORDER + 1);
    this.frame = new Float64Array(WIN);
    this.env = new Float64Array(ENV_POINTS);
    this.envCos = [];
    this.envSin = [];
    for (let p = 0; p < ENV_POINTS; p++) {
      const w = (2 * Math.PI * p * ENV_STEP) / SR;
      this.envCos.push(Float64Array.from({ length: LPC_ORDER + 1 }, (_, k) => Math.cos(w * k)));
      this.envSin.push(Float64Array.from({ length: LPC_ORDER + 1 }, (_, k) => Math.sin(w * k)));
    }
  }

  fft() {
    const { re, im, rev, cos, sin } = this;
    for (let i = 0; i < NFFT; i++) {
      const j = rev[i];
      if (j > i) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let size = 2; size <= NFFT; size *= 2) {
      const half = size / 2;
      const step = NFFT / size;
      for (let i = 0; i < NFFT; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const l = j + half;
          const tr = re[l] * cos[k] + im[l] * sin[k];
          const ti = im[l] * cos[k] - re[l] * sin[k];
          re[l] = re[j] - tr;
          im[l] = im[j] - ti;
          re[j] += tr;
          im[j] += ti;
        }
      }
    }
  }

  // Log-mel energies in dB for the window starting at `start` of a
  // pre-emphasised signal.
  logMel(pe, start, out) {
    const { re, im } = this;
    for (let n = 0; n < NFFT; n++) {
      re[n] = n < WIN ? pe[start + n] * this.hann[n] : 0;
      im[n] = 0;
    }
    this.fft();
    for (let m = 0; m < NMELS; m++) {
      const { first, weights } = this.filters[m];
      let s = 0;
      for (let j = 0; j < weights.length; j++) {
        const k = first + j;
        s += weights[j] * (re[k] * re[k] + im[k] * im[k]);
      }
      out[m] = 10 * Math.log10(s + 1e-10);
    }
  }

  // Normalised cross-correlation at lag t over the pitch window.
  correlation(x, start, t) {
    const e = this.energy;
    const m = PITCH_WIN - t;
    let num = 0;
    for (let n = 0; n < m; n++) num += x[start + n] * x[start + n + t];
    return num / (Math.sqrt((e[m] - e[0]) * (e[PITCH_WIN] - e[t])) + 1e-12);
  }

  // Pitch in Hz around sample `centre` of the raw signal, or 0 if unvoiced.
  pitch(x, centre) {
    const start = centre - PITCH_WIN / 2;
    const e = this.energy;
    e[0] = 0;
    for (let n = 0; n < PITCH_WIN; n++) e[n + 1] = e[n] + x[start + n] * x[start + n];
    const tMin = Math.floor(SR / 450);
    const tMax = Math.ceil(SR / PITCH_LO);
    const r = this.nccf;
    let best = 0;
    for (let t = tMin - 1; t <= tMax + 1; t++) {
      r[t] = this.correlation(x, start, t);
      if (t >= tMin && t <= tMax && r[t] > best) best = r[t];
    }
    if (best < 0.55) return 0;
    // The shortest lag close to the best avoids locking onto multiples of
    // the period; if a fraction of it correlates as well, the true pitch is
    // above the range (a whistle, a tone) and this is a subharmonic.
    for (let t = tMin; t <= tMax; t++) {
      if (r[t] < 0.88 * best || r[t] < r[t - 1] || r[t] < r[t + 1]) continue;
      for (let k = 2; k <= 6 && t / k >= 2; k++) {
        if (this.correlation(x, start, Math.round(t / k)) > 0.85 * r[t]) return 0;
      }
      const d = r[t - 1] - 2 * r[t] + r[t + 1];
      const shift = d ? (0.5 * (r[t - 1] - r[t + 1])) / d : 0;
      return SR / (t + Math.max(-0.5, Math.min(0.5, shift)));
    }
    return 0;
  }

  // Up to four formants from peaks of the LPC envelope (0 where missing).
  formants(pe, start, out) {
    out.fill(0);
    const f = this.frame;
    for (let n = 0; n < WIN; n++) f[n] = pe[start + n] * this.hamming[n];
    const R = this.ac;
    for (let k = 0; k <= LPC_ORDER; k++) {
      let s = 0;
      for (let n = k; n < WIN; n++) s += f[n] * f[n - k];
      R[k] = s;
    }
    if (R[0] <= 1e-9) return;
    R[0] *= 1.0001;
    const a = this.lpc;
    const tmp = this.tmp;
    a.fill(0);
    a[0] = 1;
    let err = R[0];
    for (let i = 1; i <= LPC_ORDER; i++) {
      let acc = R[i];
      for (let j = 1; j < i; j++) acc += a[j] * R[i - j];
      const k = -acc / err;
      tmp.set(a);
      for (let j = 1; j < i; j++) a[j] = tmp[j] + k * tmp[i - j];
      a[i] = k;
      err *= 1 - k * k;
      if (err <= 0) return;
    }
    const env = this.env;
    for (let p = 0; p < ENV_POINTS; p++) {
      let re = 0;
      let im = 0;
      for (let k = 0; k <= LPC_ORDER; k++) {
        re += a[k] * this.envCos[p][k];
        im -= a[k] * this.envSin[p][k];
      }
      env[p] = -10 * Math.log10(re * re + im * im + 1e-12);
    }
    let found = 0;
    for (let p = 2; p < ENV_POINTS - 2 && found < 4; p++) {
      if (p * ENV_STEP < 180 || !(env[p] > env[p - 1] && env[p] >= env[p + 1])) continue;
      let lo = p;
      let hi = p;
      while (lo > 0 && env[p] - env[lo] < 3) lo--;
      while (hi < ENV_POINTS - 1 && env[p] - env[hi] < 3) hi++;
      if ((hi - lo) * ENV_STEP > 500 || env[p] - env[lo] < 3 || env[p] - env[hi] < 3) continue;
      const d = env[p - 1] - 2 * env[p] + env[p + 1];
      out[found++] = (p + (d ? (0.5 * (env[p - 1] - env[p + 1])) / d : 0)) * ENV_STEP;
    }
  }
}

// A 16 kHz stream cut into analysed frames: log-mel, a running reference
// level for the display, pitch and formants, and an energy-based voice
// activity flag. The clip and the microphone both go through it.
class Stream {
  constructor(fe) {
    this.fe = fe;
    this.raw = new Float32Array(1 << 15);
    this.pe = new Float32Array(1 << 15);
    this.out = { db: new Float32Array(NMELS), ref: 0, f0: 0, fm: new Float32Array(4), speech: false, at: 0 };
    this.reset();
  }

  reset() {
    this.len = 0;
    this.base = 0; // absolute index of raw[0]
    this.next = PITCH_WIN / 2; // absolute centre of the next frame
    this.prev = 0;
    this.ref = -Infinity;
    this.noiseLevel = Infinity;
    this.noisePeak = Infinity;
    this.hang = 0;
  }

  push(x, onFrame) {
    if (this.len + x.length > this.raw.length) {
      const drop = this.next - PITCH_WIN - this.base;
      this.raw.copyWithin(0, drop, this.len);
      this.pe.copyWithin(0, drop, this.len);
      this.base += drop;
      this.len -= drop;
    }
    for (let i = 0; i < x.length; i++) {
      this.raw[this.len] = x[i];
      this.pe[this.len++] = x[i] - PREEMPH * this.prev;
      this.prev = x[i];
    }
    while (this.next + PITCH_WIN / 2 <= this.base + this.len) {
      this.out.at = this.next;
      onFrame(this.frame(this.next - this.base));
      this.next += HOP;
    }
  }

  frame(c) {
    const { fe, out } = this;
    fe.logMel(this.pe, c - WIN / 2, out.db);
    let peak = -Infinity;
    let sum = 0;
    for (let b = 0; b < NMELS; b++) {
      peak = Math.max(peak, out.db[b]);
      sum += 10 ** (out.db[b] / 10);
    }
    const level = 10 * Math.log10(sum + 1e-12);
    // Noise floors follow quiet frames down at once and drift up slowly.
    this.noiseLevel = level < this.noiseLevel ? level : this.noiseLevel + 0.01;
    this.noisePeak = peak < this.noisePeak ? peak : this.noisePeak + 0.01;
    this.ref = Math.max(this.ref - 0.03, peak, this.noisePeak + 45);
    this.hang = level > this.noiseLevel + 10 ? 15 : Math.max(0, this.hang - 1);
    out.ref = this.ref;
    out.speech = this.hang > 0;
    out.f0 = out.speech ? fe.pitch(this.raw, c) : 0;
    if (out.f0 > 0) fe.formants(this.pe, c - WIN / 2, out.fm);
    else out.fm.fill(0);
    return out;
  }
}

// Streaming resampler to 16 kHz for microphones that run at 44.1 or 48 kHz:
// a windowed-sinc low-pass, then linear interpolation.
class Resampler {
  constructor(rate) {
    this.ratio = rate / SR;
    const taps = 64;
    const fc = (0.46 * SR) / rate;
    this.h = Float64Array.from({ length: taps }, (_, n) => {
      const m = n - (taps - 1) / 2;
      const sinc = m === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * m) / (Math.PI * m);
      return sinc * (0.42 - 0.5 * Math.cos((2 * Math.PI * n) / (taps - 1)) + 0.08 * Math.cos((4 * Math.PI * n) / (taps - 1)));
    });
    const sum = this.h.reduce((s, v) => s + v, 0);
    this.h = this.h.map((v) => v / sum);
    this.history = new Float64Array(taps - 1);
    this.filtered = new Float64Array(0);
    this.output = new Float32Array(0);
    this.pos = 0;
    this.last = 0;
  }

  process(input) {
    if (Math.abs(this.ratio - 1) < 1e-6) return input;
    const { h, history } = this;
    const n = input.length;
    if (this.filtered.length < n + 1) {
      this.filtered = new Float64Array(n + 1);
      this.output = new Float32Array(Math.ceil(n / this.ratio) + 2);
    }
    // filtered[i + 1] is input sample i; filtered[0] carries the previous
    // block's last sample so positions in [-1, 0) interpolate across it.
    const f = this.filtered;
    f[0] = this.last;
    for (let i = 0; i < n; i++) {
      let acc = 0;
      for (let k = 0; k < h.length; k++) acc += h[k] * (i >= k ? input[i - k] : history[history.length + i - k]);
      f[i + 1] = acc;
    }
    const keep = history.length;
    if (n >= keep) history.set(input.subarray(n - keep));
    else {
      history.copyWithin(0, n);
      history.set(input, keep - n);
    }
    let count = 0;
    let t = this.pos;
    for (; t < n - 1; t += this.ratio) {
      const i = Math.floor(t);
      this.output[count++] = f[i + 1] + (f[i + 2] - f[i + 1]) * (t - i);
    }
    this.pos = t - n;
    this.last = f[n];
    return this.output.subarray(0, count);
  }
}

// ==== Display ==============================================================

async function start(figure) {
  const canvas = figure.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const axis = (name) => figure.querySelector(`.scope-axis.${name}`);
  const pauseButton = figure.querySelector(".pill.pause");
  const playButton = figure.querySelector(".pill.play");
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

  const fe = new FrontEnd();
  const stream = new Stream(fe);

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

  const push = (f) => {
    const slot = head % CAP;
    ring.db.set(f.db, slot * NMELS);
    ring.ref[slot] = f.ref;
    ring.f0[slot] = f.f0;
    ring.fm.set(f.fm, slot * 4);
    if (mode === "mic") {
      ring.words[slot] = f.speech ? SPEECH : -1;
      ring.phones[slot] = f.f0 > 0 ? VOICED : -1;
    } else {
      const k = (f.at % clip.length) / HOP;
      ring.words[slot] = wordAt[k];
      ring.phones[slot] = phoneAt[k];
    }
    head++;
    pending++;
  };

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

  function repaint() {
    pending = 0;
    ictx.fillStyle = `rgb(${lut[0]}, ${lut[1]}, ${lut[2]})`;
    ictx.fillRect(0, 0, CAP, NMELS);
    const count = Math.min(head, CAP);
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
  // The clip is fed through the stream at the pace of a clock: wall time
  // while idle, the audio clock while playing. The mic feeds itself.

  let mode = "idle";
  let clipPos = 0;
  let fed = 0; // clip samples fed, as a running total
  const chunk = new Float32Array(HOP);

  function feedClip(until) {
    while (fed + HOP <= until) {
      for (let i = 0; i < HOP; i++) chunk[i] = clip[(clipPos + i) % clip.length];
      clipPos = (clipPos + HOP) % clip.length;
      fed += HOP;
      stream.push(chunk, push);
    }
  }

  const playback = { ctx: null, source: null, start: 0, base: 0 };
  const mic = { ctx: null, stream: null, node: null };

  function setButton(button, on, onText, offText) {
    button.setAttribute("aria-pressed", String(on));
    button.textContent = on ? onText : offText;
  }

  // "Play sound" shortens to "Play" on a phone.
  function setPlay(on) {
    playButton.setAttribute("aria-pressed", String(on));
    playButton.innerHTML = `${on ? "Stop" : "Play"}<span class="more"> sound</span>`;
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
    setPlay(true);
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
    setPlay(false);
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
    const resampler = new Resampler(actx.sampleRate);
    stream.reset();
    const onSamples = (x) => mode === "mic" && !paused && stream.push(resampler.process(x), push);
    let node;
    try {
      await actx.audioWorklet.addModule(WORKLET_URL);
      node = new AudioWorkletNode(actx, "capture");
      node.port.onmessage = (e) => onSamples(e.data);
    } catch {
      node = actx.createScriptProcessor(1024, 1, 1);
      node.onaudioprocess = (e) => onSamples(e.inputBuffer.getChannelData(0).slice());
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
    mic.stream?.getTracks().forEach((t) => t.stop());
    mic.node?.disconnect();
    mic.ctx?.close();
    Object.assign(mic, { ctx: null, stream: null, node: null });
    if (mode === "mic") {
      mode = "idle";
      stream.reset();
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
  let pausedUntil = 0;
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
      view.shift = 0;
    }
    // Sit out theme transitions; on slow machines draw every other frame.
    if (now >= pausedUntil && !(halfRate && (skip = !skip))) {
      const t0 = performance.now();
      draw();
      cost = 0.9 * cost + 0.1 * (performance.now() - t0);
      if (cost > 7) halfRate = true;
    }
    requestAnimationFrame(frame);
  }

  function update() {
    const motion = mode !== "idle" || !reduced.matches;
    const on = !paused && motion && visible && !covered && !document.hidden;
    if (!motion) still();
    if (on === running) return;
    running = on;
    if (on) {
      last = 0;
      clockFed = Math.max(clockFed, fed);
      requestAnimationFrame(frame);
    }
  }

  // Reduced motion: a still of the first seconds of the clip.
  function still() {
    stream.reset();
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
  addEventListener("themetransition", (e) => {
    pausedUntil = performance.now() + e.detail;
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
  playButton.addEventListener("click", () => (mode === "play" ? stopPlay() : play()));
  micButton.addEventListener("click", () => (mode === "mic" ? stopMic() : listen()));
  pauseButton.hidden = playButton.hidden = micButton.hidden = false;
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
