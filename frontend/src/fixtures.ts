// Test fixtures shaped like real backend responses.
import { VARS } from "./playback";
import type { Api, Experiments, InterveneResponse, Metric, Model, Scenario, Series, VarId } from "./types";

export const STEPS = 240;
const flat = (value: number): number[] => Array.from({ length: STEPS }, () => value);
export const flatSeries = (value: number): Series => Object.fromEntries(VARS.map((v) => [v, flat(value)])) as Series;

const DESC: Record<VarId, VarId[]> = {
  sunlight: ["rainfall", "water", "vegetation", "food", "creatures", "health"],
  rainfall: ["water", "vegetation", "food", "creatures", "health"],
  water: ["vegetation", "food", "creatures", "health"],
  vegetation: ["food", "creatures", "health"],
  food: ["creatures", "health"],
  creatures: ["food", "health"],
  health: [],
};

export const model: Model = {
  variables: VARS.map((id) => ({
    id,
    description: `${id} description`,
    equation: `${id}[t] = f(...)`,
    parents: id === "rainfall" ? [{ id: "sunlight", lag: 0 }] : [],
    descendants: DESC[id],
    intervenable: id !== "health",
  })),
  edges: [
    { source: "sunlight", target: "rainfall", lag: 0 },
    { source: "sunlight", target: "vegetation", lag: 0 },
    { source: "rainfall", target: "water", lag: 0 },
    { source: "water", target: "vegetation", lag: 0 },
    { source: "vegetation", target: "food", lag: 0 },
    { source: "food", target: "creatures", lag: 0 },
    { source: "water", target: "health", lag: 0 },
    { source: "vegetation", target: "health", lag: 0 },
    { source: "creatures", target: "health", lag: 0 },
    { source: "water", target: "water", lag: 1 },
    { source: "vegetation", target: "vegetation", lag: 1 },
    { source: "food", target: "food", lag: 1 },
    { source: "creatures", target: "creatures", lag: 1 },
    { source: "creatures", target: "food", lag: 1 },
  ],
  evaluation_order: VARS,
  interventions: [
    { id: "more-rain", label: "Increase rainfall", variable: "rainfall", value: 0.85 },
    { id: "less-food", label: "Decrease available food", variable: "food", value: 0.1 },
  ],
  limits: { min_steps: 60, max_steps: 720, max_seed: 2147483647, value_min: 0, value_max: 1 },
  divergence_threshold: 0.02,
};

export const scenarios: Scenario[] = [
  { id: "temperate", name: "Temperate valley", description: "Balanced", params: {} },
  { id: "arid", name: "Arid basin", description: "Dry", params: {} },
];

/** World B: the target jumps at `start`; water follows 10 days later; nothing else moves. */
export function comparison(variable: VarId, value: number, start: number, seed: number, scenario: string): InterveneResponse {
  const baseline = flatSeries(0.5);
  const world = flatSeries(0.5);
  world.water = world.water.map((x, t) => (t >= start + 10 ? 0.8 : x));
  world[variable] = world[variable].map((x, t) => (t >= start ? value : x));
  const metrics = Object.fromEntries(VARS.map((v) => {
    const diff = world[v][STEPS - 1] - baseline[v][STEPS - 1];
    const metric: Metric = {
      final_baseline: 0.5,
      final_intervention: world[v][STEPS - 1],
      final_diff: diff,
      mean_diff: diff,
      max_abs_diff: Math.abs(diff),
      relative_effect: diff / 0.5,
      steps_to_divergence: diff ? 0 : null,
    };
    return [v, metric];
  })) as Record<VarId, Metric>;
  return { scenario, seed, steps: STEPS, intervention: { variable, value, start }, affected: DESC[variable], baseline, intervention_world: world, metrics };
}

export const experiments: Experiments = {
  A: { seed: 42, steps: 240, intervention: { variable: "rainfall", value: 0.85, start: 60 }, metrics: comparison("rainfall", 0.85, 60, 42, "temperate").metrics },
  B: {
    divergence_threshold: 0.02,
    all_match_graph: true,
    interventions: [{
      intervention: { variable: "rainfall", value: 0.85, start: 60 },
      expected_descendants: DESC.rainfall,
      changed_variables: DESC.rainfall,
      matches_graph: true,
      steps_to_divergence: { sunlight: null, rainfall: 0, water: 0, vegetation: 4, food: 8, creatures: 14, health: 1 },
    }],
  },
  C: {
    n_worlds: 3,
    observational: { correlation_rain_vegetation: -0.885, slope: -0.857, intercept: 0.87 },
    interventional: { rain_levels: [0.2, 0.5, 0.8], mean_vegetation: [0.18, 0.44, 0.71], slope: 0.883, intercept: 0 },
    adjusted_for_sunlight: { slope: 0.699 },
    points: { rainfall: [0.4, 0.5, 0.6], vegetation: [0.5, 0.44, 0.36] },
  },
  D: {
    seeds: [1, 2, 3],
    mean_effect: 0.2215,
    sd_effect: 0.0086,
    ci95: [0.2183, 0.2248],
    ci_method: "Student-t interval",
    unpaired_sd_effect: 0.0317,
    identical_seed_max_abs_diff: 0,
    per_seed: [{ seed: 1, effect: 0.21 }, { seed: 2, effect: 0.22 }, { seed: 3, effect: 0.23 }],
  },
};

/** Fake backend that records every call. */
export function fakeApi(): Api & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    model: async () => model,
    scenarios: async () => scenarios,
    simulate: async (scenario, seed, steps) => {
      calls.push(["simulate", scenario, seed, steps]);
      return { scenario, seed, steps, series: flatSeries(0.5) };
    },
    intervene: async (scenario, seed, steps, intervention) => {
      calls.push(["intervene", scenario, seed, steps, intervention]);
      return comparison(intervention.variable, intervention.value, intervention.start, seed, scenario);
    },
    experiments: async () => {
      calls.push(["experiments"]);
      return experiments;
    },
  };
}
