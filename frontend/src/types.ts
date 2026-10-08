export type VarId = "sunlight" | "rainfall" | "water" | "vegetation" | "food" | "creatures" | "health";
export type Series = Record<VarId, number[]>;
export type WorldState = Record<VarId, number>;

export interface Edge {
  source: VarId;
  target: VarId;
  lag: number;
}

export interface VariableInfo {
  id: VarId;
  description: string;
  equation: string;
  parents: { id: VarId; lag: number }[];
  descendants: VarId[];
  intervenable: boolean;
}

export interface InterventionPreset {
  id: string;
  label: string;
  variable: VarId;
  value: number;
}

export interface Model {
  variables: VariableInfo[];
  edges: Edge[];
  evaluation_order: VarId[];
  interventions: InterventionPreset[];
  limits: { min_steps: number; max_steps: number; max_seed: number; value_min: number; value_max: number };
  divergence_threshold: number;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  params: Record<string, number>;
}

export interface Intervention {
  variable: VarId;
  value: number;
  start: number;
  end?: number | null;
}

export interface Metric {
  final_baseline: number;
  final_intervention: number;
  final_diff: number;
  mean_diff: number;
  max_abs_diff: number;
  relative_effect: number | null;
  steps_to_divergence: number | null;
}

export interface SimulateResponse {
  scenario: string;
  seed: number;
  steps: number;
  series: Series;
}

export interface InterveneResponse {
  scenario: string;
  seed: number;
  steps: number;
  intervention: Intervention;
  affected: VarId[];
  baseline: Series;
  intervention_world: Series;
  metrics: Record<VarId, Metric>;
}

export interface Experiments {
  A: { seed: number; steps: number; intervention: Intervention; metrics: Record<VarId, Metric> };
  B: {
    divergence_threshold: number;
    all_match_graph: boolean;
    interventions: {
      intervention: Intervention;
      expected_descendants: VarId[];
      changed_variables: VarId[];
      matches_graph: boolean;
      steps_to_divergence: Record<VarId, number | null>;
    }[];
  };
  C: {
    n_worlds: number;
    observational: { correlation_rain_vegetation: number; slope: number; intercept: number };
    interventional: { rain_levels: number[]; mean_vegetation: number[]; slope: number; intercept: number };
    adjusted_for_sunlight: { slope: number };
    points: { rainfall: number[]; vegetation: number[] };
  };
  D: {
    seeds: number[];
    mean_effect: number;
    sd_effect: number;
    ci95: [number, number];
    ci_method: string;
    unpaired_sd_effect: number;
    identical_seed_max_abs_diff: number;
    per_seed: { seed: number; effect: number }[];
  };
}

export interface Api {
  model(): Promise<Model>;
  scenarios(): Promise<Scenario[]>;
  simulate(scenario: string, seed: number, steps: number): Promise<SimulateResponse>;
  intervene(scenario: string, seed: number, steps: number, intervention: Intervention): Promise<InterveneResponse>;
  experiments(): Promise<Experiments>;
}
