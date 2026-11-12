/**
 * ink-motion — hand-drawn SVG that draws itself.
 *
 * Zero dependencies. Two modes:
 *   playInk(root)   draws once, at a constant pen speed, when it scrolls into view.
 *   scrubInk(root)  ties every stroke to scroll progress, so it draws and un-draws
 *                   as the reader moves (no autoplay, no loop).
 *
 * Both modes expect the same markup:
 *   <svg data-ink>
 *     <path data-ink-draw data-ink-delay="0" pathLength="1" d="…" />
 *     <circle data-ink-drop data-ink-delay="240" … />
 *   </svg>
 *
 * `pathLength="1"` is what makes constant pen speed trivial: every path is
 * normalized to 1 unit, and the *duration* is derived from its real length.
 */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Critically-ish damped spring, returns 0 → 1 with a small overshoot. */
export const springAt = (t, stiffness = 180, damping = 22) => {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(stiffness);
  const z = damping / (2 * Math.sqrt(stiffness));
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
};

const normalize = (el) => {
  if (!el.hasAttribute("pathLength")) el.setAttribute("pathLength", "1");
  el.style.strokeDasharray = "1";
  el.style.strokeDashoffset = "1";
};

const measure = (el, fallback = 400) => {
  try {
    return el.getTotalLength() || fallback;
  } catch {
    return fallback;
  }
};

const prefersReduced = () =>
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Draw once, in DOM order, at a constant pen speed.
 * @returns {{ play: () => void, destroy: () => void, duration: number }}
 */
export function playInk(root, options = {}) {
  const { speed = 620, stagger = 80, auto = true, onDone } = options;
  const draws = [...root.querySelectorAll("[data-ink-draw]")];
  const drops = [...root.querySelectorAll("[data-ink-drop]")];

  let cursor = 0;
  const plan = draws.map((el) => {
    normalize(el);
    const len = measure(el);
    const dur = Math.max(140, (len / speed) * 1000);
    const delay = el.dataset.inkDelay !== undefined ? Number(el.dataset.inkDelay) : cursor;
    cursor = Math.max(cursor, delay) + stagger;
    return { el, dur, delay };
  });

  const dropPlan = drops.map((el) => {
    el.style.opacity = "0";
    return { el, delay: el.dataset.inkDelay !== undefined ? Number(el.dataset.inkDelay) : cursor };
  });

  const total = Math.max(600, ...plan.map((p) => p.delay + p.dur), ...dropPlan.map((d) => d.delay + 700));

  let raf = 0;
  let startedAt = 0;
  let done = false;

  const settle = () => {
    plan.forEach(({ el }) => (el.style.strokeDashoffset = "0"));
    dropPlan.forEach(({ el }) => {
      el.style.opacity = "1";
      el.style.transform = "none";
    });
  };

  const frame = (now) => {
    if (!startedAt) startedAt = now;
    const t = now - startedAt;
    plan.forEach(({ el, dur, delay }) => {
      el.style.strokeDashoffset = String(1 - clamp01((t - delay) / dur));
    });
    dropPlan.forEach(({ el, delay }) => {
      const sec = clamp01((t - delay) / 900) * 0.9;
      const v = springAt(sec);
      el.style.opacity = String(clamp01(v * 1.6));
      el.style.transform = `scale(${(0.72 + 0.28 * v).toFixed(3)})`;
    });
    if (t < total) raf = requestAnimationFrame(frame);
    else if (!done) {
      done = true;
      settle();
      onDone && onDone();
    }
  };

  const play = () => {
    if (prefersReduced()) return settle();
    cancelAnimationFrame(raf);
    startedAt = 0;
    done = false;
    raf = requestAnimationFrame(frame);
  };

  let io = null;
  if (auto) {
    io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            play();
            io.disconnect();
          }
        });
      },
      { threshold: 0.25 }
    );
    io.observe(root);
  }

  if (prefersReduced()) settle();

  return {
    play,
    duration: total,
    destroy() {
      cancelAnimationFrame(raf);
      io && io.disconnect();
    },
  };
}

/**
 * Tie every stroke to a progress value 0…1. Nothing plays on its own.
 * Stroke i starts at `stage * stageGap + i/n * groupSpread` and takes `window` to finish.
 *
 * @returns {{ update: (p: number) => void, bind: () => () => void }}
 */
export function scrubInk(root, options = {}) {
  const { section = root, stageGap = 0.17, groupSpread = 0.1, window: win = 0.14, onUpdate } = options;
  const draws = [...root.querySelectorAll("[data-ink-draw]")];
  const dots = [...root.querySelectorAll("[data-ink-drop]")];

  const byStage = new Map();
  draws.forEach((el) => {
    const stage = Number(el.dataset.inkStage || el.dataset.stage || 0);
    if (!byStage.has(stage)) byStage.set(stage, []);
    byStage.get(stage).push(el);
  });

  const plan = [];
  byStage.forEach((els, stage) => {
    els.forEach((el, i) => {
      normalize(el);
      plan.push({
        el,
        start: el.dataset.inkStart !== undefined
          ? Number(el.dataset.inkStart)
          : stage * stageGap + (els.length > 1 ? (i / (els.length - 1)) * groupSpread : 0),
      });
    });
  });

  const dotPlan = dots.map((el) => {
    el.style.opacity = "0";
    return { el, start: el.dataset.inkStart !== undefined ? Number(el.dataset.inkStart) : 0.6 };
  });

  const update = (p) => {
    const v = clamp01(p);
    plan.forEach(({ el, start }) => {
      el.style.strokeDashoffset = String(1 - clamp01((v - start) / win));
    });
    dotPlan.forEach(({ el, start }) => {
      el.style.opacity = String(clamp01((v - start) / 0.12));
    });
    onUpdate && onUpdate(v);
  };

  const bind = () => {
    let raf = 0;
    const tick = () => {
      raf = 0;
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      // 0 when the section top hits 88% of the viewport, 1 after it has travelled 95% of its height.
      update((vh * 0.88 - rect.top) / (rect.height * 0.95));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    tick();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  };

  if (prefersReduced()) update(1);

  return { update, bind };
}
