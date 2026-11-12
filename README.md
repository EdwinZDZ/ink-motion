# ink-motion

Hand-drawn SVG line art that draws itself: constant pen speed, spring landing, scroll scrub. One file, no dependencies, no build step.

![Demo: a hand-drawn diagram drawing itself, then a storyboard studio scene scrubbed by scroll](media/demo.gif)

## Why this exists

We rebuilt the landing page of an AI storyboarding product and wanted the diagrams to feel drawn, not revealed. The usual fade-and-translate tricks looked like a template. After surveying how existing SVG line-drawing libraries work — **Vivus** (one-by-one drawing, duration from path length), **CC-lineart** (hand-drawn path conventions), **line-art-animation** (spring and pendulum motion), **runway-svg-animation** (outside-in sequencing) and **Morrph** (expo-out easing) — we kept the ideas and wrote one small module instead of adding a dependency.

The result is this file: `src/ink-motion.js`, about 200 lines, no imports.

## What it does

- **Constant pen speed.** Every stroke takes `length / speed` milliseconds, so a long horizon line does not finish at the same time as a short tick.
- **Spring landing.** Dots and cards settle with a damped spring (stiffness 180, damping 22) rather than a linear fade.
- **Scroll scrub.** In scrub mode nothing plays on its own. Progress drives `stroke-dashoffset`, so scrolling down draws and scrolling up un-draws. No loop, no autoplay.
- **Honest fallbacks.** `prefers-reduced-motion` jumps to the final state. Without JavaScript the strokes can be shown with a `noscript` rule; the markup is plain SVG.

## Quick start

**1.** Copy `src/ink-motion.js` into your project. It is an ES module with zero imports.

**2.** Mark up your SVG. `pathLength="1"` is required — it normalizes every path so one dashoffset value works everywhere.

```html
<svg class="ink" viewBox="0 0 420 300" data-ink>
  <path data-ink-draw data-ink-delay="0" pathLength="1" d="M40 44 C120 40 …" />
  <path data-ink-draw data-ink-delay="240" pathLength="1" d="M178 118 L216 186" />
  <circle data-ink-drop data-ink-delay="980" cx="128" cy="108" r="3.2" />
</svg>
```

**3.** Two lines of JavaScript.

```js
import { playInk, scrubInk } from "./ink-motion.js";

// Draw once when it scrolls into view
playInk(document.querySelector(".ink"));

// …or tie every stroke to scroll progress
scrubInk(document.querySelector(".ink-scene"), {
  section: document.querySelector("#stage-scrub"),
}).bind();
```

CSS only has to declare how your ink looks:

```css
.ink path,
.ink circle {
  fill: none;
  stroke: #1c1915;
  stroke-width: 1.05;
  stroke-linecap: round;
  stroke-linejoin: round;
}
```

## How it works

### 1. Normalize with `pathLength="1"`

A path's real length might be 12 units or 1,400. Setting `pathLength="1"` makes the browser treat every path as one unit long, so `stroke-dasharray: 1` and a `stroke-dashoffset` between 1 and 0 produces the same draw-in behavior everywhere.

### 2. Measure once, derive duration

`getTotalLength()` still returns the real geometry length. Duration is `length / speed` (default 620 units per second), measured a single time up front — never per frame.

### 3. Draw with `stroke-dashoffset`

A `requestAnimationFrame` loop maps elapsed time to each stroke's local progress:

```js
el.style.strokeDashoffset = String(1 - clamp01((t - delay) / duration));
```

Because the dash is proportional to the normalized path, advancing linearly gives a constant pen speed. Order comes from DOM position, `data-ink-delay`, or a stagger.

### 4. Land with a spring

Dots use a closed-form damped spring instead of a CSS transition, so the overshoot is physical and tunable:

```js
const w0 = Math.sqrt(stiffness);
const z = damping / (2 * Math.sqrt(stiffness));
const wd = w0 * Math.sqrt(1 - z * z);
value = 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
```

### 5. Scrub with progress

In scrub mode strokes are grouped by `data-ink-stage`. Stroke *i* of *n* in a stage starts at `stage × stageGap + i/n × groupSpread` and finishes within `window`. One progress value drives everything, which is why scrolling back is free.

## API

### `playInk(root, options?)`

| Option | Default | Meaning |
| --- | --- | --- |
| `speed` | `620` | Pen speed in geometry units per second |
| `stagger` | `80` | Extra delay between strokes without `data-ink-delay` |
| `auto` | `true` | Play once when `root` enters the viewport |
| `onDone` | — | Called after the last stroke settles |

Returns `{ play, duration, destroy }`.

### `scrubInk(root, options?)`

| Option | Default | Meaning |
| --- | --- | --- |
| `section` | `root` | Element whose scroll position drives progress |
| `stageGap` | `0.17` | Progress distance between stages |
| `groupSpread` | `0.1` | Progress spread inside one stage |
| `window` | `0.14` | Progress each stroke takes to finish |
| `onUpdate` | — | Called with progress `0…1` |

Returns `{ update, bind }`. Call `bind()` for scroll binding, or drive `update(p)` yourself (video scrub, sliders, timelines).

### Markup attributes

| Attribute | Applies to | Meaning |
| --- | --- | --- |
| `data-ink` | `<svg>` | Root, observed for one-shot playback |
| `data-ink-draw` | `<path>`, `<circle>` | Stroke to draw with a dash offset |
| `data-ink-drop` | any element | Element that lands with a spring |
| `data-ink-delay` | draw / drop | Milliseconds before it starts (`playInk`), or progress offset (`scrubInk`) |
| `data-ink-stage` | draw | Group index for scrub sequencing |
| `pathLength="1"` | draw | Required normalization |

