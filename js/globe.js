// The globe in the footer: country outlines on a shaded sphere that turns
// slowly, with the countries visitors have come from shaded and pinned. The
// counts come from GoatCounter: .github/workflows/visitors.yml fetches them
// once a day into the repository's data branch. Drag it to turn it; point
// at or tap a pin to read it.

const DATA_URL = "https://raw.githubusercontent.com/Adhikari-Ashutosh/adhikari-ashutosh.github.io/data/visitors.json";
const SPIN = (2 * Math.PI) / 50; // radians a second, west to east
const TILT = 0.4; // how far the north pole leans towards the viewer
// Made-up visitors, shown only with ?sample-globe in the address, to see
// how the globe looks with more countries. The caption says they're samples.
const SAMPLE = {
  total: 140,
  countries: [
    ["US", "United States", 40], ["DE", "Germany", 18], ["JP", "Japan", 14], ["GB", "United Kingdom", 12],
    ["BR", "Brazil", 9], ["CA", "Canada", 7], ["AU", "Australia", 6], ["SG", "Singapore", 5],
    ["ZA", "South Africa", 4], ["IN", "India", 25],
  ].map(([id, name, count]) => ({ id, name, count })),
};
const LOW_END = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;

function start(figure) {
  const canvas = figure.querySelector("canvas");
  const pin = figure.querySelector(".globe-pin");
  const caption = figure.querySelector("figcaption");
  const ctx = canvas.getContext("2d");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  let world = null; // outlines and label points, once loaded
  let markers = []; // { country, name, count, r, sx, sy, front }
  let shaded = new Uint8Array(0); // per outlined country: has visitors
  let summary = "";
  let pinned = null;

  const view = { size: 0, dpr: 1 };
  let lon0 = 0.35; // longitude facing the viewer
  let tilt = TILT;
  let spin = -SPIN;
  let colors = readColors();

  function layout() {
    view.size = canvas.clientWidth;
    view.dpr = Math.min(LOW_END ? 1.5 : 2, devicePixelRatio || 1);
    canvas.width = Math.round(view.size * view.dpr);
    canvas.height = Math.round(view.size * view.dpr);
  }

  // Drawing ---------------------------------------------------------------

  function draw(now) {
    const { size, dpr } = view;
    if (!size || !world) return;
    const { pts, arcs, rings, refs, labels } = world;
    const R = size / 2 - 1;
    const c = size / 2;
    const k = R / 66; // scale relative to the desktop size
    const ca = Math.cos(lon0);
    const sa = Math.sin(lon0);
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    const { X, Y, Z } = world;
    for (let i = 0, n = pts.length / 3; i < n; i++) {
      const x = pts[3 * i] * ca - pts[3 * i + 2] * sa;
      const z1 = pts[3 * i] * sa + pts[3 * i + 2] * ca;
      const y = pts[3 * i + 1];
      X[i] = x;
      Y[i] = y * ct - z1 * st;
      Z[i] = z1 * ct + y * st;
    }
    const sx = (i) => c + R * X[i];
    const sy = (i) => c - R * Y[i];

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, R, 0, 2 * Math.PI);
    ctx.fillStyle = colors.paper;
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = colors.ink;
    ctx.globalAlpha = 0.05;
    ctx.fill();

    // Borders on the far side show faintly through the sea, as through glass.
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let a = 0; a + 1 < arcs.length; a++) {
      for (let i = arcs[a] + 1; i < arcs[a + 1]; i++) {
        if (Z[i - 1] >= 0 || Z[i] >= 0) continue;
        ctx.moveTo(sx(i - 1), sy(i - 1));
        ctx.lineTo(sx(i), sy(i));
      }
    }
    ctx.stroke();

    // Land in paper, over the sea and the far side. Where a shape goes round
    // the back, its outline follows the rim instead, so it closes along the
    // edge of the globe. Rings are runs of arcs, some of them reversed.
    let before = null; // rim angle of the last point, when it was round the back
    let started = false;
    const visit = (i) => {
      if (Z[i] >= 0) {
        if (started) ctx.lineTo(sx(i), sy(i));
        else ctx.moveTo(sx(i), sy(i));
        before = null;
      } else {
        const angle = Math.atan2(Y[i], X[i]);
        if (before === null) {
          const x = c + R * Math.cos(angle);
          const y = c - R * Math.sin(angle);
          if (started) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        } else {
          const turn = Math.atan2(Math.sin(angle - before), Math.cos(angle - before));
          const steps = Math.ceil(Math.abs(turn) / 0.15);
          for (let s = 1; s <= steps; s++) {
            const a = before + (turn * s) / steps;
            ctx.lineTo(c + R * Math.cos(a), c - R * Math.sin(a));
          }
        }
        before = angle;
      }
      started = true;
    };
    const land = (pick) => {
      ctx.beginPath();
      for (let r = 0; r < rings.length; r += 3) {
        if (!pick(rings[r + 2])) continue;
        let front = false;
        for (let j = rings[r]; j < rings[r + 1] && !front; j++) {
          const a = refs[j] < 0 ? ~refs[j] : refs[j];
          for (let i = arcs[a]; i < arcs[a + 1] && !front; i++) front = Z[i] > 0;
        }
        if (!front) continue;
        before = null;
        started = false;
        for (let j = rings[r]; j < rings[r + 1]; j++) {
          const ref = refs[j];
          if (ref >= 0) for (let i = arcs[ref]; i < arcs[ref + 1]; i++) visit(i);
          else for (let i = arcs[~ref + 1] - 1; i >= arcs[~ref]; i--) visit(i);
        }
      }
      ctx.fill("evenodd");
    };
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.paper;
    land(() => true);
    if (markers.length) {
      ctx.fillStyle = colors.ink;
      ctx.globalAlpha = 0.2;
      land((country) => shaded[country]);
    }

    // Borders on the near side, cut where they go over the edge.
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = Math.max(0.45, 0.6 * k);
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let a = 0; a + 1 < arcs.length; a++) {
      for (let i = arcs[a] + 1; i < arcs[a + 1]; i++) {
        const za = Z[i - 1];
        const zb = Z[i];
        if (za < 0 && zb < 0) continue;
        let x0 = X[i - 1];
        let y0 = Y[i - 1];
        let x1 = X[i];
        let y1 = Y[i];
        if (za < 0) {
          const t = za / (za - zb);
          x0 += (x1 - x0) * t;
          y0 += (y1 - y0) * t;
        } else if (zb < 0) {
          const t = za / (za - zb);
          x1 = x0 + (x1 - x0) * t;
          y1 = y0 + (y1 - y0) * t;
        }
        ctx.moveTo(c + R * x0, c - R * y0);
        ctx.lineTo(c + R * x1, c - R * y1);
      }
    }
    ctx.stroke();

    // Shading: lit from the upper left, darker towards the lower right rim.
    const g = ctx.createRadialGradient(c - 0.35 * R, c - 0.4 * R, 0, c - 0.35 * R, c - 0.4 * R, 1.6 * R);
    g.addColorStop(0, colors.shade(0));
    g.addColorStop(0.55, colors.shade(0.04));
    g.addColorStop(1, colors.shade(0.16));
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();

    ctx.strokeStyle = colors.ink;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(c, c, R - 0.5, 0, 2 * Math.PI);
    ctx.stroke();

    // A pin for each country, sized by its count, with a slow pulse.
    markers.forEach((m, j) => {
      const p = labels[m.country];
      const x = p[0] * ca - p[2] * sa;
      const z1 = p[0] * sa + p[2] * ca;
      const y = p[1] * ct - z1 * st;
      const z = z1 * ct + p[1] * st;
      m.front = z > 0.08;
      m.sx = c + R * x;
      m.sy = c - R * y;
      if (!m.front) return;
      const fade = Math.min(1, z * 3);
      const r = m.r * k;
      if (now !== undefined) {
        const t = (now / 2600 + j * 0.29) % 1;
        ctx.globalAlpha = 0.6 * (1 - t) * fade;
        ctx.beginPath();
        ctx.arc(m.sx, m.sy, r + t * 8 * k, 0, 2 * Math.PI);
        ctx.stroke();
      }
      ctx.globalAlpha = fade;
      ctx.fillStyle = colors.paper;
      ctx.beginPath();
      ctx.arc(m.sx, m.sy, r + 1.2, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = colors.ink;
      ctx.beginPath();
      ctx.arc(m.sx, m.sy, r, 0, 2 * Math.PI);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    placePin();
  }

  // Data --------------------------------------------------------------------

  async function load() {
    const sample = new URLSearchParams(location.search).has("sample-globe");
    const [geo, visits] = await Promise.all([
      import("./globe-data.js?v=1"),
      sample
        ? SAMPLE
        : // Ask GitHub each time rather than trusting the browser's copy.
          fetch(DATA_URL, { cache: "no-cache" })
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null),
    ]);
    world = decode(geo);
    const list = (visits?.countries || []).filter((v) => world.labelIndex.has(v.id) && v.count > 0);
    shaded = new Uint8Array(world.codes.length);
    markers = list.map((v) => {
      const outline = world.codes.indexOf(v.id);
      if (outline >= 0) shaded[outline] = 1;
      const country = world.labelIndex.get(v.id);
      return { country, name: v.name, count: v.count, r: Math.min(3, 1.4 + 0.35 * Math.log2(v.count)), sx: 0, sy: 0, front: false };
    });
    if (markers.length) {
      // Start with the country most visits came from in view.
      const [x, , z] = world.labels[markers[0].country];
      lon0 = Math.atan2(x, z);
      const total = Number(visits.total) || list.reduce((s, v) => s + v.count, 0);
      const n = list.length;
      summary = `${sample ? "Sample: " : ""}${total.toLocaleString("en-US")} ${total === 1 ? "visit" : "visits"} from ${n} ${n === 1 ? "country" : "countries"}`;
      caption.textContent = summary;
      canvas.setAttribute("aria-label", `A globe marking where visitors have come from: ${list.map((v) => v.name).join(", ")}.`);
    }
    if (!running) draw();
  }

  // Clock -------------------------------------------------------------------

  let running = false;
  let visible = false;
  let loading = null;
  let last = 0;
  let skip = false;

  function frame(now) {
    if (!running) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    if (!drag) {
      spin += (-SPIN - spin) * (1 - Math.exp(-dt * 1.5));
      lon0 += spin * dt;
    }
    // Turning on its own it moves well under a pixel a frame, so every
    // other frame is plenty; under the pointer it gets every frame.
    const busy = drag || Math.abs(spin + SPIN) > 0.05;
    if (busy || (skip = !skip)) draw(now);
    requestAnimationFrame(frame);
  }

  function update() {
    const on = visible && !document.hidden && !reduced.matches;
    figure.classList.toggle("is-still", !on);
    if (on === running) return;
    running = on;
    if (on) {
      last = 0;
      requestAnimationFrame(frame);
    } else {
      draw();
    }
  }

  // Turning and reading -----------------------------------------------------

  let drag = null;
  let pinTimer = 0;

  function local(e) {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function placePin() {
    const show = pinned && pinned.front;
    pin.classList.toggle("is-on", Boolean(show));
    if (show) pin.style.transform = `translate(${pinned.sx}px, ${pinned.sy}px)`;
  }

  function pinAt(x, y) {
    let best = null;
    let gap = 12;
    for (const m of markers) {
      const d = m.front ? Math.hypot(m.sx - x, m.sy - y) : Infinity;
      if (d < gap) [gap, best] = [d, m];
    }
    if (best && best !== pinned) pin.textContent = `${best.name} · ${best.count.toLocaleString("en-US")}`;
    pinned = best;
    placePin();
  }

  canvas.addEventListener("pointerdown", (e) => {
    const [x, y] = local(e);
    drag = { x, y, t: performance.now(), v: 0 };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    const [x, y] = local(e);
    if (drag) {
      const R = view.size / 2;
      const now = performance.now();
      lon0 -= (x - drag.x) / R;
      tilt = Math.max(-0.6, Math.min(1.1, tilt + (y - drag.y) / R));
      drag.v = (-(x - drag.x) / R / Math.max(1, now - drag.t)) * 1000;
      Object.assign(drag, { x, y, t: now });
      if (!running) draw();
    } else if (e.pointerType === "mouse") {
      pinAt(x, y);
    }
  });
  const release = (e) => {
    if (!drag) return;
    // Let it coast at the speed it was thrown, easing back to its own spin.
    spin = performance.now() - drag.t > 80 ? -SPIN : Math.max(-6, Math.min(6, drag.v));
    drag = null;
    if (e.pointerType !== "mouse") {
      pinAt(...local(e));
      clearTimeout(pinTimer);
      pinTimer = setTimeout(() => {
        pinned = null;
        placePin();
      }, 2500);
    }
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("pointerleave", (e) => {
    if (e.pointerType !== "mouse" || drag) return;
    pinned = null;
    placePin();
  });

  // Wiring ------------------------------------------------------------------

  layout();
  new ResizeObserver(() => {
    layout();
    draw();
  }).observe(canvas);
  new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting;
      if (visible) loading ??= load();
      update();
    },
    { rootMargin: "200px" },
  ).observe(canvas);
  addEventListener("themechange", () => {
    colors = readColors();
    if (!running) draw();
  });
  document.addEventListener("visibilitychange", update);
  reduced.addEventListener("change", update);
}

