// The theme palette. Every theme is two colours, paper and ink. Light and
// Dark are this site's own. The rest come from the community themes in
// Monkeytype (monkeytype.com): each theme's background is the paper and
// its main colour is the ink, moved along its own hue where it was too
// faint for body text. Hover or arrow through the list to try a theme,
// click or press Enter to keep it, and press Escape to go back.

const THEMES = [
  ["8008", "#333a45", "#ff7598"], ["80s after dark", "#1b1d36", "#fca6d1"],
  ["9009", "#eeebe2", "#080909"], ["aether", "#101820", "#eedaea"],
  ["alduin", "#1c1c1c", "#dfd7af"], ["alpine", "#6c687f", "#ffffff"],
  ["anti hero", "#00002e", "#ffadad"], ["arch", "#0c0d11", "#7ebab5"],
  ["aurora", "#011926", "#00e980"], ["bingsu", "#b8a7aa", "#563744"],
  ["blue dolphin", "#003950", "#ffcefb"], ["blueberry dark", "#212b42", "#add7ff"],
  ["blueberry light", "#dae0f5", "#506477"], ["botanical", "#7b9c98", "#2b3031"],
  ["bouquet", "#173f35", "#eaa09c"], ["breeze", "#e8d5c4", "#695394"],
  ["bushido", "#242933", "#f7575f"], ["cafe", "#ceb18d", "#14120f"],
  ["camping", "#faf1e4", "#4f7944"], ["carbon", "#313131", "#f76f11"],
  ["catppuccin", "#1e1e2e", "#cba6f7"], ["chaos theory", "#141221", "#fd77d7"],
  ["cheesecake", "#fdf0d5", "#8e2949"], ["cherry blossom", "#323437", "#e76cdc"],
  ["comfy", "#4a5b6e", "#f8cdc6"], ["copper", "#442f29", "#d58872"],
  ["creamsicle", "#ff9869", "#464643"], ["cy red", "#6e2626", "#ff847e"],
  ["cyberspace", "#181c18", "#00ce7c"], ["dark note", "#1f1f1f", "#f2c17b"],
  ["darling", "#fec8cd", "#5d5d5d"], ["deku", "#058b8c", "#300001"],
  ["desert oasis", "#fff2d5", "#8e6a00"], ["dev", "#1b2028", "#23a9d5"],
  ["diner", "#537997", "#fffcf0"], ["dino", "#ffffff", "#00893e"],
  ["discord", "#313338", "#8192ff"], ["dmg", "#dadbdc", "#ae185e"], ["dots", "#121520", "#ffffff"],
  ["dracula", "#282a36", "#bd93f9"], ["earthsong", "#292521", "#579b58"],
  ["everblush", "#141b1e", "#8ccf7e"], ["evil eye", "#0084c2", "#16120d"],
  ["ez mode", "#0068c6", "#ffdff4"], ["fire", "#0f0000", "#d63e34"],
  ["floret", "#00272c", "#ffdd6d"], ["froyo", "#e1dacb", "#5f6161"],
  ["frozen llama", "#9bf2ea", "#6d44a6"], ["fruit chew", "#d6d3d6", "#5c1e5f"],
  ["future funk", "#2e1a47", "#f7f2ea"], ["github", "#212830", "#41ce5c"],
  ["graen", "#303c36", "#afa08c"], ["grand prix", "#36475c", "#c0d036"],
  ["grape", "#2c003e", "#ff8f00"], ["gruvbox dark", "#282828", "#d79921"],
  ["gruvbox light", "#fbf1c7", "#467a49"], ["hammerhead", "#030613", "#4fcdb9"],
  ["hanok", "#d8d2c3", "#513a2a"], ["hedge", "#415e31", "#a7d98b"],
  ["honey", "#f2aa00", "#4f4b00"], ["horizon", "#1c1e26", "#c4a88a"],
  ["husqy", "#000000", "#c58aff"], ["iceberg dark", "#161821", "#84a0c6"],
  ["iceberg light", "#e8e9ec", "#2d539e"], ["incognito", "#0e0e0e", "#ff9900"],
  ["ishtar", "#202020", "#db604f"], ["iv clover", "#a0a0a0", "#3b2d3b"],
  ["iv spade", "#0c0c0c", "#b7976a"], ["joker", "#1a0e25", "#99de1e"],
  ["laser", "#221b44", "#009eaf"], ["lavender", "#ada6c2", "#2f2a41"],
  ["leather", "#a86948", "#120800"], ["lil dragon", "#ebe1ef", "#7c4bc5"],
  ["lilac mist", "#fffbfe", "#b94189"], ["lime", "#7c878e", "#152300"],
  ["luna", "#221c35", "#f67599"], ["macroblank", "#b2d2c8", "#aa1d00"],
  ["magic girl", "#ffffff", "#a2647e"], ["mashu", "#2b2b2c", "#988abe"],
  ["matcha moccha", "#523525", "#7ec160"], ["matrix", "#000000", "#15ff00"],
  ["menthol", "#00c18c", "#3f3f3f"], ["metropolis", "#0f1f2c", "#56c3b7"],
  ["mexican", "#f8ad34", "#92006f"], ["miami", "#f35588", "#002f2d"],
  ["miami nights", "#18181a", "#e4609b"], ["midnight", "#0b0e13", "#657aa5"],
  ["milkshake", "#ffffff", "#212b43"], ["mint", "#05385b", "#5cdb95"],
  ["mizu", "#afcbdd", "#1a2633"], ["modern dolch light", "#dbdbdb", "#296b5f"],
  ["modern ink", "#ffffff", "#e52a00"], ["monokai", "#272822", "#a6e22e"],
  ["mr sleeves", "#d1d7da", "#7e5347"], ["muted", "#525252", "#cebdec"],
  ["nautilus", "#132237", "#ebb723"], ["nebula", "#212135", "#dc59a3"],
  ["night runner", "#212121", "#feff04"], ["nord", "#242933", "#88c0d0"],
  ["nord light", "#eceff4", "#497474"], ["norse", "#242425", "#5e92a1"],
  ["olive", "#e9e5cc", "#676945"], ["olivia", "#1c1b1d", "#deaf9d"],
  ["onedark", "#2f343f", "#61afef"], ["our theme", "#ce1226", "#ffe58c"],
  ["pale nimbus", "#433e4c", "#94ffc2"], ["paper", "#eeeeee", "#444444"],
  ["passion fruit", "#7c2142", "#f4a3b4"], ["pastel", "#e0b2bd", "#564e11"],
  ["peach blossom", "#292929", "#99b898"], ["peaches", "#e0d7c1", "#9e4228"],
  ["phantom", "#000011", "#7aa2f7"], ["pink lemonade", "#f6d992", "#974b3f"],
  ["purpleish", "#1e1e32", "#956fec"], ["rainbow trail", "#f5f5f5", "#363636"],
  ["red dragon", "#1a0b0c", "#ff3a32"], ["red samurai", "#84202c", "#d5ac7b"],
  ["repose dark", "#2f3338", "#d6d2bc"], ["retro", "#dad3c1", "#1d1b17"],
  ["retrocast", "#07737a", "#a1f4f8"], ["rgb", "#111111", "#eeeeee"],
  ["rose pine", "#1f1d27", "#9ccfd8"], ["rose pine dawn", "#fffaf3", "#3f7d88"],
  ["rudy", "#1a2b3e", "#af8f5c"], ["ryujinscales", "#081426", "#f17754"],
  ["serika", "#e1e1e3", "#7b6200"], ["serika dark", "#323437", "#e2b714"],
  ["sewing tin", "#241963", "#f2ce83"], ["sewing tin light", "#ffffff", "#2d2076"],
  ["shadow", "#000000", "#eeeeee"], ["slambook", "#fffdde", "#03001c"],
  ["snes", "#bfbec2", "#553d94"], ["solarized dark", "#002b36", "#859900"],
  ["solarized light", "#fdf6e3", "#697900"], ["solarized osaka", "#00141a", "#859900"],
  ["sonokai", "#2c2e34", "#9ed072"], ["stealth", "#010203", "#6f767a"],
  ["strawberry", "#f37f83", "#393936"], ["striker", "#124883", "#d7dcda"],
  ["suisei", "#3b4a62", "#bef0ff"], ["sunset", "#211e24", "#f79777"],
  ["superuser", "#262a33", "#43ffaf"], ["sweden", "#0058a3", "#ffcc02"],
  ["tangerine", "#ffede0", "#c53f00"], ["taro", "#b3baff", "#130f1a"],
  ["terminal", "#191a1b", "#79a617"], ["terror below", "#0b1e1a", "#66ac92"],
  ["tiramisu", "#cfc6b9", "#714c25"], ["trackday", "#464d66", "#ffa899"],
  ["trance", "#00021b", "#e51376"], ["tron orange", "#0d1c1c", "#f0e800"],
  ["vaporwave", "#a4a7ea", "#790074"], ["vesper", "#101010", "#ffc799"],
  ["vesper light", "#ffffff", "#c35600"], ["vscode", "#1e1e1e", "#2189dc"],
  ["watermelon", "#1f4437", "#f7868b"], ["wavez", "#1c292f", "#6bde3b"],
];

