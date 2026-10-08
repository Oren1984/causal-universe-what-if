import type { Series, VarId, WorldState } from "./types";

export const VARS: VarId[] = ["sunlight", "rainfall", "water", "vegetation", "food", "creatures", "health"];

export const LABELS: Record<VarId, string> = {
  sunlight: "Sunlight",
  rainfall: "Rainfall",
  water: "Water",
  vegetation: "Vegetation",
  food: "Food",
  creatures: "Creatures",
  health: "Health",
};

/** The shared simulation clock both worlds are drawn from. */
export class Playback {
  t = 0;
  playing = false;

  constructor(public steps: number, public stepsPerSecond = 12) {}

  get last(): number {
    return this.steps - 1;
  }

  get finished(): boolean {
    return this.t >= this.last;
  }

  play(): void {
    if (this.finished) this.t = 0;
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
  }

  reset(): void {
    this.t = 0;
    this.playing = false;
  }

  replay(): void {
    this.t = 0;
    this.playing = true;
  }

  seek(t: number): void {
    this.t = Math.min(this.last, Math.max(0, t));
  }

  /** Advance by elapsed wall time. Stops at the last step. */
  tick(dtMs: number): void {
    if (!this.playing) return;
    this.t += (dtMs / 1000) * this.stepsPerSecond;
    if (this.finished) {
      this.t = this.last;
      this.playing = false;
    }
  }
}

/** Linear interpolation between backend samples, for smooth drawing only. */
export function sample(values: number[], t: number): number {
  const clamped = Math.min(values.length - 1, Math.max(0, t));
  const i = Math.floor(clamped);
  const next = Math.min(values.length - 1, i + 1);
  return values[i] + (values[next] - values[i]) * (clamped - i);
}

export function stateAt(series: Series, t: number): WorldState {
  return Object.fromEntries(VARS.map((v) => [v, sample(series[v], t)])) as WorldState;
}

/** Variables whose two worlds currently differ by more than the threshold. */
export function divergedAt(a: Series, b: Series, t: number, threshold: number): VarId[] {
  return VARS.filter((v) => Math.abs(sample(b[v], t) - sample(a[v], t)) > threshold);
}

export const pct = (x: number): string => `${Math.round(x * 100)}%`;
export const signed = (x: number, digits = 3): string => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(digits)}`;
export const signedPct = (x: number | null): string => (x === null ? "n/a" : `${signed(x * 100, 1)}%`);
