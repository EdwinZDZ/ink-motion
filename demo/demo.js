import { playInk, scrubInk } from "../src/ink-motion.js";

const $ = (selector) => document.querySelector(selector);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* One drawing, cloned into the workbench and both halves of the comparison. */
const tpl = $("#artTpl");
const mount = (host) => {
  const svg = tpl.content.firstElementChild.cloneNode(true);
  host.appendChild(svg);
  return svg;
};

const mainArt = mount($("#canvasFrame"));
const leftArt = mount($("#compareA"));
const rightArt = mount($("#compareB"));

/* ---------- workbench ---------- */

const ui = {
  mode: $("[data-mode]"),
  speed: $("#speed"),
  stagger: $("#stagger"),
  gap: $("#gap"),
  progress: $("#progress"),
  replay: $("#replay"),
  speedVal: $("#speedVal"),
  staggerVal: $("#staggerVal"),
  gapVal: $("#gapVal"),
  progressVal: $("#progressVal"),
  stateVal: $("#stateVal"),
  meta: $("#canvasMeta"),
};

let mode = "play";
let player = null;
let scrubber = null;
let controller = null;

const setPressed = () => {
  document.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.mode === mode));
  });
  const isPlay = mode === "play";
  ui.speed.disabled = !isPlay;
  ui.stagger.disabled = !isPlay;
  ui.gap.disabled = isPlay;
  ui.progress.disabled = isPlay;
  ui.replay.textContent = isPlay ? "Replay drawing" : "Reset progress";
};

const rebuild = () => {
  if (player) player.destroy();
  if (controller) controller();
  player = null;
  controller = null;
  scrubber = null;

  const speed = Number(ui.speed.value);
  const stagger = Number(ui.stagger.value);
  const gap = Number(ui.gap.value);

  ui.speedVal.textContent = `${speed} u/s`;
  ui.staggerVal.textContent = `${stagger} ms`;
  ui.gapVal.textContent = gap.toFixed(2);

  if (mode === "play") {
    player = playInk(mainArt, { speed, stagger, auto: false });
    ui.stateVal.textContent = `${(player.duration / 1000).toFixed(2)} s`;
    ui.meta.textContent = `play once · ${speed} u/s`;
    if (!reduced) player.play();
  } else {
    scrubber = scrubInk(mainArt, {
      section: mainArt,
      stageGap: gap,
      groupSpread: 0.12,
      window: 0.16,
    });
    ui.stateVal.textContent = "scrub";
    const p = reduced ? 1 : Number(ui.progress.value) / 100;
    scrubber.update(p);
    ui.progressVal.textContent = `${Math.round(p * 100)}%`;
    ui.meta.textContent = `${Math.round(p * 100)}% drawn · drag to un-draw`;
  }
  setPressed();
};

const replay = () => {
  if (mode === "play") {
    if (player) player.play();
  } else {
    ui.progress.value = "0";
    ui.progressVal.textContent = "0%";
    if (scrubber) scrubber.update(0);
    ui.meta.textContent = "0% drawn · drag to draw";
  }
};

document.querySelectorAll("[data-mode]").forEach((btn) => {
  btn.addEventListener("click", () => {
    mode = btn.dataset.mode;
    rebuild();
  });
});

[ui.speed, ui.stagger, ui.gap].forEach((input) =>
  input.addEventListener("input", () => {
    if (mode === "play" && (input === ui.speed || input === ui.stagger)) {
      if (player) player.destroy();
      player = playInk(mainArt, {
        speed: Number(ui.speed.value),
        stagger: Number(ui.stagger.value),
        auto: false,
      });
      if (!reduced) player.play();
      ui.speedVal.textContent = `${ui.speed.value} u/s`;
      ui.staggerVal.textContent = `${ui.stagger.value} ms`;
      ui.stateVal.textContent = `${(player.duration / 1000).toFixed(2)} s`;
    } else {
      rebuild();
    }
  }),
);

