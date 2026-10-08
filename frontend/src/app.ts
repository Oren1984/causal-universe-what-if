import { byId, h } from "./dom";
import { renderExperiments, renderRun } from "./evidence";
import { createGraph } from "./graph";
import { LABELS, Playback, VARS, divergedAt, pct, signed, stateAt } from "./playback";
import type { Api, InterveneResponse, Series, VarId } from "./types";
import { WorldRenderer } from "./world";

const STEPS = 240;
const DO_START = 60;
const PULSE_STEPS = 40;
type ViewId = "explore" | "graph" | "evidence";

export interface App {
  /** Advance the shared clock by wall time. Called every animation frame. */
  advance(dtMs: number): void;
}

export async function start(api: Api): Promise<App> {
  const el = {
    error: byId("error"),
    scenario: byId<HTMLSelectElement>("scenario"),
    intervention: byId<HTMLSelectElement>("intervention"),
    value: byId<HTMLInputElement>("value"),
    valueOut: byId("value-out"),
    play: byId<HTMLButtonElement>("btn-play"),
    scrub: byId<HTMLInputElement>("scrub"),
    clock: byId("clock"),
    marker: byId("do-marker"),
    highlights: byId<HTMLInputElement>("highlights"),
    chain: byId("chain"),
    status: byId("status"),
    captionA: byId("caption-a"),
    captionB: byId("caption-b"),
    experiments: byId("evidence-experiments"),
  };
  const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const fail = (error: unknown): void => {
    el.error.textContent = `Something went wrong: ${error instanceof Error ? error.message : String(error)}`;
    el.error.hidden = false;
  };
  const guard = (action: () => Promise<void>) => (): void => {
    el.error.hidden = true;
    action().catch(fail);
  };

  const [model, scenarios] = await Promise.all([api.model(), api.scenarios()]);
  const playback = new Playback(STEPS);
  const worldA = new WorldRenderer(byId<HTMLCanvasElement>("canvas-a"));
  const worldB = new WorldRenderer(byId<HTMLCanvasElement>("canvas-b"));
  const graph = createGraph(byId("graph"), byId("node-info"), model);

  let seed = 42;
  // Null until the first world has loaded; controls are live before that.
  let baseline: Series | null = null;
  // Only the most recent request may update the screen.
  let latestRequest = 0;
  let comparison: InterveneResponse | null = null;
  let ambient = 0;
  let view: ViewId = "explore";
  let experimentsRequested = false;

  // Static controls.
  el.scenario.replaceChildren(...scenarios.map((sc) => h("option", { value: sc.id, title: sc.description }, sc.name)));
  el.intervention.replaceChildren(...model.interventions.map((p) => h("option", { value: p.id }, p.label)));
  const preset = () => model.interventions.find((p) => p.id === el.intervention.value)!;
  const chainItems = new Map<VarId, { item: HTMLElement; a: HTMLElement; b: HTMLElement; delta: HTMLElement }>();
  for (const v of VARS) {
    const a = h("span", { class: "a" });
    const b = h("span", { class: "b" });
    const delta = h("span", { class: "delta" });
    const item = h("li", { "data-var": v }, h("strong", {}, LABELS[v]), h("span", { class: "pair" }, a, b), delta);
    chainItems.set(v, { item, a, b, delta });
    el.chain.append(item);
  }

  function render(): void {
    if (!baseline) return;
    const t = playback.t;
    const a = stateAt(baseline, t);
    const b = comparison ? stateAt(comparison.intervention_world, t) : a;
    const i = comparison?.intervention ?? null;
    const diverged = comparison ? divergedAt(baseline, comparison.intervention_world, t, model.divergence_threshold) : [];
    const highlights = el.highlights.checked;

    if (view === "explore") {
      worldA.resize();
      worldB.resize();
      worldA.draw(a, { clock: ambient, pulse: null });
      const pulsing = i && highlights && t >= i.start && t < i.start + PULSE_STEPS;
      worldB.draw(b, { clock: ambient, pulse: pulsing ? i.variable : null });
    }

    el.play.textContent = playback.playing ? "Pause" : "Start";
    el.scrub.value = String(Math.round(t));
    el.clock.textContent = `Day ${Math.round(t)} / ${playback.last}`;
    for (const v of VARS) {
      const node = chainItems.get(v)!;
      node.a.textContent = `A ${pct(a[v])}`;
      node.b.textContent = `B ${pct(b[v])}`;
      node.delta.textContent = comparison ? signed((b[v] - a[v]) * 100, 0) : "";
      node.item.classList.toggle("diverged", highlights && diverged.includes(v));
      node.item.classList.toggle("do", i?.variable === v && t >= i.start);
    }
    if (!i) {
      el.status.textContent = "Both worlds are identical. Choose an intervention and run a comparison.";
    } else if (t < i.start) {
      el.status.textContent = `The worlds are still identical. do(${i.variable} = ${i.value}) begins on day ${i.start}.`;
    } else {
      const changed = diverged.filter((v) => v !== i.variable).map((v) => LABELS[v]);
      el.status.textContent = `do(${i.variable} = ${i.value}) is active in World B. Changed so far: ${changed.length ? changed.join(" → ") : "nothing yet"}.`;
    }
    graph.update({ a, b, intervention: i, diverged, highlights });
  }

  function showRun(): void {
    if (!baseline) return;
    const i = comparison?.intervention;
    el.captionA.textContent = `no intervention · seed ${seed}`;
    el.captionB.textContent = i ? `do(${i.variable} = ${i.value}) from day ${i.start}` : "no intervention yet";
    el.marker.hidden = !i;
    if (i) el.marker.style.left = `${(i.start / playback.last) * 100}%`;
    renderRun(byId("evidence-run"), baseline, comparison);
    render();
  }

  async function observe(): Promise<void> {
    const request = ++latestRequest;
    const response = await api.simulate(el.scenario.value, seed, STEPS);
    if (request !== latestRequest) return;
    baseline = response.series;
    comparison = null;
    playback.reset();
    showRun();
  }

  async function compare(): Promise<void> {
    const intervention = { variable: preset().variable, value: Number(el.value.value), start: DO_START };
    const request = ++latestRequest;
    const response = await api.intervene(el.scenario.value, seed, STEPS, intervention);
    if (request !== latestRequest) return;
    comparison = response;
    baseline = response.baseline;
    playback.replay();
    showRun();
  }

  function show(next: ViewId): void {
    view = next;
    for (const id of ["explore", "graph", "evidence"] as ViewId[]) {
      byId(`view-${id}`).hidden = id !== next;
      byId(`tab-${id}`).setAttribute("aria-selected", String(id === next));
    }
    if (next === "evidence" && !experimentsRequested) {
      experimentsRequested = true;
      el.experiments.replaceChildren(h("p", { class: "muted" }, "Running the research experiments…"));
      api.experiments().then((results) => renderExperiments(el.experiments, results)).catch((error) => {
        experimentsRequested = false;
        fail(error);
      });
    }
    render();
  }

  const syncValue = (): void => {
    el.valueOut.textContent = `${preset().variable} = ${Number(el.value.value).toFixed(2)}`;
  };

  el.scenario.addEventListener("change", guard(observe));
  byId("btn-new").addEventListener("click", guard(async () => {
    seed = Math.floor(Math.random() * 1_000_000);
    await observe();
  }));
  el.intervention.addEventListener("change", () => {
    el.value.value = String(preset().value);
    syncValue();
  });
  el.value.addEventListener("input", syncValue);
  byId("btn-run").addEventListener("click", guard(compare));
  el.play.addEventListener("click", () => {
    if (playback.playing) playback.pause();
    else playback.play();
    render();
  });
  byId("btn-reset").addEventListener("click", () => {
    playback.reset();
    ambient = 0;
    render();
  });
  byId("btn-replay").addEventListener("click", () => {
    playback.replay();
    render();
  });
  el.scrub.addEventListener("input", () => {
    playback.seek(Number(el.scrub.value));
    render();
  });
  el.highlights.addEventListener("change", render);
  byId("btn-graph").addEventListener("click", () => show("graph"));
  for (const id of ["explore", "graph", "evidence"] as ViewId[]) byId(`tab-${id}`).addEventListener("click", () => show(id));
  if (typeof window.addEventListener === "function") window.addEventListener("resize", render);

  el.value.value = String(preset().value);
  el.scrub.max = String(playback.last);
  syncValue();
  await observe();
  // Until now the control area is inert (see style.css), so nothing can be clicked half-initialised.
  document.body.dataset.ready = "true";

  return {
    advance(dtMs) {
      if (!playback.playing) return;
      playback.tick(dtMs);
      if (!reducedMotion) ambient += dtMs / 1000;
      render();
    },
  };
}
