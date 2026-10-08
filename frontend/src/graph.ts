import { h, s } from "./dom";
import { LABELS, pct } from "./playback";
import type { Edge, Intervention, Model, VarId, WorldState } from "./types";

// Presentation only: where each node sits. The arrows come from the backend.
const POSITION: Record<VarId, [number, number]> = {
  sunlight: [220, 70],
  health: [700, 70],
  rainfall: [90, 250],
  water: [280, 250],
  vegetation: [470, 250],
  food: [660, 250],
  creatures: [850, 250],
};
const HALF_W = 70;
const HALF_H = 32;

export interface GraphState {
  a: WorldState;
  b: WorldState;
  intervention: Intervention | null;
  diverged: VarId[];
  highlights: boolean;
}

export interface GraphView {
  update(state: GraphState): void;
  select(id: VarId): void;
}

/** Arrows removed by do(target): everything that points into the target. */
export function cutEdges(edges: Edge[], target: VarId | null): Edge[] {
  return target ? edges.filter((e) => e.target === target) : [];
}

export const edgeKey = (e: Edge): string => `${e.source}>${e.target}@${e.lag}`;

function borderPoint(from: [number, number], to: [number, number], gap: number): [number, number] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const scale = Math.min(HALF_W / Math.abs(dx || 1e-9), HALF_H / Math.abs(dy || 1e-9));
  const length = Math.hypot(dx, dy);
  return [from[0] + dx * scale + (dx / length) * gap, from[1] + dy * scale + (dy / length) * gap];
}

function edgePath(e: Edge): string {
  const [x1, y1] = POSITION[e.source];
  const [x2, y2] = POSITION[e.target];
  if (e.source === e.target) {
    // Memory of the previous step: a small loop under the node.
    return `M ${x1 - 26} ${y1 + HALF_H + 2} C ${x1 - 44} ${y1 + 86}, ${x1 + 44} ${y1 + 86}, ${x1 + 26} ${y1 + HALF_H + 8}`;
  }
  if (e.lag > 0) {
    // Lagged feedback between two nodes: swing below the main chain.
    return `M ${x1 - 44} ${y1 + HALF_H + 2} C ${x1 - 60} ${y1 + 150}, ${x2 + 60} ${y2 + 150}, ${x2 + 46} ${y2 + HALF_H + 8}`;
  }
  const [sx, sy] = borderPoint([x1, y1], [x2, y2], 2);
  const [tx, ty] = borderPoint([x2, y2], [x1, y1], 8);
  return `M ${sx} ${sy} L ${tx} ${ty}`;
}