const root = document.documentElement;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const coarse = matchMedia("(pointer: coarse)");
const TOKENS = ["paper", "ink", "graphite", "hairline", "lift"];

const entries = [
  { id: "system", label: "System", note: "follows your device" },
  { id: "light", label: "Light", paper: "#ffffff", ink: "#000000" },
  { id: "dark", label: "Dark", paper: "#000000", ink: "#ffffff" },
  ...THEMES.map(([id, paper, ink]) => ({ id, label: id, paper, ink })),
];
const builtIn = (entry) => entry.id === "system" || entry.id === "light" || entry.id === "dark";
const byId = (id) => entries.find((e) => e.id === id) || entries[0];

// ==== Colour ===============================================================
// The secondary tones are mixed from the two colours in Oklab: graphite
// for quieter text, dark enough to stay readable, and a hairline for rules.

const srgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function luminance(c) {
  const [r, g, b] = c.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function toOklab(c) {
  const [r, g, b] = c.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => fromLinear(Math.min(1, Math.max(0, v))));
}

function mix(a, b, t) {
  const [p, q] = [toOklab(a), toOklab(b)];
  return fromOklab(p.map((v, i) => v + (q[i] - v) * t));
}

const hex = (c) => `#${c.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;

function tokens(entry) {
  const paper = srgb(entry.paper);
  const ink = srgb(entry.ink);
  const full = contrast(ink, paper);
  const target = Math.min(full, Math.max(4.6, Math.sqrt(full) * 1.6));
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (contrast(mix(paper, ink, mid), paper) >= target) hi = mid;
    else lo = mid;
  }
  const dark = luminance(paper) < luminance(ink);
  const [r, g, b] = ink.map((v) => Math.round(v * 255));
  return {
    paper: entry.paper,
    ink: entry.ink,
    graphite: hex(mix(paper, ink, hi)),
    hairline: hex(mix(paper, ink, dark ? 0.17 : 0.14)),
    lift: `rgba(${r}, ${g}, ${b}, ${dark ? 0.12 : 0.3})`,
    dark,
  };
}

// ==== Applying =============================================================

function apply(entry) {
  const style = root.style;
  if (builtIn(entry)) {
    for (const k of TOKENS) style.removeProperty(`--${k}`);
    delete root.dataset.scheme;
    if (entry.id === "system") delete root.dataset.theme;
    else root.dataset.theme = entry.id;
  } else {
    const t = tokens(entry);
    for (const k of TOKENS) style.setProperty(`--${k}`, t[k]);
    root.dataset.theme = entry.id;
    root.dataset.scheme = t.dark ? "dark" : "light";
  }
  shown = entry.id;
  window.dispatchEvent(new Event("themechange"));
}

function save(entry) {
  try {
    if (entry.id === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", entry.id);
    if (builtIn(entry)) localStorage.removeItem("theme-colors");
    else localStorage.setItem("theme-colors", JSON.stringify(tokens(entry)));
  } catch {
    // Blocked storage: the theme still holds for this visit.
  }
}

// Changes of theme glide: the five colours move from where they are to
// the new theme's over a second, as smoothly as the device allows: a
// step every frame to start with, and every second, third or fourth frame
// if steps start making frames late, easing back as frames recover. What
// it learns carries over to the next glide. Nothing ever flashes. A preview starts once the pointer or the arrow keys rest on a
// theme for a moment, and a new one picks up from wherever the colours
// are, so sweeping down the list just steers the glide. With reduced
// motion, changes are instant but at least 0.6 s apart.
const SETTLE = 260;
const GLIDE = 1000;
let every = 1; // frames per step, adapted to the device
let calm = 0; // on-time steps in a row
const GAP = 600;
const BUILT = {
  light: { paper: "#ffffff", ink: "#000000", graphite: "#5d5d66", hairline: "#dedee4", lift: "rgba(0, 0, 0, 0.32)" },
  dark: { paper: "#000000", ink: "#ffffff", graphite: "#a1a1aa", hairline: "#2a2a30", lift: "rgba(255, 255, 255, 0.1)" },
};
const systemDark = matchMedia("(prefers-color-scheme: dark)");
const colorProbe = document.createElement("canvas").getContext("2d");
let timer = 0;
let ticker = 0;
let lastInstant = 0;

function target(entry) {
  if (entry.id === "system") return BUILT[systemDark.matches ? "dark" : "light"];
  return BUILT[entry.id] || tokens(entry);
}

function rgba(color) {
  colorProbe.fillStyle = "#000";
  colorProbe.fillStyle = color;
  const v = colorProbe.fillStyle;
  if (v[0] === "#") return [...[1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)), 1];
  const [r, g, b, a = 1] = v.match(/[\d.]+/g).map(Number);
  return [r, g, b, a];
}

function preview(entry) {
  clearTimeout(timer);
  timer = setTimeout(() => glide(entry), SETTLE);
}

function glide(entry) {
  if (entry.id === shown) return;
  cancelAnimationFrame(ticker);
  if (reducedMotion.matches) {
    const wait = Math.max(0, lastInstant + GAP - performance.now());
    timer = setTimeout(() => {
      lastInstant = performance.now();
      apply(entry);
    }, wait);
    return;
  }
  const now = getComputedStyle(root);
  const from = Object.fromEntries(TOKENS.map((k) => [k, rgba(now.getPropertyValue(`--${k}`).trim())]));
  const goal = target(entry);
  const to = Object.fromEntries(TOKENS.map((k) => [k, rgba(goal[k])]));
  const start = performance.now();
  shown = entry.id;
  let frame = 0;
  let prev = 0;
  let frameMs = 1000 / 60;
  let stepped = false;
  const step = (now = performance.now()) => {
    ticker = requestAnimationFrame(step);
    const dt = prev ? now - prev : 0;
    prev = now;
    if (dt) {
      // Track the display's frame time from frames without a step, and
      // judge each step by how late the frame after it came.
      if (!stepped) frameMs = Math.min(frameMs, dt) * 0.9 + dt * 0.1;
      else if (dt > frameMs * 1.6) {
        every = Math.min(4, every + 1);
        calm = 0;
      } else if (++calm > 8 && every > 1) {
        every--;
        calm = 0;
      }
    }
    stepped = false;
    if (frame++ % every) return;
    stepped = true;
    const t = Math.min(1, (now - start) / GLIDE);
    if (t >= 1) {
      cancelAnimationFrame(ticker);
      apply(entry);
      return;
    }
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    for (const k of TOKENS) {
      const c = from[k].map((v, i) => v + (to[k][i] - v) * e);
      root.style.setProperty(`--${k}`, `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${c[3].toFixed(3)})`);
    }
    window.dispatchEvent(new Event("themechange"));
  };
  step();
}

// ==== Palette ==============================================================

let dialog;
let input;
let options = [];
let visible = [];
let active = -1;
let committed = "system";
let shown = "system";
let pointing = false; // previews follow the pointer only after it moves

function build() {
  dialog = document.createElement("dialog");
  dialog.className = "palette";
  dialog.setAttribute("aria-label", "Theme");

  input = document.createElement("input");
  input.className = "palette-search";
  input.type = "text";
  input.placeholder = `Search ${entries.length} themes`;
  input.spellcheck = false;
  input.autocomplete = "off";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-label", "Search themes");
  input.setAttribute("aria-controls", "palette-list");
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-autocomplete", "list");

  const list = document.createElement("ul");
  list.className = "palette-list";
  list.id = "palette-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Themes");
  options = entries.map((entry, i) => {
    const li = document.createElement("li");
    li.id = `palette-${i}`;
    li.dataset.index = i;
    li.setAttribute("role", "option");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.textContent = "Aa";
    swatch.setAttribute("aria-hidden", "true");
    if (entry.paper) {
      swatch.style.background = entry.paper;
      swatch.style.color = entry.ink;
    } else {
      swatch.classList.add("is-system");
    }
    const name = document.createElement("span");
    name.className = "palette-label";
    name.textContent = entry.label;
    li.append(swatch, name);
    if (entry.note) {
      const note = document.createElement("span");
      note.className = "palette-note";
      note.textContent = entry.note;
      li.append(note);
    }
    return li;
  });
  list.append(...options);

  const foot = document.createElement("p");
  foot.className = "palette-foot";
  foot.innerHTML = 'Two colours each. Most are reduced from <a href="https://github.com/monkeytypegame/monkeytype" target="_blank" rel="noopener">Monkeytype</a>’s community themes.';

  dialog.append(input, list, foot);
  document.body.append(dialog);

  const optionAt = (target) => target.closest?.("[role=option]");

  input.addEventListener("input", () => filter(input.value, true));
  input.addEventListener("keydown", (e) => {
    const steps = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 };
    if (e.key in steps) {
      e.preventDefault();
      move(steps[e.key]);
    } else if (e.key === "Home" || e.key === "End") {
      if (input.value) return;
      e.preventDefault();
      move(e.key === "Home" ? -Infinity : Infinity);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(active);
    }
  });

  list.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    pointing = true;
    const li = optionAt(e.target);
    if (li && Number(li.dataset.index) !== active) setActive(Number(li.dataset.index));
  });
  // Scrolling the list under a still pointer previews whatever lands
  // under it.
  list.addEventListener("wheel", () => (pointing = true), { passive: true });
  list.addEventListener("mouseover", (e) => {
    const li = optionAt(e.target);
    if (pointing && li) setActive(Number(li.dataset.index));
  });
  list.addEventListener("click", (e) => {
    const li = optionAt(e.target);
    if (li) choose(Number(li.dataset.index));
  });

  // A click outside the panel lands on the dialog itself (its backdrop):
  // close and go back to the theme you had. Checking the position as well
  // keeps a click on the panel's own edge from closing it.
  dialog.addEventListener("click", (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  });
  dialog.addEventListener("close", () => {
    clearTimeout(timer);
    glide(byId(committed));
  });
}

function setActive(i, show = true) {
  options[active]?.classList.remove("is-active");
  active = i;
  if (i < 0) {
    input.removeAttribute("aria-activedescendant");
    return;
  }
  options[i].classList.add("is-active");
  input.setAttribute("aria-activedescendant", options[i].id);
  if (show) preview(entries[i]);
}

function move(step) {
  if (!visible.length) return;
  pointing = false;
  let k = visible.indexOf(active);
  if (Math.abs(step) === Infinity) k = step > 0 ? visible.length - 1 : 0;
  else if (k < 0) k = 0;
  else if (Math.abs(step) === 1) k = (k + step + visible.length) % visible.length;
  else k = Math.max(0, Math.min(visible.length - 1, k + step));
  setActive(visible[k]);
  options[visible[k]].scrollIntoView({ block: "nearest" });
}

function filter(query, show) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  visible = [];
  entries.forEach((entry, i) => {
    const text = `${entry.label} ${entry.note || ""}`.toLowerCase();
    const match = terms.every((t) => text.includes(t));
    options[i].hidden = !match;
    if (match) visible.push(i);
  });
  setActive(visible.length ? visible[0] : -1, show && terms.length > 0);
  options[0].parentElement.scrollTop = 0;
}

function choose(i) {
  const entry = entries[i];
  committed = entry.id;
  save(entry);
  for (const o of options) o.setAttribute("aria-selected", String(o === options[i]));
  setActive(i, false);
  clearTimeout(timer);
  glide(entry);
  dialog.close();
}

export function openPalette() {
  if (!dialog) build();
  committed = shown = root.dataset.theme || "system";
  const current = Math.max(0, entries.findIndex((e) => e.id === committed));
  for (const o of options) o.setAttribute("aria-selected", String(o === options[current]));
  input.value = "";
  filter("", false);
  setActive(current, false);
  pointing = false;
  input.autofocus = !coarse.matches;
  dialog.showModal();
  options[current].scrollIntoView({ block: "center" });
  // Keep the on-screen keyboard out of the way until someone taps the
  // search box.
  if (coarse.matches && document.activeElement === input) input.blur();
}
