// Page behaviour: the sheet stack and the Mumbai clock, then the theme
// switch and the link glows.

const root = document.documentElement;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

// ==== Sheets ===============================================================
// Once the first section has slid up over the hero, the hero's cap shows
// the name as a link home, and the spectrogram underneath can rest.

const hero = document.querySelector(".hero");
const firstMark = document.querySelector("#now");
let coveredAt = Infinity;
let covered = false;
let queued = false;

function measure() {
  const cap = parseFloat(getComputedStyle(root).getPropertyValue("--cap")) || 56;
  coveredAt = firstMark ? firstMark.getBoundingClientRect().top + scrollY - cap : Infinity;
}

function check() {
  queued = false;
  const now = scrollY >= coveredAt - 1;
  if (now === covered) return;
  covered = now;
  hero.classList.toggle("is-covered", covered);
  window.dispatchEvent(new CustomEvent("herocover", { detail: covered }));
}

if (hero) {
  measure();
  check();
  addEventListener("resize", () => {
    measure();
    check();
  });
  addEventListener(
    "scroll",
    () => {
      if (!queued) requestAnimationFrame(check);
      queued = true;
    },
    { passive: true },
  );
}

// ==== Clock ================================================================

const clock = document.querySelector(".clock");

if (clock) {
  const format = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
  const tick = () => {
    clock.textContent = `It’s ${format.format(new Date()).replace("AM", "am").replace("PM", "pm")} in Mumbai.`;
    clock.hidden = false;
    setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
  };
  tick();
}

// ==== Theme and glow =======================================================
// The switch remembers its choice, otherwise the system decides. The new
// theme opens out from the switch while a glow flares from it. Hovering a
// link blooms a glow around it: green for GitHub, blue for LinkedIn, and
// the colour of the theme you'd get for the switch.

const toggle = document.querySelector(".theme");
const glow = document.querySelector(".glow");
const systemDark = matchMedia("(prefers-color-scheme: dark)");
const current = () => root.dataset.theme || (systemDark.matches ? "dark" : "light");
let flareTimer = 0;

function renderToggle() {
  const next = current() === "dark" ? "light" : "dark";
  toggle.textContent = next === "dark" ? "Dark" : "Light";
  toggle.dataset.current = current();
  toggle.setAttribute("aria-label", `Switch to ${next} mode`);
}

function aim(el) {
  const r = el.getBoundingClientRect();
  root.style.setProperty("--glow-x", `${r.left + r.width / 2}px`);
  root.style.setProperty("--glow-y", `${r.top + r.height / 2}px`);
}

function setTheme(next) {
  root.dataset.theme = next;
  try {
    localStorage.setItem("theme", next);
  } catch {
    // Blocked storage: the switch still works for this visit.
  }
  renderToggle();
  window.dispatchEvent(new Event("themechange"));
}

if (toggle) {
  toggle.addEventListener("click", () => {
    const next = current() === "dark" ? "light" : "dark";
    if (!document.startViewTransition || reducedMotion.matches) return setTheme(next);
    const r = toggle.getBoundingClientRect();
    root.style.setProperty("--reveal-x", `${r.left + r.width / 2}px`);
    root.style.setProperty("--reveal-y", `${r.top + r.height / 2}px`);
    if (glow) {
      clearTimeout(flareTimer);
      aim(toggle);
      glow.dataset.tone = next === "dark" ? "black" : "white";
      glow.classList.remove("is-on");
      glow.classList.add("is-flare");
      flareTimer = setTimeout(() => glow.classList.remove("is-flare"), 1050);
    }
    window.dispatchEvent(new CustomEvent("themetransition", { detail: 900 }));
    document.startViewTransition(() => setTheme(next));
  });
  systemDark.addEventListener("change", () => {
    renderToggle();
    window.dispatchEvent(new Event("themechange"));
  });
  renderToggle();
  toggle.hidden = false;
}

if (glow) {
  for (const el of document.querySelectorAll("[data-glow]")) {
    const on = () => {
      if (glow.classList.contains("is-flare")) return;
      aim(el);
      const kind = el.dataset.glow;
      glow.dataset.tone = kind === "theme" ? (current() === "dark" ? "white" : "black") : kind;
      glow.classList.add("is-on");
    };
    const off = () => glow.classList.remove("is-on");
    el.addEventListener("pointerenter", on);
    el.addEventListener("pointerleave", off);
    el.addEventListener("focus", on);
    el.addEventListener("blur", off);
  }
}
