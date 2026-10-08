import { h, s } from "./dom";
import { signed } from "./playback";

export const COLOR_A = "#3987e5";
export const COLOR_B = "#d95926";

const linePath = (values: number[], x: (i: number) => number, y: (v: number) => number): string =>
  values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

function frame(width: number, height: number, label: string): { svg: SVGElement; wrap: HTMLElement; tip: HTMLElement } {
  const svg = s("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": label });
  const tip = h("div", { class: "tooltip", hidden: true });
  return { svg, tip, wrap: h("div", { class: "chart" }, svg, tip) };
}

function yAxis(svg: SVGElement, ticks: number[], y: (v: number) => number, left: number, right: number, format: (v: number) => string): void {
  for (const tick of ticks) {
    svg.append(
      s("line", { class: "grid", x1: left, x2: right, y1: y(tick), y2: y(tick) }),
      s("text", { class: "tick", x: left - 6, y: y(tick) + 4, "text-anchor": "end" }, format(tick)),
    );
  }
}

/** World A vs. World B over time for one variable, on a fixed 0..1 scale. */
export function lineChart(title: string, a: number[], b: number[] | null, doStart: number | null): HTMLElement {
  const W = 320, H = 170, L = 34, R = 12, T = 12, B = 24;
  const { svg, wrap, tip } = frame(W, H, `${title} over time`);
  const x = (i: number): number => L + (i / (a.length - 1)) * (W - L - R);
  const y = (v: number): number => T + (1 - v) * (H - T - B);
  yAxis(svg, [0, 0.5, 1], y, L, W - R, (v) => String(v));
  svg.append(
    s("text", { class: "tick", x: L, y: H - 6 }, "day 0"),
    s("text", { class: "tick", x: W - R, y: H - 6, "text-anchor": "end" }, `day ${a.length - 1}`),
  );
  if (doStart !== null) {
    svg.append(
      s("line", { class: "do-line", x1: x(doStart), x2: x(doStart), y1: T, y2: H - B }),
      s("text", { class: "tick", x: x(doStart) + 4, y: T + 9 }, "do"),
    );
  }
  svg.append(s("path", { class: "series", d: linePath(a, x, y), stroke: COLOR_A }));
  if (b) svg.append(s("path", { class: "series", d: linePath(b, x, y), stroke: COLOR_B }));

  const cross = s("line", { class: "crosshair", y1: T, y2: H - B, visibility: "hidden" });
  const dotA = s("circle", { r: 4, fill: COLOR_A, class: "marker", visibility: "hidden" });
  const dotB = s("circle", { r: 4, fill: COLOR_B, class: "marker", visibility: "hidden" });
  svg.append(cross, dotA, dotB);
  svg.addEventListener("pointermove", (event) => {
    const box = svg.getBoundingClientRect();
    const px = (((event as PointerEvent).clientX - box.left) / box.width) * W;
    const i = Math.round(Math.min(1, Math.max(0, (px - L) / (W - L - R))) * (a.length - 1));
    cross.setAttribute("x1", String(x(i)));
    cross.setAttribute("x2", String(x(i)));
    dotA.setAttribute("cx", String(x(i)));
    dotA.setAttribute("cy", String(y(a[i])));
    cross.setAttribute("visibility", "visible");
    dotA.setAttribute("visibility", "visible");
    const rows = [h("strong", {}, `Day ${i}`), h("span", {}, h("i", { style: `background:${COLOR_A}` }), `World A ${a[i].toFixed(3)}`)];
    if (b) {
      dotB.setAttribute("cx", String(x(i)));
      dotB.setAttribute("cy", String(y(b[i])));
      dotB.setAttribute("visibility", "visible");
      rows.push(h("span", {}, h("i", { style: `background:${COLOR_B}` }), `World B ${b[i].toFixed(3)}`), h("span", {}, `Difference ${signed(b[i] - a[i])}`));
    }
    tip.replaceChildren(...rows);
    tip.hidden = false;
    tip.style.left = `${(x(i) / W) * 100}%`;
    tip.classList.toggle("flip", x(i) > W * 0.6);
  });
  svg.addEventListener("pointerleave", () => {
    tip.hidden = true;
    for (const node of [cross, dotA, dotB]) node.setAttribute("visibility", "hidden");
  });
  return h("figure", { class: "mini" }, h("figcaption", {}, title), wrap);
}

export function legend(items: [string, string][]): HTMLElement {
  return h("ul", { class: "legend" }, ...items.map(([color, label]) => h("li", {}, h("i", { style: `background:${color}` }), label)));
}

interface Line { slope: number; intercept: number }

