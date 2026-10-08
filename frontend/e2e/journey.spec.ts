import { expect, test, type Page } from "@playwright/test";

/** Collects anything that should not happen during a healthy session. */
function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => problems.push(`requestfailed: ${request.url()}`));
  page.on("response", (response) => {
    if (response.status() >= 400) problems.push(`http ${response.status()}: ${response.url()}`);
  });
  return problems;
}

const day = async (page: Page): Promise<number> => Number((await page.locator("#clock").innerText()).match(/Day (\d+)/)![1]);

/** Fraction of sampled pixels that differ between the two world canvases. */
const canvasDifference = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const read = (id: string): Uint8ClampedArray => {
      const canvas = document.getElementById(id) as HTMLCanvasElement;
      return canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const a = read("canvas-a");
    const b = read("canvas-b");
    let different = 0;
    let total = 0;
    for (let i = 0; i < a.length; i += 4 * 97) {
      total++;
      if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) different++;
    }
    return different / total;
  });

test("full user journey: observe, intervene, compare, inspect, review, reset", async ({ page, request }) => {
  const problems = watch(page);

  // 1. Open the application.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Causal Universe" })).toBeVisible();
  await expect(page.locator("#chain li")).toHaveCount(7);
  await expect(page.locator("#status")).toContainText("Both worlds are identical");

  // 2. Select a scenario.
  // Each scenario change fetches a new observed world; wait for it before moving on.
  for (const scenario of ["wetland", "temperate"]) {
    const [observed] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/simulate")),
      page.selectOption("#scenario", scenario),
    ]);
    expect((await observed.json()).scenario).toBe(scenario);
  }
  await expect(page.locator("#caption-a")).toContainText("seed 42");
  await expect(page.locator("#clock")).toHaveText("Day 0 / 239");

  // 3. Start the simulation: both worlds move on one clock and stay identical.
  await page.click("#btn-play");
  await expect(page.locator("#btn-play")).toHaveText("Pause");
  await expect.poll(() => day(page)).toBeGreaterThan(5);
  await page.click("#btn-play");
  expect(await canvasDifference(page)).toBe(0);

  // 4. Apply an intervention.
  await page.selectOption("#intervention", "more-rain");
  await expect(page.locator("#value-out")).toHaveText("rainfall = 0.85");
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/intervene")),
    page.click("#btn-run"),
  ]);
  const result = await response.json();
  expect(result.intervention).toMatchObject({ variable: "rainfall", value: 0.85, start: 60 });
  await expect(page.locator("#caption-b")).toHaveText("do(rainfall = 0.85) from day 60");
  await expect(page.locator("#btn-play")).toHaveText("Pause");

  // 5. Compare both worlds: identical before the intervention, different after.
  await page.click("#btn-play");
  await page.locator("#scrub").fill("40");
  await expect(page.locator("#chain li.diverged")).toHaveCount(0);
  expect(await canvasDifference(page)).toBe(0);
  await page.locator("#scrub").fill("200");
  await expect(page.locator("#chain li.diverged")).toHaveCount(6);
  await expect(page.locator('#chain li[data-var="sunlight"]')).not.toHaveClass(/diverged/);
  expect(await canvasDifference(page)).toBeGreaterThan(0.05);
  // The numbers on screen are the backend's numbers.
  const pctOf = (series: number[]): string => `${Math.round(series[200] * 100)}%`;
  await expect(page.locator('#chain li[data-var="creatures"] .a')).toHaveText(`A ${pctOf(result.baseline.creatures)}`);
  await expect(page.locator('#chain li[data-var="creatures"] .b')).toHaveText(`B ${pctOf(result.intervention_world.creatures)}`);

  // 6. Inspect the causal graph.
  await page.click("#btn-graph");
  const model = await (await request.get("/api/model")).json();
  await expect(page.locator("#graph .edge")).toHaveCount(model.edges.length);
  await expect(page.locator("#graph .node")).toHaveCount(model.variables.length);
  await expect(page.locator("#graph .edge.cut")).toHaveCount(1);
  await expect(page.locator('#graph .node[data-var="rainfall"]')).toHaveClass(/do/);
  await page.click('#graph .node[data-var="rainfall"]');
  await expect(page.locator('[data-testid="descendants"]')).toHaveText("Water, Vegetation, Food, Creatures, Health");
  await expect(page.locator("#node-info .equation")).toContainText("R[t] = clip(");

  // 7. Review actual results.
  await page.click("#tab-evidence");
  const fmt = (x: number, digits = 3): string => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(digits)}`;
  for (const v of ["water", "vegetation", "food", "creatures"]) {
    await expect(page.locator(`[data-testid="final-diff-${v}"]`)).toHaveText(fmt(result.metrics[v].final_diff));
  }
  await expect(page.locator('[data-testid="final-diff-sunlight"]')).toHaveText("0.000");
  await expect(page.locator('[data-testid="experiment-d"]')).toBeVisible({ timeout: 20_000 });
  const experiments = (await (await request.post("/api/experiments", { data: {} })).json()).results;
  await expect(page.locator('[data-testid="obs-slope"] strong')).toHaveText(fmt(experiments.C.observational.slope, 2));
  await expect(page.locator('[data-testid="mean-effect"] strong')).toHaveText(fmt(experiments.D.mean_effect));
  await expect(page.locator('[data-testid="experiment-b"] td.ok')).toHaveCount(4);
  // Chart hover layer.
  await page.locator(".mini svg").first().hover();
  await expect(page.locator(".mini .tooltip").first()).toContainText("Day");

  // 8. Reset, then replay.
  await page.click("#tab-explore");
  await page.click("#btn-reset");
  await expect(page.locator("#clock")).toHaveText("Day 0 / 239");
  await expect(page.locator("#btn-play")).toHaveText("Start");
  await expect(page.locator("#chain li.diverged")).toHaveCount(0);
  await page.click("#btn-replay");
  await expect.poll(() => day(page)).toBeGreaterThan(3);
  await page.click("#btn-play");

  // A new scenario clears the comparison and draws new weather.
  await page.click("#btn-new");
  await expect(page.locator("#caption-b")).toHaveText("no intervention yet");
  await expect(page.locator("#caption-a")).not.toContainText("seed 42");

  expect(problems).toEqual([]);
});

test("every intervention preset changes World B", async ({ page }) => {
  const problems = watch(page);
  await page.goto("/");
  for (const preset of ["drought", "less-vegetation", "less-food"]) {
    await page.selectOption("#intervention", preset);
    // Wait for this preset's own comparison; the marker from the previous one is still showing.
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/intervene")),
      page.click("#btn-run"),
    ]);
    const { intervention } = await response.json();
    await expect(page.locator("#caption-b")).toHaveText(`do(${intervention.variable} = ${intervention.value}) from day 60`);
    await expect(page.locator("#btn-play")).toHaveText("Pause");
    await page.click("#btn-play");
    await page.locator("#scrub").fill("220");
    await expect(page.locator('#chain li[data-var="creatures"]')).toHaveClass(/diverged/);
    await expect(page.locator('#chain li[data-var="creatures"] .delta')).toContainText("−");
  }
  expect(problems).toEqual([]);
});

test("the slider changes the intervention value sent to the backend", async ({ page }) => {
  await page.goto("/");
  await page.locator("#value").fill("0.3");
  await expect(page.locator("#value-out")).toHaveText("rainfall = 0.30");
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/intervene")),
    page.click("#btn-run"),
  ]);
  expect((await response.json()).intervention.value).toBe(0.3);
});

test("layout adapts to a phone-sized screen without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#chain li")).toHaveCount(7);
  const a = (await page.locator("#canvas-a").boundingBox())!;
  const b = (await page.locator("#canvas-b").boundingBox())!;
  expect(b.y).toBeGreaterThan(a.y + a.height - 1); // stacked, not side by side
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.click("#tab-graph");
  await expect(page.locator("#graph svg")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("reduced-motion preference still shows the real state", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.click("#btn-run");
  // The comparison autoplays once it arrives; wait for that before pausing.
  await expect(page.locator("#caption-b")).toHaveText("do(rainfall = 0.85) from day 60");
  await expect(page.locator("#btn-play")).toHaveText("Pause");
  await page.click("#btn-play");
  await page.locator("#scrub").fill("200");
  await expect(page.locator("#chain li.diverged")).toHaveCount(6);
  expect(await canvasDifference(page)).toBeGreaterThan(0.05);
});