// Borders as arcs of unit vectors (x east at longitude 0, y north, z
// towards the viewer), with arcs[a] the first point of arc a; countries as
// rings of arc numbers in refs, each ring a [first ref, end, country]
// triple in rings; and a label point for each country.
function decode({ CODES, SHAPES, LABELS }) {
  const bytes = Uint8Array.from(atob(SHAPES), (ch) => ch.charCodeAt(0));
  const dv = new DataView(bytes.buffer);
  const pts = [];
  const arcs = [0];
  const add = (x, y) => {
    const lon = (x / 10) * (Math.PI / 180);
    const lat = (y / 10) * (Math.PI / 180);
    pts.push(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
  };
  let o = 2;
  for (let a = 0, n = dv.getUint16(0, true); a < n; a++) {
    const len = dv.getUint16(o, true);
    let x = dv.getInt16(o + 2, true);
    let y = dv.getInt16(o + 4, true);
    o += 6;
    add(x, y);
    for (let i = 1; i < len; i++) {
      if (dv.getInt8(o) === -128) {
        x += dv.getInt16(o + 1, true);
        y += dv.getInt16(o + 3, true);
        o += 5;
      } else {
        x += dv.getInt8(o);
        y += dv.getInt8(o + 1);
        o += 2;
      }
      add(x, y);
    }
    arcs.push(pts.length / 3);
  }
  const refs = [];
  const rings = [];
  const count = dv.getUint16(o, true);
  o += 2;
  for (let country = 0; country < count; country++) {
    for (let ring = 0, n = bytes[o++]; ring < n; ring++) {
      const len = dv.getUint16(o, true);
      o += 2;
      const first = refs.length;
      for (let i = 0; i < len; i++, o += 2) refs.push(dv.getInt16(o, true));
      rings.push(first, refs.length, country);
    }
  }
  const labelIndex = new Map();
  const labels = LABELS.split("|").map((s, i) => {
    const [code, lat, lon] = s.split(",");
    labelIndex.set(code, i);
    const phi = (lat * Math.PI) / 180;
    const lam = (lon * Math.PI) / 180;
    return [Math.cos(phi) * Math.sin(lam), Math.sin(phi), Math.cos(phi) * Math.cos(lam)];
  });
  const n = pts.length / 3;
  return {
    codes: CODES.split(","),
    pts: Float32Array.from(pts),
    arcs: Int32Array.from(arcs),
    refs: Int16Array.from(refs),
    rings: Int32Array.from(rings),
    labels,
    labelIndex,
    X: new Float32Array(n),
    Y: new Float32Array(n),
    Z: new Float32Array(n),
  };
}

// The theme's paper and ink, and a shade for the sphere's dark side: ink on
// light themes, black on dark ones.
const probe = document.createElement("canvas").getContext("2d");

function rgbOf(color) {
  probe.fillStyle = "#000";
  probe.fillStyle = color;
  const hex = probe.fillStyle;
  if (hex[0] === "#") return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return hex.match(/[\d.]+/g).slice(0, 3).map(Number);
}

function readColors() {
  const s = getComputedStyle(document.documentElement);
  const paper = s.getPropertyValue("--paper").trim();
  const ink = s.getPropertyValue("--ink").trim();
  const [r, g, b] = rgbOf(paper);
  const dark = 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
  const [sr, sg, sb] = dark ? [0, 0, 0] : rgbOf(ink);
  const boost = dark ? 2.2 : 1;
  return { paper, ink, shade: (a) => `rgba(${sr}, ${sg}, ${sb}, ${Math.min(1, a * boost)})` };
}

const figure = document.querySelector(".visitors");
if (figure) start(figure);
