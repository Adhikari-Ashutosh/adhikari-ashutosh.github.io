// The name in the masthead, redrawn in WebGL so it can be looked at through
// a lens. On load it starts out of focus while a glass lens sweeps across,
// then racks into focus. On hover the lens springs out under the cursor and
// magnifies like a telescope, stretching as it follows the mouse, and
// collapses when the pointer leaves. The DOM text stays for layout and
// accessibility; without WebGL or with reduced motion, nothing changes.


const VERTEX = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAGMENT = `
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_size;
uniform vec2 u_lens;
uniform float u_radius;
uniform float u_zoom;
uniform vec2 u_velocity;
uniform float u_blur;
uniform float u_alpha;
uniform vec3 u_ink;
uniform vec3 u_paper;
uniform float u_dark;
uniform vec4 u_eggBox;
uniform vec2 u_tiles;
uniform float u_block;
uniform float u_step;
uniform float u_reset;
uniform float u_egg;
uniform float u_eggOn;
varying vec2 v_uv;

bool inBox(vec2 s) {
  return s.x >= u_eggBox.x && s.x <= u_eggBox.z && s.y >= u_eggBox.y && s.y <= u_eggBox.w;
}

float cover(vec2 p, float blur) {
  if (blur < 0.35) return texture2D(u_tex, p / u_size).a;
  float a = 0.0;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) / 12.0) * blur;
    float t = fi * 2.39996323;
    a += texture2D(u_tex, (p + vec2(cos(t), sin(t)) * r) / u_size).a;
  }
  return a / 12.0;
}

void main() {
  vec2 p = vec2(v_uv.x, 1.0 - v_uv.y) * u_size;
  vec2 d = p - u_lens;

  // Liquid deformation: the lens squashes along its direction of travel.
  float speed = length(u_velocity);
  vec2 dir = speed > 1e-3 ? u_velocity / speed : vec2(1.0, 0.0);
  float k = clamp(speed * 0.0025, 0.0, 0.32);
  vec2 q = vec2(dot(d, dir) * (1.0 + k), dot(d, vec2(-dir.y, dir.x)) * (1.0 - 0.45 * k));
  float x = u_radius > 0.5 ? length(q) / u_radius : 2.0;

  if (x < 1.0) {
    // Telescope: strong magnification in the middle, easing out to the
    // rim, where the glass bends the image inward.
    float profile = mix(1.0 / u_zoom, 1.0, x * x * x);
    float rim = smoothstep(0.8, 1.0, x);
    vec2 s = u_lens + d * profile * (1.0 - 0.14 * rim);
    float a = cover(s, rim * 1.2) * u_alpha;
    vec3 col = mix(u_paper, u_ink, a);

    vec2 n = normalize(d + 1e-4);
    float edge = smoothstep(0.93, 1.0, x);
    float key = pow(clamp(dot(n, vec2(-0.6, -0.8)), 0.0, 1.0), 5.0) * smoothstep(0.62, 0.97, x);
    float fill = pow(clamp(dot(n, vec2(0.6, 0.8)), 0.0, 1.0), 3.0) * smoothstep(0.55, 1.0, x);
    col = mix(col, mix(u_paper, u_ink, 0.05), 0.5 * (1.0 - a) * (1.0 - x * x));
    col = mix(col, u_ink, edge * (u_dark > 0.5 ? 0.2 : 0.45));
    col = mix(col, u_ink, fill * (u_dark > 0.5 ? 0.0 : 0.12));
    col = mix(col, u_paper, key * (u_dark > 0.5 ? 0.0 : 0.6));
    col += key * (u_dark > 0.5 ? 0.45 : 0.0);
    gl_FragColor = vec4(col, 1.0);
  } else {
    float a;
    float over = 0.0;
    if (u_eggOn > 0.5 && inBox(p)) {
      // The letter as the output of a tiled matrix multiply: tiles are
      // filled in cache-blocked order, each one accumulating over k.
      vec2 cell = (u_eggBox.zw - u_eggBox.xy) / u_tiles;
      vec2 local = (p - u_eggBox.xy) / cell;
      vec2 tij = floor(local);
      vec2 mb = floor(tij / u_block);
      vec2 inb = tij - mb * u_block;
      float blocksX = ceil(u_tiles.x / u_block);
      float order = (mb.y * blocksX + mb.x) * u_block * u_block + inb.y * u_block + inb.x;
      float done = clamp(u_step - order, 0.0, 1.0) * (1.0 - u_reset);
      float ghost = mix(1.0, 0.13, u_egg);
      a = cover(p, u_blur) * mix(ghost, 1.0, done) * u_alpha;

      vec2 f = fract(local);
      vec2 e = min(f, 1.0 - f) * cell;
      float grid = 1.0 - smoothstep(0.35, 1.1, min(e.x, e.y));
      vec2 fb = fract((tij + f) / u_block);
      vec2 eb = min(fb, 1.0 - fb) * cell * u_block;
      float blockEdge = 1.0 - smoothstep(0.45, 1.3, min(eb.x, eb.y));
      float current = step(order, u_step) * (1.0 - step(order + 1.0, u_step)) * (1.0 - u_reset);
      float frame = current * (1.0 - smoothstep(0.7, 1.7, min(e.x, e.y)));
      over = max(max(grid * 0.12, blockEdge * 0.3), frame * 0.85) * u_egg;
    } else {
      a = cover(p, u_blur) * u_alpha;
    }
    // A soft shadow under the glass, in light mode.
    float shadow = u_radius > 0.5 && u_dark < 0.5 ? 0.16 * (1.0 - smoothstep(1.0, 1.35, x)) : 0.0;
    float alpha = a + shadow * (1.0 - a);
    // Overlay lines turn to paper where they cross the ink of the letter.
    vec3 line = mix(u_ink, u_paper, step(0.5, a));
    vec3 col = line * over + u_ink * alpha * (1.0 - over);
    gl_FragColor = vec4(col, over + alpha * (1.0 - over));
  }
}`;

