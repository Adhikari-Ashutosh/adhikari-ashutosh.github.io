// The tool pills as the keys of a small music box. Each pill is a step of a
// pentatonic scale, so any notes, in any order and at any pace, sit well
// together. The scale drifts every few seconds between keys a third apart
// (D, B flat, G, E flat), so the same pills ring differently as it moves.
// Only loaded once the visitor has turned the page's sound on at some point.

const FIELDS = [
  [62, 64, 66, 69, 71], // D E F# A B
  [58, 60, 62, 65, 67], // Bb C D F G
  [55, 57, 59, 62, 64], // G A B D E
  [63, 65, 67, 70, 72], // Eb F G Bb C
];
const HOLD = 6; // seconds in each key

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

// Step 0 is the key's root an octave below middle; each five steps go up an
// octave.
export function play(step) {
  wake();
  if (ctx.state !== "running") return;
  const t = ctx.currentTime + 0.01;
  const field = FIELDS[Math.floor(t / HOLD) % FIELDS.length];
  const midi = field[step % 5] - 12 + 12 * Math.floor(step / 5);
  tine(440 * 2 ** ((midi - 69) / 12), t);
}

// A music-box tine: a sine with a quieter octave and a faint, quickly
// fading high partial, touched lightly and left to ring.
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
