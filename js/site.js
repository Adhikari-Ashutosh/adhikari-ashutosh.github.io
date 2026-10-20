// Page behaviour: the sheet stack and the Mumbai clock, then the theme
// switch and the masthead links.

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

// Each sheet's height, for its sticky offset in the stylesheet: a sheet
// taller than the room under its tab sticks only once its end is on
// screen, so nothing in it is ever out of reach.
const sheets = [...document.querySelectorAll(".sheet")];

function fit() {
  for (const sheet of sheets) sheet.style.setProperty("--h", `${sheet.offsetHeight}px`);
}

function measure() {
  fit();
  const cap = parseFloat(getComputedStyle(root).getPropertyValue("--cap")) || 56;
  coveredAt = firstMark ? firstMark.getBoundingClientRect().top + scrollY - cap : Infinity;
}

function check() {
  queued = false;
  root.classList.toggle("is-scrolled", scrollY > 0);
  const now = scrollY >= coveredAt - 1;
  if (now === covered) return;
  covered = now;
  root.classList.toggle("is-covered", covered);
  window.dispatchEvent(new CustomEvent("herocover", { detail: covered }));
}

if (hero) {
  measure();
  check();
  document.fonts?.ready.then(measure);
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

// Until the visitor has scrolled a fair way, the next sheet lifts and
// springs back shortly after load and then every 9 to 14 seconds while the
// page sits at the top.
const next = [document.querySelector(".tab:not(.masthead)"), document.querySelector(".section")].filter(Boolean);

if (next.length && !reducedMotion.matches) {
  let done = false;
  const invite = () => {
    if (done) return;
    if (scrollY <= 8) {
      for (const el of next) el.classList.remove("is-inviting");
      void next[0].offsetWidth;
      for (const el of next) el.classList.add("is-inviting");
    }
    setTimeout(invite, 9000 + Math.random() * 5000);
  };
  next[0].addEventListener("animationend", () => next.forEach((el) => el.classList.remove("is-inviting")));
  addEventListener("scroll", () => (done ||= scrollY > innerHeight * 0.4), { passive: true });
  setTimeout(invite, 1800);
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

// ==== Theme ================================================================
// The theme button opens a searchable list of two-colour themes
// (js/palette.js, loaded on first use). The choice is applied before the
// first paint by the script in the page head; without one, the system's
// light or dark setting decides.

const themeButton = document.querySelector(".theme");
const systemDark = matchMedia("(prefers-color-scheme: dark)");
const themeColors = document.querySelectorAll('meta[name="theme-color"]');

// Browser chrome follows the paper colour.
function syncThemeColor() {
  const paper = root.dataset.theme ? getComputedStyle(root).getPropertyValue("--paper").trim() : "";
  themeColors.forEach((meta, i) => (meta.content = paper || (i ? "#000000" : "#ffffff")));
}

if (themeButton) {
  themeButton.addEventListener("click", async () => {
    const { openPalette } = await import("./palette.js?v=13");
    openPalette();
  });
  themeButton.hidden = false;
}

systemDark.addEventListener("change", () => {
  if (!root.dataset.theme) window.dispatchEvent(new Event("themechange"));
});
addEventListener("themechange", syncThemeColor);
syncThemeColor();

// The outline of a masthead link lights up under the pointer.
for (const el of document.querySelectorAll(".links > a, .links > button")) {
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  });
}