ui.progress.addEventListener("input", () => {
  const p = clamp01(Number(ui.progress.value) / 100);
  ui.progressVal.textContent = `${Math.round(p * 100)}%`;
  ui.meta.textContent = `${Math.round(p * 100)}% drawn · drag to un-draw`;
  if (scrubber) scrubber.update(p);
});

ui.replay.addEventListener("click", replay);

/* Geometry readout — the whole point of constant pen speed. */
const lengths = [...mainArt.querySelectorAll("[data-ink-draw]")].map((el) => {
  try {
    return el.getTotalLength();
  } catch {
    return 0;
  }
});
$("#strokeCount").textContent = String(lengths.length);
$("#longest").textContent = `${Math.round(Math.max(...lengths))} u`;
$("#shortest").textContent = `${Math.round(Math.min(...lengths))} u`;

rebuild();

/* ---------- comparison: equal duration vs length / speed ---------- */

const compareProgress = $("#compareProgress");
const compareClock = $("#compareClock");
let compareRaf = 0;
let compareState = null;
let compareTotal = 0;
const STAGGER_MS = 24;
const FIXED_MS = 620;

const prepare = (svg, fixed) => {
  const items = [...svg.querySelectorAll("[data-ink-draw]")].map((el, i) => {
    el.style.strokeDasharray = "1";
    el.style.strokeDashoffset = "1";
    let len = 400;
    try {
      len = el.getTotalLength() || 400;
    } catch {
      /* fallback for non-geometry elements */
    }
    return {
      el,
      delay: i * STAGGER_MS,
      dur: fixed ? FIXED_MS : Math.max(120, (len / 620) * 1000),
    };
  });
  const dots = [...svg.querySelectorAll("[data-ink-drop]")];
  dots.forEach((d) => (d.style.opacity = "0"));
  return { items, dots };
};

const ensureCompare = () => {
  if (compareState) return;
  const a = prepare(leftArt, true);
  const b = prepare(rightArt, false);
  compareTotal =
    Math.max(
      ...a.items.map((i) => i.delay + i.dur),
      ...b.items.map((i) => i.delay + i.dur),
    ) + 260;
  compareState = { a, b };
};

/* One pure render function: playback and the slider both call it. */
const renderCompare = (t) => {
  if (!compareState) return;
  const { a, b } = compareState;
  [a, b].forEach(({ items, dots }) => {
    items.forEach(({ el, delay, dur }) => {
      el.style.strokeDashoffset = String(1 - clamp01((t - delay) / dur));
    });
    dots.forEach(
      (d) =>
        (d.style.opacity = String(clamp01((t - compareTotal * 0.62) / 400))),
    );
  });
  const p = clamp01(t / compareTotal);
  compareProgress.value = String(Math.round(p * 100));
  compareClock.textContent = `${(t / 1000).toFixed(2)} / ${(compareTotal / 1000).toFixed(2)} s`;
};

const runCompare = () => {
  cancelAnimationFrame(compareRaf);
  compareState = null;
  ensureCompare();
  if (reduced) {
    renderCompare(compareTotal);
    return;
  }
  let started = 0;
  const frame = (now) => {
    if (!started) started = now;
    const t = now - started;
    renderCompare(t);
    if (t < compareTotal) compareRaf = requestAnimationFrame(frame);
  };
  compareRaf = requestAnimationFrame(frame);
};

compareProgress.addEventListener("input", () => {
  cancelAnimationFrame(compareRaf);
  ensureCompare();
  renderCompare((Number(compareProgress.value) / 100) * compareTotal);
});

$("#comparePlay").addEventListener("click", runCompare);

/* Run the comparison once when it scrolls into view; the button re-runs it. */
const compareSection = $(".compare");
let compareSeen = false;
const compareObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && !compareSeen) {
        compareSeen = true;
        compareObserver.disconnect();
        runCompare();
      }
    });
  },
  { threshold: 0.35 },
);
compareObserver.observe(compareSection);

/* First paint: the finished drawing, with the timeline at 100%. */
ensureCompare();
renderCompare(compareTotal);
