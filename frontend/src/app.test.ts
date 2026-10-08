import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { start, type App } from "./app";
import { fakeApi } from "./fixtures";

const html = readFileSync("index.html", "utf-8");
const body = html.slice(html.indexOf("<body>") + 6, html.indexOf("<script"));
const $ = <T extends HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
const click = (selector: string): void => $(selector).click();
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const chainClass = (v: string): DOMTokenList => $(`#chain li[data-var="${v}"]`).classList;
const seek = (day: number): void => {
  $<HTMLInputElement>("#scrub").value = String(day);
  $("#scrub").dispatchEvent(new Event("input"));
};

let api: ReturnType<typeof fakeApi>;
let app: App;

beforeEach(async () => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  document.body.innerHTML = body;
  api = fakeApi();
  app = await start(api);
});

describe("controls", () => {
  it("loads an observed world and fills the selectors from the backend", () => {
    expect(api.calls).toEqual([["simulate", "temperate", 42, 240]]);
    expect([...$<HTMLSelectElement>("#scenario").options].map((o) => o.text)).toEqual(["Temperate valley", "Arid basin"]);
    expect($<HTMLSelectElement>("#intervention").options).toHaveLength(2);
    expect($("#status").textContent).toContain("Both worlds are identical");
    expect($("#caption-b").textContent).toBe("no intervention yet");
    expect($("#do-marker").hidden).toBe(true);
    expect(document.body.dataset.ready).toBe("true");
  });

  it("start, pause, reset and replay drive one shared clock", () => {
    click("#btn-play");
    expect($("#btn-play").textContent).toBe("Pause");
    app.advance(1000);
    expect($("#clock").textContent).toBe("Day 12 / 239");
    click("#btn-play");
    app.advance(1000);
    expect($("#clock").textContent).toBe("Day 12 / 239");
    click("#btn-replay");
    app.advance(500);
    expect($("#clock").textContent).toBe("Day 6 / 239");
    click("#btn-reset");
    expect($("#clock").textContent).toBe("Day 0 / 239");
    expect($("#btn-play").textContent).toBe("Start");
  });

  it("changing the scenario re-observes it, and New scenario draws a new seed", async () => {
    const select = $<HTMLSelectElement>("#scenario");
    select.value = "arid";
    select.dispatchEvent(new Event("change"));
    await flush();
    expect(api.calls.at(-1)).toEqual(["simulate", "arid", 42, 240]);
    click("#btn-new");
    await flush();
    const last = api.calls.at(-1)!;
    expect(last.slice(0, 2)).toEqual(["simulate", "arid"]);
    expect($("#caption-a").textContent).toBe(`no intervention · seed ${last[2]}`);
  });

  it("the preset sets the slider, and the slider sets the intervention value", async () => {
    const preset = $<HTMLSelectElement>("#intervention");
    const slider = $<HTMLInputElement>("#value");
    expect($("#value-out").textContent).toBe("rainfall = 0.85");
    preset.value = "less-food";
    preset.dispatchEvent(new Event("change"));
    expect(slider.value).toBe("0.1");
    slider.value = "0.3";
    slider.dispatchEvent(new Event("input"));
    expect($("#value-out").textContent).toBe("food = 0.30");
    click("#btn-run");
    await flush();
    expect(api.calls.at(-1)).toEqual(["intervene", "temperate", 42, 240, { variable: "food", value: 0.3, start: 60 }]);
  });
});

describe("startup", () => {
  /** An app whose first load stays pending until `release()` is called. */
  async function slowStart(): Promise<{ release: () => void; starting: Promise<App>; errors: unknown[] }> {
    document.body.innerHTML = body;
    const slow = fakeApi();
    let release = (): void => {};
    const simulate = slow.simulate;
    let first = true;
    slow.simulate = async (...args) => {
      if (first) {
        first = false;
        await new Promise<void>((resolve) => (release = resolve));
      }
      return simulate(...args);
    };
    const errors: unknown[] = [];
    window.addEventListener("error", (event) => void errors.push(event.error), { once: true });
    delete document.body.dataset.ready;
    const starting = start(slow);
    await flush();
    expect(document.body.dataset.ready).toBeUndefined();
    return { release: () => release(), starting, errors };
  }

  it("tolerates resize and control events before the first world has loaded", async () => {
    const { release, starting, errors } = await slowStart();
    window.dispatchEvent(new Event("resize"));
    click("#tab-graph");
    click("#btn-play");
    seek(30);
    release();
    await starting;
    expect(errors).toEqual([]);
    expect($("#clock").textContent).toBe("Day 0 / 239");
  });

  it("controls work during the first load, and a late response cannot undo a newer one", async () => {
    const { release, starting } = await slowStart();
    const preset = $<HTMLSelectElement>("#intervention");
    preset.value = "less-food";
    preset.dispatchEvent(new Event("change"));
    expect($("#value-out").textContent).toBe("food = 0.10");
    click("#btn-run");
    await flush();
    expect($("#caption-b").textContent).toBe("do(food = 0.1) from day 60");
    release(); // the initial observation arrives after the comparison
    await starting;
    await flush();
    expect($("#caption-b").textContent).toBe("do(food = 0.1) from day 60");
    expect(document.querySelector('[data-testid="metrics-table"]')).not.toBeNull();
  });
});

