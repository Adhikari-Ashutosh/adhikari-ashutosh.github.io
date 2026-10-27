// The tool pills as a small music box playing the opening of the first
// movement of Beethoven's "Moonlight" Sonata (1801): whichever pill the
// pointer enters plays the next note of its triplets, so any wander across
// them plays it at the visitor's own pace. After a few seconds' rest it
// starts again from the top. Only loaded once the visitor has turned the
// page's sound on at some point.

// An octave above the score, in the music box's range.
const Gs = 415.3; // G sharp
const A = 440.0;
const Bs = 523.25; // B sharp, the C above
const Cs = 554.37; // C sharp
const D = 587.33;
const Ds = 622.25; // D sharp
const E = 659.26;
const Fs = 739.99; // F sharp

const times = (n, notes) => Array.from({ length: n }, () => notes).flat();

// The first four bars, as the right hand plays them: C sharp minor, over B,
// then A, the Neapolitan D major, and the dominant, back to the start.
const TUNE = [
  ...times(4, [Gs, Cs, E]),
  ...times(4, [Gs, Cs, E]),
  ...times(2, [A, Cs, E]),
  ...times(2, [A, D, Fs]),
  ...times(2, [Gs, Bs, Fs]),
  ...[Gs, Cs, E],
  ...[Gs, Bs, Ds],
];
const REST = 3; // seconds without a note before the tune starts over

let next = 0;
let last = -Infinity;

let ctx = null;
let out = null;

// Browsers start audio only after a click or key press on the page.
export function wake() {
  if (!ctx) {
    ctx = new AudioContext();
    out = ctx.createGain();
    out.gain.value = 0.45;
    const comp = ctx.createDynamicsCompressor();
    out.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
}

export function play() {
  wake();
  if (ctx.state !== "running") return;
  const t = ctx.currentTime + 0.01;
  if (t - last > REST) next = 0;
  tine(TUNE[next], t);
  next = (next + 1) % TUNE.length;
  last = t;
}

// A music-box tine: a sine with a quieter octave and a faint, quickly
// fading high partial, touched lightly and left to ring like a held pedal.
function tine(f, t) {
  for (const [ratio, level, ring] of [
    [1, 0.22, 1.4],
    [2, 0.06, 0.5],
    [4.2, 0.025, 0.12],
  ]) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = f * ratio;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ring);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + ring + 0.05);
  }
}
