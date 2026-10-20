// Speech analysis shared by the page and its worker: the log-mel features
// most speech recognition models are trained on (NVIDIA NeMo's defaults:
// 16 kHz audio, pre-emphasis 0.97, 25 ms Hann windows every 10 ms, a
// 512-point FFT and 80 Slaney mel bands up to 8 kHz, as log power), pitch
// from normalised cross-correlation, formants from an LPC envelope, and a
// resampler for microphones.

export const SR = 16000;
export const WIN = 400;
export const HOP = 160;
export const NFFT = 512;
export const NMELS = 80;
const PREEMPH = 0.97;

// One analysed frame, packed: NMELS log-mel values, then the display's
// reference level, pitch, four formants and a speech flag.
export const FRAME = NMELS + 7;

export function pack(out, into, offset) {
  into.set(out.db, offset);
  into[offset + NMELS] = out.ref;
  into[offset + NMELS + 1] = out.f0;
  into.set(out.fm, offset + NMELS + 2);
  into[offset + NMELS + 6] = out.speech ? 1 : 0;
}

// Slaney mel scale, as in librosa: linear below 1 kHz, logarithmic above.
const F_SP = 200 / 3;
const LOG_HZ = 1000;
const LOG_MEL = LOG_HZ / F_SP;
const LOG_STEP = Math.log(6.4) / 27;
const hzToMel = (f) => (f < LOG_HZ ? f / F_SP : LOG_MEL + Math.log(f / LOG_HZ) / LOG_STEP);
const melToHz = (m) => (m < LOG_MEL ? m * F_SP : LOG_HZ * Math.exp(LOG_STEP * (m - LOG_MEL)));
const MEL_STEP = hzToMel(SR / 2) / (NMELS + 1);
export const hzToBand = (f) => hzToMel(Math.max(0, f)) / MEL_STEP - 1; // 0 = centre of the lowest band
export const bandToHz = (b) => melToHz((b + 1) * MEL_STEP);

export const PITCH_LO = 75; // lowest pitch searched for
export const PITCH_WIN = 640; // 40 ms: two periods at 75 Hz
const LPC_ORDER = 16;
const ENV_STEP = 20; // Hz between LPC envelope samples
const ENV_POINTS = 5000 / ENV_STEP + 1;

export class FrontEnd {
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
export class Stream {
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
export class Resampler {
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

// Analyses a looping clip, whose length must be a whole number of hops, as
// it sounds on every pass after the first: the last 3 s go through first to
// settle the running levels. Frame j is the one centred on sample j * HOP.
// The frames are handed over in order, a second's worth at a time, as
// onChunk(frames, first frame's index).
export function analyseClip(samples, onChunk) {
  const length = samples.length;
  const total = length / HOP;
  const lead = Math.min(length, 300 * HOP);
  const stream = new Stream(new FrontEnd());
  let chunk = null;
  let from = 0;
  let filled = 0;
  const frame = (out) => {
    if (out.at < lead || out.at >= lead + length) return;
    chunk ??= new Float32Array(Math.min(100, total - from) * FRAME);
    pack(out, chunk, filled++ * FRAME);
    if (filled * FRAME < chunk.length) return;
    onChunk(chunk, from);
    from += filled;
    filled = 0;
    chunk = null;
  };
  // A block at a time: the stream keeps only a second or two of samples.
  const block = new Float32Array(16 * HOP);
  for (let i = 0; i < lead + length + PITCH_WIN; i += block.length) {
    for (let k = 0; k < block.length; k++) block[k] = samples[(i + k - lead + length) % length];
    stream.push(block, frame);
  }
}