describe("comparison", () => {
  beforeEach(async () => {
    click("#btn-run");
    await flush();
  });

  it("starts both worlds from day 0 and marks the intervention", () => {
    expect($("#btn-play").textContent).toBe("Pause");
    expect($("#caption-b").textContent).toBe("do(rainfall = 0.85) from day 60");
    expect($("#do-marker").hidden).toBe(false);
    expect($("#status").textContent).toContain("still identical");
  });

  it("the chain lights up only when the backend series actually diverge", () => {
    seek(59);
    expect(document.querySelectorAll("#chain li.diverged")).toHaveLength(0);
    seek(62);
    expect(chainClass("rainfall").contains("diverged")).toBe(true);
    expect(chainClass("rainfall").contains("do")).toBe(true);
    expect(chainClass("water").contains("diverged")).toBe(false);
    expect($('#chain li[data-var="rainfall"] .b').textContent).toBe("B 85%");
    expect($('#chain li[data-var="rainfall"] .delta').textContent).toBe("+35");
    seek(75);
    expect(chainClass("water").contains("diverged")).toBe(true);
    expect(chainClass("food").contains("diverged")).toBe(false);
    expect($("#status").textContent).toContain("Changed so far: Water.");
  });

  it("the highlight toggle switches the causal highlights off", () => {
    seek(100);
    expect(document.querySelectorAll("#chain li.diverged")).toHaveLength(2);
    click("#highlights");
    expect(document.querySelectorAll("#chain li.diverged")).toHaveLength(0);
  });

  it("the evidence table shows the backend metrics unchanged", () => {
    expect($('[data-testid="final-diff-rainfall"]').textContent).toBe("+0.350");
    expect($('[data-testid="final-diff-water"]').textContent).toBe("+0.300");
    expect($('[data-testid="final-diff-food"]').textContent).toBe("0.000");
    expect($('[data-testid="run-summary"]').textContent).toContain("do(rainfall = 0.85) from day 60, seed 42");
  });

  it("a new scenario clears the comparison", async () => {
    click("#btn-new");
    await flush();
    expect($("#caption-b").textContent).toBe("no intervention yet");
    expect(document.querySelector('[data-testid="metrics-table"]')).toBeNull();
    expect(document.querySelector('[data-testid="no-comparison"]')).not.toBeNull();
  });
});

describe("views", () => {
  it("tabs and the graph button switch views", () => {
    click("#btn-graph");
    expect($("#view-graph").hidden).toBe(false);
    expect($("#view-explore").hidden).toBe(true);
    expect($("#tab-graph").getAttribute("aria-selected")).toBe("true");
    click("#tab-explore");
    expect($("#view-explore").hidden).toBe(false);
  });

  it("the evidence view requests the experiments once and shows their numbers", async () => {
    click("#tab-evidence");
    await flush();
    click("#tab-explore");
    click("#tab-evidence");
    await flush();
    expect(api.calls.filter((c) => c[0] === "experiments")).toHaveLength(1);
    expect($('[data-testid="obs-slope"] strong').textContent).toBe("−0.86");
    expect($('[data-testid="do-slope"] strong').textContent).toBe("+0.88");
    expect($('[data-testid="mean-effect"] strong').textContent).toBe("+0.222");
    expect($('[data-testid="experiment-b"] td.ok').textContent).toBe("✓ yes");
  });

  it("a failing backend call is reported instead of being swallowed", async () => {
    api.intervene = async () => {
      throw new Error("boom");
    };
    click("#btn-run");
    await flush();
    expect($("#error").hidden).toBe(false);
    expect($("#error").textContent).toContain("boom");
  });
});
