import { beforeEach, describe, expect, it } from "vitest";
import { model } from "./fixtures";
import { createGraph, cutEdges } from "./graph";
import type { VarId, WorldState } from "./types";

const state = (value: number): WorldState => Object.fromEntries(model.variables.map((v) => [v.id, value])) as WorldState;
const attr = (name: string) => (node: Element): string | null => node.getAttribute(name);

let container: HTMLElement;
let info: HTMLElement;

beforeEach(() => {
  container = document.createElement("div");
  info = document.createElement("div");
  document.body.replaceChildren(container, info);
});

describe("causal graph", () => {
  it("draws exactly the variables and arrows supplied by the backend", () => {
    createGraph(container, info, model);
    expect(container.querySelectorAll(".node")).toHaveLength(model.variables.length);
    const drawn = [...container.querySelectorAll(".edge")].map((e) => `${attr("data-source")(e)}>${attr("data-target")(e)}@${attr("data-lag")(e)}`);
    expect(drawn.sort()).toEqual(model.edges.map((e) => `${e.source}>${e.target}@${e.lag}`).sort());
    expect(container.querySelectorAll(".edge.lagged")).toHaveLength(model.edges.filter((e) => e.lag === 1).length);
  });

  it("an intervention cuts only the arrows into its target", () => {
    expect(cutEdges(model.edges, null)).toEqual([]);
    expect(cutEdges(model.edges, "rainfall").map((e) => e.source)).toEqual(["sunlight"]);
    expect(cutEdges(model.edges, "vegetation").map((e) => e.source).sort()).toEqual(["sunlight", "vegetation", "water"]);

    const graph = createGraph(container, info, model);
    graph.update({ a: state(0.5), b: state(0.8), intervention: { variable: "rainfall", value: 0.85, start: 60 }, diverged: ["rainfall", "water"], highlights: true });
    const cut = [...container.querySelectorAll(".edge.cut")];
    expect(cut).toHaveLength(1);
    expect(cut[0].getAttribute("data-target")).toBe("rainfall");
    expect(container.querySelector('.node[data-var="rainfall"]')!.classList.contains("do")).toBe(true);
    expect(container.querySelector('.node[data-var="rainfall"] .node-badge')!.textContent).toBe("do(rainfall = 0.85)");
  });

  it("lights up the variables that currently differ, unless highlights are off", () => {
    const graph = createGraph(container, info, model);
    const base = { a: state(0.5), b: state(0.8), intervention: { variable: "rainfall" as VarId, value: 0.85, start: 60 }, diverged: ["rainfall", "water"] as VarId[] };
    const lit = (): (string | null)[] => [...container.querySelectorAll(".node.lit")].map(attr("data-var"));
    graph.update({ ...base, highlights: true });
    expect(lit()).toEqual(["rainfall", "water"]);
    expect(container.querySelector(".edge.active")!.getAttribute("data-target")).toBe("water");
    expect(container.querySelector('.node[data-var="water"] .node-values')!.textContent).toBe("A 50% · B 80%");
    graph.update({ ...base, highlights: false });
    expect(lit()).toEqual([]);
  });

  it("selecting a variable shows its equation, causes and descendants", () => {
    const graph = createGraph(container, info, model);
    expect(info.textContent).toContain("How the world works");
    graph.select("rainfall");
    expect(info.querySelector(".equation")!.textContent).toBe("rainfall[t] = f(...)");
    expect(info.querySelector('[data-testid="parents"]')!.textContent).toBe("Sunlight");
    expect(info.querySelector('[data-testid="descendants"]')!.textContent).toBe("Water, Vegetation, Food, Creatures, Health");
    expect([...container.querySelectorAll(".node.downstream")].map(attr("data-var"))).toEqual(["water", "vegetation", "food", "creatures", "health"]);
    graph.select("rainfall");
    expect(container.querySelectorAll(".node.selected")).toHaveLength(0);
  });

  it("nodes are selectable by click", () => {
    createGraph(container, info, model);
    container.querySelector('.node[data-var="health"]')!.dispatchEvent(new Event("click"));
    expect(info.textContent).toContain("Nothing. No arrows leave this variable.");
  });
});