export function createGraph(container: HTMLElement, info: HTMLElement, model: Model): GraphView {
  const variables = new Map(model.variables.map((v) => [v.id, v]));
  let selected: VarId | null = null;
  let current: GraphState | null = null;

  const svg = s("svg", { viewBox: "0 0 940 420", role: "group", "aria-label": "Causal graph of the ecosystem model" });
  svg.append(
    s("defs", {}, s("marker", { id: "arrow", viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" },
      s("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: "context-stroke" }))),
  );
  const edgeNodes = new Map<string, SVGElement>();
  for (const e of model.edges) {
    const path = s("path", {
      class: `edge${e.lag ? " lagged" : ""}`,
      d: edgePath(e),
      "marker-end": "url(#arrow)",
      "data-source": e.source,
      "data-target": e.target,
      "data-lag": e.lag,
    });
    edgeNodes.set(edgeKey(e), path);
    svg.append(path);
  }
  const nodeNodes = new Map<VarId, { group: SVGElement; values: SVGElement; badge: SVGElement }>();
  for (const v of model.variables) {
    const [x, y] = POSITION[v.id];
    const values = s("text", { class: "node-values", x, y: y + 16, "text-anchor": "middle" });
    const badge = s("text", { class: "node-badge", x, y: y - HALF_H - 8, "text-anchor": "middle" });
    const group = s("g", { class: "node", "data-var": v.id, tabindex: 0, role: "button", "aria-label": `${LABELS[v.id]}: show details` },
      s("rect", { x: x - HALF_W, y: y - HALF_H, width: HALF_W * 2, height: HALF_H * 2, rx: 12 }),
      s("text", { class: "node-name", x, y: y - 6, "text-anchor": "middle" }, LABELS[v.id]),
      values,
      badge,
    );
    group.addEventListener("click", () => view.select(v.id));
    group.addEventListener("keydown", (event) => {
      const key = (event as KeyboardEvent).key;
      if (key === "Enter" || key === " ") {
        event.preventDefault();
        view.select(v.id);
      }
    });
    nodeNodes.set(v.id, { group, values, badge });
    svg.append(group);
  }
  container.replaceChildren(
    svg,
    h("ul", { class: "graph-legend" },
      h("li", {}, h("span", { class: "key solid" }), "effect within the same step"),
      h("li", {}, h("span", { class: "key dashed" }), "effect carried from the previous step"),
      h("li", {}, h("span", { class: "key cut" }), "arrow removed by the intervention"),
      h("li", {}, h("span", { class: "key lit" }), "currently differs between the worlds"),
    ),
  );

  function renderInfo(): void {
    if (!selected) {
      info.replaceChildren(
        h("h2", {}, "How the world works"),
        h("p", {}, "Each box is a variable. Each arrow means the variable at its tail is an input to the equation of the variable at its head."),
        h("p", {}, "Select a variable to see its equation and everything downstream of it."),
        h("p", { class: "muted" }, `Evaluation order within a step: ${model.evaluation_order.map((v) => LABELS[v]).join(" → ")}.`),
      );
      return;
    }
    const v = variables.get(selected)!;
    const active = current?.intervention?.variable === selected ? current.intervention : null;
    const parts = [
      h("h2", {}, LABELS[v.id]),
      h("p", {}, v.description),
      h("h3", {}, "Structural equation"),
      h("code", { class: "equation" }, v.equation),
      h("h3", {}, "Direct causes"),
      h("p", { "data-testid": "parents" }, v.parents.length
        ? v.parents.map((p) => `${LABELS[p.id]}${p.lag ? " (previous step)" : ""}`).join(", ")
        : "None inside the model. Driven by the season and random weather."),
      h("h3", {}, "An intervention here can change"),
      h("p", { "data-testid": "descendants" }, v.descendants.length ? v.descendants.map((d) => LABELS[d]).join(", ") : "Nothing. No arrows leave this variable."),
      active && h("p", { class: "do-note" }, `Right now World B replaces this equation with do(${v.id} = ${active.value}). The arrows into it are cut.`),
      !v.intervenable && h("p", { class: "muted" }, "This is a summary index, so it is not offered as an intervention target."),
    ];
    info.replaceChildren(...parts.filter((part): part is HTMLElement => Boolean(part)));
  }

  const view: GraphView = {
    select(id) {
      selected = selected === id ? null : id;
      const downstream = selected ? variables.get(selected)!.descendants : [];
      for (const [id2, node] of nodeNodes) {
        node.group.classList.toggle("selected", id2 === selected);
        node.group.classList.toggle("downstream", downstream.includes(id2));
      }
      renderInfo();
    },
    update(state) {
      const interventionChanged = current?.intervention !== state.intervention;
      current = state;
      const target = state.intervention?.variable ?? null;
      const cut = new Set(cutEdges(model.edges, target).map(edgeKey));
      const lit = new Set<VarId>(state.highlights ? state.diverged : []);
      for (const e of model.edges) {
        const node = edgeNodes.get(edgeKey(e))!;
        const isCut = cut.has(edgeKey(e));
        node.classList.toggle("cut", isCut);
        node.classList.toggle("active", !isCut && lit.has(e.source) && lit.has(e.target) && e.source !== e.target);
      }
      for (const [id, node] of nodeNodes) {
        node.group.classList.toggle("do", id === target);
        node.group.classList.toggle("lit", lit.has(id));
        node.values.textContent = target ? `A ${pct(state.a[id])} · B ${pct(state.b[id])}` : pct(state.a[id]);
        node.badge.textContent = id === target ? `do(${id} = ${state.intervention!.value})` : "";
      }
      if (interventionChanged) renderInfo();
    },
  };
  renderInfo();
  return view;
}