/** Experiment C: what the data shows vs. what intervening does. */
export function confoundingChart(points: { x: number[]; y: number[] }, observed: Line, doLevels: number[], doMeans: number[], doLine: Line): HTMLElement {
  const W = 560, H = 320, L = 46, R = 16, T = 14, B = 40;
  const { svg, wrap } = frame(W, H, "Vegetation against rainfall: observed worlds and intervened worlds");
  const x0 = 0.15, x1 = 0.85, y0 = 0, y1 = 0.8;
  const x = (v: number): number => L + ((v - x0) / (x1 - x0)) * (W - L - R);
  const y = (v: number): number => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  yAxis(svg, [0, 0.2, 0.4, 0.6, 0.8], y, L, W - R, (v) => v.toFixed(1));
  for (const tick of [0.2, 0.35, 0.5, 0.65, 0.8]) svg.append(s("text", { class: "tick", x: x(tick), y: H - B + 16, "text-anchor": "middle" }, tick));
  svg.append(
    s("text", { class: "axis-title", x: (L + W - R) / 2, y: H - 6, "text-anchor": "middle" }, "Rainfall"),
    s("text", { class: "axis-title", x: 12, y: (T + H - B) / 2, "text-anchor": "middle", transform: `rotate(-90 12 ${(T + H - B) / 2})` }, "Vegetation"),
  );
  points.x.forEach((px, i) => {
    svg.append(s("circle", { class: "obs-point", cx: x(px), cy: y(points.y[i]), r: 3.5, fill: COLOR_A },
      s("title", {}, `Observed world: rainfall ${px.toFixed(2)}, vegetation ${points.y[i].toFixed(2)}`)));
  });
  const fit = (line: Line, from: number, to: number): string => `M${x(from)} ${y(line.intercept + line.slope * from)} L${x(to)} ${y(line.intercept + line.slope * to)}`;
  const lo = Math.min(...points.x), hi = Math.max(...points.x);
  svg.append(
    s("path", { class: "series", d: fit(observed, lo, hi), stroke: "#9cc3f5" }),
    s("path", { class: "series", d: fit(doLine, doLevels[0], doLevels[doLevels.length - 1]), stroke: COLOR_B }),
  );
  doLevels.forEach((level, i) => {
    svg.append(s("circle", { class: "marker", cx: x(level), cy: y(doMeans[i]), r: 5, fill: COLOR_B },
      s("title", {}, `do(rainfall = ${level}): mean vegetation ${doMeans[i].toFixed(3)}`)));
  });
  svg.append(
    s("text", { class: "direct", x: x(hi) - 4, y: y(observed.intercept + observed.slope * hi) + 18, "text-anchor": "end" }, "Observed trend"),
    s("text", { class: "direct", x: x(0.8) - 10, y: y(doMeans[doMeans.length - 1]) - 8, "text-anchor": "end" }, "When we set the rain"),
  );
  return h("figure", { class: "wide" }, legend([[COLOR_A, "Each dot: one world, simply observed"], [COLOR_B, "Mean when rainfall is set by do()"]]), wrap);
}

/** Experiment D: one dot per seed, with the mean and its 95% interval. */
export function seedChart(effects: { seed: number; effect: number }[], mean: number, ci: [number, number]): HTMLElement {
  const W = 560, H = 136, L = 16, R = 16, T = 30, B = 48;
  const { svg, wrap } = frame(W, H, "Effect on creatures for each of 30 random seeds");
  const values = effects.map((e) => e.effect);
  const pad = (Math.max(...values) - Math.min(...values)) * 0.15 || 0.01;
  const lo = Math.min(...values) - pad, hi = Math.max(...values) + pad;
  const x = (v: number): number => L + ((v - lo) / (hi - lo)) * (W - L - R);
  const mid = T + (H - T - B) / 2;
  svg.append(s("line", { class: "grid", x1: L, x2: W - R, y1: H - B, y2: H - B }));
  for (let k = 0; k <= 4; k++) {
    const tick = lo + ((hi - lo) * k) / 4;
    svg.append(s("text", { class: "tick", x: x(tick), y: H - B + 16, "text-anchor": k === 0 ? "start" : k === 4 ? "end" : "middle" }, signed(tick)));
  }
  svg.append(
    s("rect", { class: "ci-band", x: x(ci[0]), width: x(ci[1]) - x(ci[0]), y: T, height: H - T - B }),
    s("line", { class: "mean-line", x1: x(mean), x2: x(mean), y1: T - 4, y2: H - B }),
    s("text", { class: "direct", x: x(mean), y: T - 10, "text-anchor": "middle" }, `mean ${signed(mean)}`),
  );
  effects.forEach((e, i) => {
    svg.append(s("circle", { class: "obs-point", cx: x(e.effect), cy: mid + ((i % 5) - 2) * 6, r: 4, fill: COLOR_B },
      s("title", {}, `Seed ${e.seed}: effect ${signed(e.effect, 4)}`)));
  });
  svg.append(s("text", { class: "axis-title", x: W / 2, y: H - 6, "text-anchor": "middle" }, "Effect of do(rainfall = 0.85) on creatures"));
  return h("figure", { class: "wide" }, wrap);
}
