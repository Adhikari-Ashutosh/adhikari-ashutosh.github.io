// The tool pills as the keys of a small music box, laid out in order along
// the opening of the "Ode to Joy" from Beethoven's Ninth Symphony (1824):
// run the pointer across them at a steady walk and the tune plays. Only
// loaded once the visitor has turned the page's sound on at some point.

const C = 523.25;
const D = 587.33;
const E = 659.26;
const F = 698.46;
const G = 783.99;

// Two phrases of the theme. The last pill plays the closing figure.
const TUNE = [E, E, F, G, G, F, E, D, C, C, D, E, E, D, D, E, E, F, G, G, F, E, D, C, C, D];
const CADENCE = [
  [E, 0],
  [D, 0.3],
  [C, 0.75],
  [C, 0.9],
];

let ctx = null;
let out = null;

// Browsers start audio only after a click or key press on the page.
export function wake() {
  if (!ctx) {
    ctx = new AudioContext();
    out = ctx.createGain();
    out.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    out.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
}

export function play(i, count) {
  wake();
  if (ctx.state !== "running") return;
  const t = ctx.currentTime + 0.01;
  if (i === count - 1) for (const [f, at] of CADENCE) tine(f, t + at);
  else tine(TUNE[i % TUNE.length], t);
}

// A music-box tine: a sine with a quieter octave and a faint, quickly
// fading high partial, struck and left to ring.
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
    g.gain.exponentialRampToValueAtTime(level, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ring);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + ring + 0.05);
  }
}
