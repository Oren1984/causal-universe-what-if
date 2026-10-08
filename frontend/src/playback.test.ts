import { describe, expect, it } from "vitest";
import { flatSeries } from "./fixtures";
import { Playback, divergedAt, pct, sample, signed, signedPct, stateAt } from "./playback";

describe("Playback", () => {
  it("starts paused at day 0 and advances at the configured rate", () => {
    const p = new Playback(240, 12);
    p.tick(1000);
    expect(p.t).toBe(0);
    p.play();
    p.tick(500);
    expect(p.t).toBeCloseTo(6);
  });

  it("stops on the last step", () => {
    const p = new Playback(10, 12);
    p.play();
    p.tick(5000);
    expect(p.t).toBe(9);
    expect(p.playing).toBe(false);
    expect(p.finished).toBe(true);
  });

  it("pause holds the clock, reset rewinds and stops, replay rewinds and runs", () => {
    const p = new Playback(240);
    p.play();
    p.tick(1000);
    p.pause();
    p.tick(1000);
    expect(p.t).toBeCloseTo(12);
    p.reset();
    expect([p.t, p.playing]).toEqual([0, false]);
    p.seek(100);
    p.replay();
    expect([p.t, p.playing]).toEqual([0, true]);
  });

  it("play after the end restarts from day 0, and seek is clamped", () => {
    const p = new Playback(10);
    p.seek(99);
    expect(p.t).toBe(9);
    p.play();
    expect(p.t).toBe(0);
    p.seek(-5);
    expect(p.t).toBe(0);
  });
});

describe("sampling", () => {
  it("interpolates between backend samples and clamps at the ends", () => {
    expect(sample([0, 1, 3], 0.5)).toBeCloseTo(0.5);
    expect(sample([0, 1, 3], 1.25)).toBeCloseTo(1.5);
    expect(sample([0, 1, 3], 2)).toBe(3);
    expect(sample([0, 1, 3], 7)).toBe(3);
    expect(sample([0, 1, 3], -1)).toBe(0);
  });

  it("reads every variable at the same instant", () => {
    const state = stateAt(flatSeries(0.4), 17.5);
    expect(Object.keys(state)).toHaveLength(7);
    expect(state.creatures).toBeCloseTo(0.4);
  });

  it("reports which variables differ by more than the threshold", () => {
    const a = flatSeries(0.5);
    const b = flatSeries(0.5);
    b.water = b.water.map((x, t) => (t >= 100 ? 0.6 : x));
    b.food = b.food.map((x) => x + 0.01);
    expect(divergedAt(a, b, 50, 0.02)).toEqual([]);
    expect(divergedAt(a, b, 150, 0.02)).toEqual(["water"]);
  });
});

describe("formatting", () => {
  it("formats numbers for display", () => {
    expect(pct(0.456)).toBe("46%");
    expect(signed(0.2215)).toBe("+0.222");
    expect(signed(-0.5, 1)).toBe("−0.5");
    expect(signed(0)).toBe("0.000");
    expect(signedPct(0.405)).toBe("+40.5%");
    expect(signedPct(null)).toBe("n/a");
  });
});
