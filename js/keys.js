// The tool pills as a small music box playing the opening of the "Ode to
// Joy" from Beethoven's Ninth Symphony (1824): whichever pill the pointer
// enters plays the next note, so any wander across them plays the tune at
// the visitor's own pace. After a few seconds' rest it starts again from
// the top. Only loaded once the visitor has turned the page's sound on at
// some point.

const C = 523.25;
const D = 587.33;
const E = 659.26;
const F = 698.46;
const G = 783.99;

// Two phrases of the theme.
const TUNE = [E, E, F, G, G, F, E, D, C, C, D, E, E, D, D, E, E, F, G, G, F, E, D, C, C, D, E, D, C, C];
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
    out.gain.value = 0.9;
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