## Demo

```bash
cd ink-motion
python3 -m http.server 8901
open http://127.0.0.1:8901/demo/
```

Three sections: draw-once, scroll scrub, spring landing. The storyboard scene is 81 strokes in five stages.

## Notes on the drawings

The engine only handles timing. The hand-drawn quality comes from the paths:

1. Draw with slight overshoot and uneven handles — no perfect circles, no mirrored symmetry.
2. Vary density: a few confident long lines, a few short ticks, one offset wash underneath.
3. Keep one accent color for tiny marks (a selected frame, a record light). It reads as a pencil annotation.

## Browser support

Any browser with `IntersectionObserver`, `requestAnimationFrame` and `getTotalLength()` — Chrome, Edge, Firefox, Safari. ES modules required.

## Credits

Ideas borrowed, implementation written from scratch: **Vivus** (one-by-one drawing, duration from path length), **CC-lineart** (hand-drawn path conventions), **line-art-animation** (spring motion), **runway-svg-animation** (outside-in ordering), **Morrph** (expo-out easing).

## License

MIT.

---

# 中文

## 这是什么

一套让手绘 SVG 线稿「自己画出来」的小引擎：恒定笔速、弹簧落位、跟随滚动逐笔描出。单文件、零依赖、无构建步骤。

![演示：手绘图自己描出，随后分镜工作室场景跟随滚动逐笔生长](media/demo.gif)

## 为什么写它

在一次 AI 分镜产品的落地页重做里，我们希望图表看起来是「被画出来的」，而不是淡入上浮。查过现有做法后——**Vivus** 的逐笔绘制与按路径长度分配时长、**CC-lineart** 的手绘路径规范、**line-art-animation** 的弹簧与钟摆、**runway-svg-animation** 的由外向内顺序、**Morrph** 的 expo-out 缓动——只取思路，自己写了一个约 200 行的模块，不引入依赖。

## 特性

- **恒定笔速**：每条路径耗时 `长度 / 速度`，长线条不会和短刻度同时收笔。
- **弹簧落位**：点与卡片用阻尼弹簧（stiffness 180、damping 22）落位，不是线性淡入。
- **滚动逐笔**：scrub 模式下不自动播放，滚动进度直接驱动 `stroke-dashoffset`，下滑画、上滑退，无循环。
- **诚实的降级**：`prefers-reduced-motion` 直接终态；无 JS 时可用 `noscript` 规则显示完整线稿。

## 快速开始

**1.** 把 `src/ink-motion.js` 拷进项目，它是零依赖的 ES module。

**2.** 标记 SVG。`pathLength="1"` 是必须的——它把每条路径归一化，一套 dashoffset 值就能通用。

```html
<svg class="ink" viewBox="0 0 420 300" data-ink>
  <path data-ink-draw data-ink-delay="0" pathLength="1" d="M40 44 C120 40 …" />
  <path data-ink-draw data-ink-delay="240" pathLength="1" d="M178 118 L216 186" />
  <circle data-ink-drop data-ink-delay="980" cx="128" cy="108" r="3.2" />
</svg>
```

**3.** 两行 JS。

```js
import { playInk, scrubInk } from "./ink-motion.js";

// 进入视口播一次
playInk(document.querySelector(".ink"));

// 或者：每一条线都跟着滚动进度走
scrubInk(document.querySelector(".ink-scene"), {
  section: document.querySelector("#stage-scrub"),
}).bind();
```

## 原理

1. **归一化**：`pathLength="1"` 让浏览器把任意长度视为 1 个单位，`stroke-dasharray: 1` 配 `stroke-dashoffset` 从 1 到 0 就是描线。
2. **只测一次**：`getTotalLength()` 仍返回真实长度，`时长 = 长度 / 620`，在初始化时测一次，不逐帧调用。
3. **逐帧推进**：`stroke-dashoffset = 1 - clamp((t - delay) / duration)`。因为 dash 按归一化比例走，线性推进等于恒定笔速。
4. **弹簧落位**：用阻尼弹簧的闭式解，过冲可调，不用 CSS transition 近似。
5. **滚动逐笔**：按 `data-ink-stage` 分组，组内按序号错峰，一个进度值驱动全部，所以上滑回退是免费的。

## API

`playInk(root, { speed = 620, stagger = 80, auto = true, onDone })` → `{ play, duration, destroy }`

`scrubInk(root, { section, stageGap = 0.17, groupSpread = 0.1, window = 0.14, onUpdate })` → `{ update, bind }`

标记属性：

| 属性 | 作用 |
| --- | --- |
| `data-ink` | 根节点，进入视口时触发一次性播放 |
| `data-ink-draw` | 需要描出的路径 |
| `data-ink-drop` | 需要弹簧落位的元素 |
| `data-ink-delay` | 播放模式下的毫秒延迟；scrub 模式下的进度偏移 |
| `data-ink-stage` | scrub 分组序号 |
| `pathLength="1"` | 归一化，必须 |

## 运行演示

```bash
cd ink-motion
python3 -m http.server 8901
open http://127.0.0.1:8901/demo/
```

三段：进入视口描出、跟随滚动逐笔、弹簧落位。演示里的分镜工作室是 81 条笔迹、五个阶段。

## 关于「手绘感」

引擎只负责时序，手感来自路径本身：

1. 起收笔留一点过冲，句柄不等长——不要正圆、不要镜像对称。
2. 疏密要有差：几条长线定骨架，几笔短线补细节，底下垫一块偏移的极淡水彩。
3. 只留一种点缀色（被选中的格子、录制灯），它读起来像铅笔批注，而不是装饰。

## 许可

MIT。
