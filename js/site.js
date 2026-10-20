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

function measure() {
  const cap = parseFloat(getComputedStyle(root).getPropertyValue("--cap")) || 56;
  coveredAt = firstMark ? firstMark.getBoundingClientRect().top + scrollY - cap : Infinity;
}

function check() {
  queued = false;
  root.classList.toggle("is-scrolled", scrollY > 0);
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

// Until the visitor has scrolled a fair way, the next sheet lifts and
// springs back shortly after load and then every 9 to 14 seconds while the
// page sits at the top.
const nextSheet = document.querySelector(".section");

if (nextSheet && !reducedMotion.matches) {
  let done = false;
  const invite = () => {
    if (done) return;
    if (scrollY <= 8) {
      nextSheet.classList.remove("is-inviting");
      void nextSheet.offsetWidth;
      nextSheet.classList.add("is-inviting");
    }
    setTimeout(invite, 9000 + Math.random() * 5000);
  };
  nextSheet.addEventListener("animationend", () => nextSheet.classList.remove("is-inviting"));
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
// The switch remembers its choice, otherwise the system decides. The new
// theme opens out from the switch in a circle.

const toggle = document.querySelector(".theme");
const systemDark = matchMedia("(prefers-color-scheme: dark)");
const current = () => root.dataset.theme || (systemDark.matches ? "dark" : "light");

function renderToggle() {
  const next = current() === "dark" ? "light" : "dark";
  toggle.firstElementChild.textContent = next === "dark" ? "Dark" : "Light";
  toggle.dataset.current = current();
  toggle.setAttribute("aria-label", `Switch to ${next} mode`);
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

// The outline of a masthead link lights up under the pointer.
for (const el of document.querySelectorAll(".links > a, .links > button")) {
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  });
}