function start(heading) {
  const canvas = document.createElement("canvas");
  canvas.className = "name-glass";
  canvas.setAttribute("aria-hidden", "true");
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, antialias: false });
  if (!gl) return;

  const program = link(gl, VERTEX, FRAGMENT);
  if (!program) return;
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const u = {};
  for (const name of [
    "u_tex", "u_size", "u_lens", "u_radius", "u_zoom", "u_velocity", "u_blur", "u_alpha", "u_ink", "u_paper", "u_dark",
    "u_eggBox", "u_tiles", "u_block", "u_step", "u_reset", "u_egg", "u_eggOn",
  ]) {
    u[name] = gl.getUniformLocation(program, name);
  }
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(u.u_tex, 0);

  // Split the name into words so their real positions (and any line
  // wrapping) can be read back from the DOM.
  const text = heading.textContent.trim();
  heading.textContent = "";
  const words = text.split(/\s+/).map((word, i, all) => {
    const span = document.createElement("span");
    span.textContent = word;
    heading.append(span);
    if (i < all.length - 1) heading.append(" ");
    return span;
  });
  heading.append(canvas);

  const state = {
    dpr: 1,
    pad: 0,
    fontSize: 100,
    ink: [0, 0, 0],
    paper: [1, 1, 1],
    dark: 0,
    // Lens springs: position, radius and zoom.
    x: 0, y: 0, vx: 0, vy: 0,
    tx: 0, ty: 0,
    r: 0, vr: 0, tr: 0,
    z: 1, vz: 0, tz: 1,
    blur: 0,
    alpha: 1,
    hovering: false,
    opening: null,
  };

  const egg = {
    on: false,
    amt: 0,
    step: 0,
    reset: 0,
    start: 0,
    box: null, // letter box in canvas-local CSS px: x0, y0, x1, y1
    offTimer: 0,
  };
  const readout = document.createElement("div");
  readout.className = "readout";
  readout.setAttribute("aria-hidden", "true");
  readout.innerHTML = '<span class="egg-label">C = A·B, blocked</span><span class="egg-state"></span>';
  const stateCell = readout.querySelector(".egg-state");
  heading.parentElement.append(readout);

  function readColors() {
    const s = getComputedStyle(document.documentElement);
    const rgb = (name) => {
      const probe = document.createElement("span");
      probe.style.color = s.getPropertyValue(name).trim();
      document.body.append(probe);
      const m = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g).map(Number);
      probe.remove();
      return [m[0] / 255, m[1] / 255, m[2] / 255];
    };
    state.ink = rgb("--ink");
    state.paper = rgb("--paper");
    state.dark = state.ink[0] > 0.5 ? 1 : 0;
  }

  // Draw the words into a texture at their DOM positions.
  function build() {
    const style = getComputedStyle(heading);
    const box = heading.getBoundingClientRect();
    const lowEnd = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
    state.dpr = Math.min(lowEnd ? 1.5 : 2, window.devicePixelRatio || 1);
    state.fontSize = parseFloat(style.fontSize);
    state.pad = Math.round(state.fontSize * 0.7);
    const w = box.width + 2 * state.pad;
    const h = box.height + 2 * state.pad;
    canvas.style.left = `${-state.pad}px`;
    canvas.style.top = `${-state.pad}px`;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * state.dpr);
    canvas.height = Math.round(h * state.dpr);

    const src = document.createElement("canvas");
    src.width = canvas.width;
    src.height = canvas.height;
    const g = src.getContext("2d");
    g.scale(state.dpr, state.dpr);
    const condensed = style.fontStretch === "87.5%" || style.fontStretch === "semi-condensed";
    g.font = `${condensed ? "semi-condensed " : ""}${style.fontWeight} ${state.fontSize}px ${style.fontFamily}`;
    const spacing = parseFloat(style.letterSpacing) || 0;
    const hasSpacing = "letterSpacing" in g;
    if (hasSpacing) g.letterSpacing = `${spacing}px`;
    g.fillStyle = "#fff";
    g.textBaseline = "alphabetic";
    const metrics = g.measureText("A");
    const ascent = metrics.fontBoundingBoxAscent ?? state.fontSize * 0.95;

    for (const span of words) {
      const r = span.getBoundingClientRect();
      const x = r.left - box.left + state.pad;
      const y = r.top - box.top + state.pad + ascent;
      const word = span.textContent;
      if (hasSpacing) {
        g.fillText(word, x, y);
      } else {
        // Per-glyph fallback that keeps kerning: advance = width(ab) - width(b).
        let pen = x;
        for (let i = 0; i < word.length; i++) {
          g.fillText(word[i], pen, y);
          const next = word[i + 1];
          pen += next ? g.measureText(word[i] + next).width - g.measureText(next).width : 0;
          pen += spacing;
        }
      }
    }

    // Position of the second word's first letter.
    const node = words[1] && words[1].firstChild;
    if (node) {
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, 1);
      const r = range.getBoundingClientRect();
      const cap = metrics.actualBoundingBoxAscent || state.fontSize * 0.7;
      const baseline = r.top - box.top + state.pad + ascent;
      const x0 = r.left - box.left + state.pad;
      const x1 = r.right - box.left + state.pad - Math.max(0, spacing);
      egg.box = [x0 - 2, baseline - cap - 3, x1 + 2, baseline + 3];
      const host = heading.parentElement.getBoundingClientRect();
      readout.style.left = `${r.left - host.left}px`;
      readout.style.top = `${baseline - cap - state.pad + box.top - host.top - 14}px`;
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function render() {
    const k = state.dpr;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(u.u_size, canvas.width, canvas.height);
    gl.uniform2f(u.u_lens, state.x * k, state.y * k);
    // A light breathing pulse while the lens is out.
    const breath = state.hovering ? Math.sin(performance.now() * 0.0045) : 0;
    gl.uniform1f(u.u_radius, Math.max(0, state.r * (1 + 0.022 * breath)) * k);
    gl.uniform1f(u.u_zoom, Math.max(1, state.z + 0.05 * breath));
    gl.uniform2f(u.u_velocity, state.vx * k * 0.016, state.vy * k * 0.016);
    gl.uniform1f(u.u_blur, state.blur * k);
    gl.uniform1f(u.u_alpha, state.alpha);
    gl.uniform3fv(u.u_ink, state.ink);
    gl.uniform3fv(u.u_paper, state.paper);
    gl.uniform1f(u.u_dark, state.dark);
    const eggOn = egg.box && egg.amt > 0.001;
    gl.uniform1f(u.u_eggOn, eggOn ? 1 : 0);
    if (eggOn) {
      gl.uniform4f(u.u_eggBox, egg.box[0] * k, egg.box[1] * k, egg.box[2] * k, egg.box[3] * k);
      gl.uniform2f(u.u_tiles, TILES, TILES);
      gl.uniform1f(u.u_block, BLOCK);
      gl.uniform1f(u.u_step, egg.step);
      gl.uniform1f(u.u_reset, egg.reset);
      gl.uniform1f(u.u_egg, egg.amt);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // Springs ------------------------------------------------------------------

  let raf = 0;
  let last = 0;

  function spring(pos, vel, target, stiffness, damping, dt) {
    const a = stiffness * (target - pos) - damping * vel;
    vel += a * dt;
    pos += vel * dt;
    return [pos, vel];
  }

  function tick(now) {
    const dt = Math.min(0.033, last ? (now - last) / 1000 : 0.016);
    last = now;

    if (state.opening) {
      opener(now);
    } else {
      [state.x, state.vx] = spring(state.x, state.vx, state.tx, 420, 34, dt);
      [state.y, state.vy] = spring(state.y, state.vy, state.ty, 420, 34, dt);
      // Under-damped radius and zoom give the lens its pop.
      [state.r, state.vr] = spring(state.r, state.vr, state.tr, 210, 15, dt);
      [state.z, state.vz] = spring(state.z, state.vz, state.tz, 160, 14, dt);
    }
    stepEgg(now, dt);
    render();

    const settled =
      !state.opening &&
      !egg.on && egg.amt < 0.001 &&
      Math.abs(state.r - state.tr) < 0.2 && Math.abs(state.vr) < 0.5 &&
      Math.abs(state.z - state.tz) < 0.002 && Math.abs(state.vz) < 0.01 &&
      Math.abs(state.x - state.tx) < 0.2 && Math.abs(state.y - state.ty) < 0.2 &&
      Math.abs(state.vx) < 1 && Math.abs(state.vy) < 1;
    if (settled && !state.hovering) {
      state.r = state.tr;
      state.vx = state.vy = 0;
      render();
      raf = 0;
      last = 0;
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  function wake() {
    if (!raf) raf = requestAnimationFrame(tick);
  }

  // An 8x8 grid of tiles in 4x4 blocks; each tile takes 40 ms and
  // accumulates over K steps, then the result holds and clears.
  const TILES = 8;
  const BLOCK = 4;
  const K = 8;
  const TILE_S = 0.04;
  const SWEEP = TILES * TILES * TILE_S;
  const HOLD = 1.1;
  const CLEAR = 0.35;

  function stepEgg(now, dt) {
    if (!egg.box) return;
    const follow = 1 - Math.exp(-dt * 9);
    egg.amt += ((egg.on ? 1 : 0) - egg.amt) * follow;
    if (!egg.on) return;
    const t = Math.max(0, (now - egg.start) / 1000) % (SWEEP + HOLD + CLEAR);
    const n = TILES * TILES;
    if (t < SWEEP) {
      egg.step = t / TILE_S;
      egg.reset = 0;
      const tile = Math.min(n, Math.floor(egg.step) + 1);
      const kk = Math.min(K, Math.floor((egg.step % 1) * K) + 1);
      stateCell.textContent = `tile ${tile} of ${n}, k ${kk} of ${K}`;
    } else if (t < SWEEP + HOLD) {
      egg.step = n;
      egg.reset = 0;
      stateCell.textContent = `${n} tiles done`;
    } else {
      egg.step = n;
      egg.reset = (t - SWEEP - HOLD) / CLEAR;
      stateCell.textContent = "";
    }
  }

  function setEgg(on) {
    if (on === egg.on) return;
    egg.on = on;
    readout.classList.toggle("is-on", on);
    if (on) {
      egg.start = performance.now();
      egg.step = 0;
      state.tr = 0;
      state.tz = 1;
    } else if (state.hovering) {
      state.tr = state.fontSize * 0.55;
      state.tz = 1.85;
    }
    wake();
  }

  function overEgg(x, y) {
    if (!egg.box) return false;
    const m = 6;
    return x > egg.box[0] - m && x < egg.box[2] + m && y > egg.box[1] - m && y < egg.box[3] + m;
  }

  // Opener: out of focus, a lens sweeps across, then everything focuses.
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  function opener(now) {
    const o = state.opening;
    const t = (now - o.start) / 1000;
    const box = heading.getBoundingClientRect();
    const textWidth = Math.max(...words.map((s) => s.getBoundingClientRect().right)) - box.left;
    const midY = state.pad + box.height / 2;

    state.alpha = Math.min(1, t / 0.35);
    state.blur = state.fontSize * 0.16 * (1 - easeOut(Math.min(1, Math.max(0, (t - 0.55) / 0.85))));

    const sweep = Math.min(1, Math.max(0, (t - 0.15) / 1.05));
    const r0 = state.fontSize * 0.62;
    state.x = state.pad - r0 + ease(sweep) * (textWidth + 2 * r0);
    state.y = midY;
    state.vx = sweep > 0 && sweep < 1 ? 900 : 0;
    state.vy = 0;
    state.r = sweep > 0 && sweep < 1 ? r0 * Math.min(1, sweep * 6, (1 - sweep) * 6) : 0;
    state.z = 1.45;

    if (t > 1.45) {
      state.opening = null;
      state.blur = 0;
      state.alpha = 1;
      state.r = state.tr = 0;
      state.z = state.tz = 1;
      state.vx = state.vy = state.vr = state.vz = 0;
    }
  }

  // Pointer ------------------------------------------------------------------

  function local(e) {
    const box = heading.getBoundingClientRect();
    return [e.clientX - box.left + state.pad, e.clientY - box.top + state.pad];
  }

  function enter(e) {
    const [x, y] = local(e);
    if (!state.hovering && state.r < 1) {
      state.x = state.tx = x;
      state.y = state.ty = y;
    }
    state.hovering = true;
    if (overEgg(x, y)) {
      setEgg(true);
    } else {
      state.tr = state.fontSize * 0.55;
      state.tz = 1.85;
    }
    wake();
  }

  function move(e) {
    if (!state.hovering) return enter(e);
    const [x, y] = local(e);
    state.tx = x;
    state.ty = y;
    clearTimeout(egg.offTimer);
    setEgg(overEgg(x, y));
    wake();
  }

  function leave() {
    state.hovering = false;
    state.tr = 0;
    state.tz = 1;
    setEgg(false);
    wake();
  }

  heading.addEventListener("pointerenter", enter);
  heading.addEventListener("pointermove", move);
  heading.addEventListener("pointerleave", leave);
  heading.addEventListener("pointercancel", leave);
  heading.addEventListener("pointerup", (e) => {
    if (e.pointerType === "mouse") return;
    // On touch, let the matrix play for a moment after the finger lifts.
    if (egg.on) {
      state.hovering = false;
      state.tr = 0;
      clearTimeout(egg.offTimer);
      egg.offTimer = setTimeout(() => setEgg(false), 4000);
      wake();
    } else {
      leave();
    }
  });

  // Setup --------------------------------------------------------------------

  const ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  ready.then(() => {
    readColors();
    build();
    heading.classList.add("is-gl");
    state.opening = { start: performance.now() };
    state.alpha = 0;
    wake();

    let resizeTimer = 0;
    new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        build();
        render();
      }, 60);
    }).observe(heading);

    window.addEventListener("themechange", () => {
      readColors();
      render();
    });
  });

  canvas.addEventListener("webglcontextlost", () => {
    heading.classList.remove("is-gl");
    cancelAnimationFrame(raf);
  });
}

function link(gl, vs, fs) {
  const compile = (type, source) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const v = compile(gl.VERTEX_SHADER, vs);
  const f = compile(gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram();
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
}

const heading = document.querySelector(".name");
if (heading && !matchMedia("(prefers-reduced-motion: reduce)").matches) start(heading);
