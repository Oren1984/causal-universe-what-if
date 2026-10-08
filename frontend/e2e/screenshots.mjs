// Captures real screenshots of the running app for the documentation.
// Usage: node e2e/screenshots.mjs [baseUrl] [outputDir]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const base = process.argv[2] ?? "http://localhost:8080";
const out = process.argv[3] ?? "../docs/assets/screenshots";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const shot = (name) => page.screenshot({ path: join(out, name) });
const seek = (day) => page.locator("#scrub").fill(String(day));

await page.goto(base);
await page.locator("#chain li").first().waitFor();
await seek(120);
await shot("01-observe.png");

await page.click("#btn-run");
await page.locator("#do-marker").waitFor();
await page.click("#btn-play"); // pause the autoplay
await seek(75);
await shot("02-intervention-starts.png");
await seek(200);
await shot("03-worlds-diverged.png");

await page.click("#tab-graph");
await page.click('.node[data-var="rainfall"]');
await shot("04-causal-graph.png");

await page.click("#tab-evidence");
await page.locator('[data-testid="experiment-d"]').waitFor();
await shot("05-evidence-run.png");
await page.locator('[data-testid="experiment-c"]').scrollIntoViewIfNeeded();
await page.screenshot({ path: join(out, "06-evidence-experiments.png"), fullPage: true });

await page.setViewportSize({ width: 420, height: 900 });
await page.click("#tab-explore");
await shot("07-mobile.png");
await browser.close();
console.log("screenshots written to", out);
