// Step 3 of the demo video: capture footage of the real running application.
//
// Drives the app in Chromium against the real backend and pipes one screenshot
// per video frame into FFmpeg. The browser clock is stepped manually, so the
// footage is frame-exact and stays in sync with the narration timeline.
//
// Added on top of the app, for the video only: Hebrew captions, a pointer,
// title/closing cards and fades. Nothing inside the app is altered or faked.
//
// Usage: node e2e/record-demo.mjs [baseUrl]
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const base = process.argv[2] ?? "http://localhost:8080";
const cache = new URL("../../scripts/video/.cache/", import.meta.url);
const timeline = JSON.parse(readFileSync(new URL("timeline.json", cache), "utf-8"));
const line = (n) => timeline.lines[n - 1]; // 1-based, as in the storyboard
const FPS = 30;
const DRY_RUN = process.env.DRY_RUN === "1"; // run the choreography without encoding, to check for errors quickly
const SLOW = 0.5; // slowest speed at which the app still animates every frame

const ffmpeg = spawn("ffmpeg", [
  "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
  // JPEG frames are full-range BT.601; convert to standard limited-range BT.709 for players.
  "-vf", "scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p",
  "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-r", String(FPS),
  "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
  new URL(DRY_RUN ? "dry-run.mp4" : "footage.mp4", cache).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
], { stdio: ["pipe", "inherit", "inherit"] });
const ffmpegDone = new Promise((resolve, reject) => ffmpeg.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))));
if (DRY_RUN) ffmpegDone.catch(() => {}); // no frames are sent in a dry run, so FFmpeg has nothing to write

const browser = await chromium.launch();
// 1600x900 CSS pixels at 1.2x gives crisp 1920x1080 frames with a comfortably large UI.
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2 });
const page = await context.newPage();
const problems = [];
page.on("pageerror", (error) => problems.push(`at ${(frame / FPS).toFixed(2)} s: ${error.stack ?? error.message}`));
page.on("console", (message) => message.type() === "error" && problems.push(message.text()));

const T0 = new Date("2026-01-01T12:00:00Z");
await page.clock.install({ time: T0 });
await page.goto(base);
await page.locator("#chain li").first().waitFor();
await page.clock.pauseAt(new Date(T0.getTime() + 60_000));

await page.evaluate(() => {
  const root = document.createElement("div");
  root.id = "v-root";
  root.innerHTML = `
    <style>
      #v-root { position: fixed; inset: 0; z-index: 9999; pointer-events: none; font-family: "Segoe UI", Arial, sans-serif; }
      #v-card { position: absolute; inset: 0; display: grid; place-content: center; gap: 22px; text-align: center; padding: 0 12%;
        background: radial-gradient(ellipse at center, rgba(8,14,30,0.74), rgba(4,7,16,0.93)); color: #eef3fb; opacity: 0; }
      #v-card h1 { margin: 0; font-size: 64px; line-height: 1.15; letter-spacing: 0.01em; text-wrap: balance; }
      #v-card p { margin: 0; font-size: 30px; color: #b9c7de; text-wrap: balance; }
      #v-card .accent { color: #5fe0c0; font-size: 22px; letter-spacing: 0.28em; text-transform: uppercase; }
      #v-sub { position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%); max-width: 1320px; padding: 9px 26px 11px;
        border-radius: 12px; background: rgba(4,7,16,0.86); color: #fff; font-size: 31px; line-height: 1.35; text-align: center;
        text-wrap: balance; direction: rtl; opacity: 0; }
      #v-cursor { position: absolute; width: 30px; height: 30px; left: 0; top: 0; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.6)); }
      #v-ring { position: absolute; width: 60px; height: 60px; margin: -30px 0 0 -30px; border: 4px solid #5fe0c0; border-radius: 50%; opacity: 0; }
      #v-black { position: absolute; inset: 0; background: #000; opacity: 1; }
    </style>
    <div id="v-card"></div>
    <div id="v-ring"></div>
    <svg id="v-cursor" viewBox="0 0 24 24"><path d="M4 2 L4 20 L9 15.5 L12.5 22.5 L15.5 21 L12 14.2 L19 14 Z" fill="#fff" stroke="#0b1220" stroke-width="1.5" stroke-linejoin="round"/></svg>
    <div id="v-sub"></div>
    <div id="v-black"></div>`;
  document.body.append(root);
  window.__video = (ui) => {
    const $ = (id) => document.getElementById(id);
    $("v-sub").textContent = ui.sub;
    $("v-sub").style.opacity = ui.sub ? 1 : 0;
    $("v-cursor").style.transform = `translate(${ui.x}px, ${ui.y}px)`;
    $("v-cursor").style.opacity = ui.cursor;
    $("v-ring").style.left = `${ui.x}px`;
    $("v-ring").style.top = `${ui.y}px`;
    $("v-ring").style.opacity = ui.ring;
    $("v-ring").style.transform = `scale(${0.4 + 0.8 * (1 - ui.ring)})`;
    $("v-black").style.opacity = ui.black;
    $("v-card").style.opacity = ui.card;
    if (ui.cardHtml !== $("v-card").dataset.html) {
      $("v-card").dataset.html = ui.cardHtml;
      $("v-card").innerHTML = ui.cardHtml;
    }
    if (ui.scroll !== null) window.scrollTo(0, ui.scroll);
  };
});

// ---- frame loop -------------------------------------------------------------

const ui = { sub: "", x: 800, y: 520, cursor: 0, ring: 0, black: 1, card: 0, cardHtml: "", scroll: null };
const tweens = [];
let frame = 0;
let speed = 1;
const now = () => frame / FPS;
const ease = (k) => k * k * (3 - 2 * k);

/** Animate a ui value to `to` over `seconds` of video time. */
function tween(key, to, seconds) {
  tweens.push({ key, from: ui[key], to, t0: now(), t1: now() + seconds });
}

async function captureFrame() {
  const t = now();
  for (const tw of tweens) {
    const k = Math.min(1, (t - tw.t0) / Math.max(1e-6, tw.t1 - tw.t0));
    ui[tw.key] = tw.from + (tw.to - tw.from) * ease(k);
  }
  for (let i = tweens.length - 1; i >= 0; i--) if (t >= tweens[i].t1) tweens.splice(i, 1);
  const cue = timeline.lines.find((l) => t >= l.start - 0.1 && t <= l.end + 0.3);
  ui.sub = cue ? cue.he : "";
  await page.clock.runFor((1000 / FPS) * speed);
  await page.evaluate((state) => window.__video(state), ui);
  if (!DRY_RUN) {
    const jpeg = await page.screenshot({ type: "jpeg", quality: 95 });
    if (!ffmpeg.stdin.write(jpeg)) await new Promise((resolve) => ffmpeg.stdin.once("drain", resolve));
  }
  frame++;
  if (frame % 300 === 0) console.log(`  ${t.toFixed(0)} s / ${timeline.total.toFixed(0)} s`);
}

/** Capture until the video clock reaches `t` seconds. */
async function until(t) {
  while (now() < t) await captureFrame();
}
const hold = (seconds) => until(now() + seconds);

// ---- interaction helpers ----------------------------------------------------

const centre = (selector, fx = 0.5, fy = 0.5) =>
  page.evaluate(([sel, ax, ay]) => {
    const box = document.querySelector(sel).getBoundingClientRect();
    return { x: box.left + box.width * ax, y: box.top + box.height * ay };
  }, [selector, fx, fy]);

/** Move the pointer to an element over `seconds`. */
async function glide(selector, seconds = 0.7, fx = 0.5, fy = 0.5) {
  const target = await centre(selector, fx, fy);
  tween("x", target.x, seconds);
  tween("y", target.y, seconds);
  await hold(seconds);
}

/** Move to an element and click it. The click is dispatched to the real control. */
async function click(selector, seconds = 0.7) {
  await glide(selector, seconds);
  ui.ring = 1;
  tween("ring", 0, 0.45);
  await page.evaluate((sel) => {
    const node = document.querySelector(sel);
    if (node instanceof HTMLElement) node.click();
    else node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, selector);
}

/** Wait (in real time, with the video clock frozen) for the page to satisfy a condition. */
async function waitFor(predicate, arg) {
  for (let i = 0; i < 400; i++) {
    if (await page.evaluate(predicate, arg)) return;
    await sleep(50);
  }
  throw new Error("timed out waiting for the page");
}

const day = () => page.evaluate(() => Number(document.getElementById("scrub").value));
const seek = (to) =>
  page.evaluate((value) => {
    const scrub = document.getElementById("scrub");
    scrub.value = String(value);
    scrub.dispatchEvent(new Event("input"));
  }, to);

/** Choose the playback speed that brings the simulation to `toDay` at video time `t`. */
async function playUntil(t, toDay) {
  const simSeconds = (toDay - (await day())) / 12;
  speed = Math.max(SLOW, simSeconds / (t - now()));
  await until(t);
  speed = 1;
}

async function scrollTo(selector, seconds, offset = 90) {
  const y = await page.evaluate(([sel, off]) => Math.max(0, document.querySelector(sel).getBoundingClientRect().top + window.scrollY - off), [selector, offset]);
  if (ui.scroll === null) ui.scroll = await page.evaluate(() => window.scrollY);
  tween("scroll", y, seconds);
  await hold(seconds);
}

function card(html) {
  ui.cardHtml = html;
}

// ---- the film ---------------------------------------------------------------

// Scene 1: introduction. The live baseline world plays behind the title.
card(`<div class="accent">Causal Universe</div><h1>What if changing one variable could reshape an entire world?</h1>`);
ui.card = 1;
await page.evaluate(() => document.getElementById("btn-play").click());
speed = SLOW;
tween("black", 0, 1.0);
await until(line(1).end + 0.2);
tween("card", 0, 0.9);
await until(line(2).end + 0.5);

// Scene 2: meet the ecosystem. The pointer walks down the causal chain.
ui.cursor = 1;
const chip = (v) => `#chain li[data-var="${v}"]`;
await glide(chip("sunlight"), 0.8);
await until(line(3).start + 1.6);
await glide(chip("rainfall"), 0.7);
await until(line(3).start + 3.2);
await glide(chip("water"), 0.7);
await until(line(3).start + 4.7);
await glide(chip("vegetation"), 0.7);
await until(line(4).start + 0.6);
await glide(chip("food"), 0.7);
await until(line(4).start + 2.0);
await glide(chip("creatures"), 0.7);
await until(line(5).start - 0.4);
await click("#btn-graph");
await hold(1.0);
await click('#graph .node[data-var="water"]');
await glide("#node-info .equation", 1.0);
await until(line(5).end + 0.3);

// Scene 3: the intervention. Run the paired comparison; both worlds restart together.
await click("#tab-explore", 0.6);
await until(line(6).start + 1.2);
await glide("#value", 0.8, 0.85);
await until(line(6).start + 2.6);
await click("#btn-run", 0.6);
await waitFor(() => !document.getElementById("do-marker").hidden);
await playUntil(line(7).start + 4.2, 60); // day 60 arrives as the narrator sets the rainfall
tween("cursor", 0, 0.5);
speed = SLOW;
await until(line(8).end + 0.4);

// Scene 4: chain reaction. Rewind to just before the intervention and watch it spread.
await seek(57);
await playUntil(line(9).end + 0.2, 112);
ui.cursor = 1;
speed = SLOW;
await click("#btn-graph", 0.6);
await until(line(10).start + 2.2);
await click('#graph .node[data-var="rainfall"]');
await until(line(11).start + 0.2);
await click('#graph .node[data-var="sunlight"]');
await until(line(11).end + 0.3);

// Scene 5: the evidence. Let the run finish, then open the measurements.
await click("#tab-explore", 0.6);
tween("cursor", 0, 0.5);
await playUntil(line(12).start + 4.5, 239);
await until(line(12).end + 0.2);
ui.cursor = 1;
await click("#tab-evidence", 0.6);
await waitFor(() => document.querySelector('[data-testid="experiment-d"]') !== null);
await until(line(13).start + 1.5);
await scrollTo('[data-testid="metrics-table"]', 1.2, 300);
await glide('[data-testid="metrics-table"] tr[data-var="creatures"] td:nth-child(6)', 1.0);
await until(line(13).end + 0.3);
await scrollTo('[data-testid="experiment-d"]', 1.4);
await glide('[data-testid="mean-effect"]', 0.9);
await until(line(14).start + 4.6);
await glide('[data-testid="experiment-d"] .tile:nth-child(2)', 0.8);
await until(line(14).end + 0.4);

// Scene 6: scientific meaning. Correlation vs. causation, then the caveat.
await scrollTo('[data-testid="experiment-c"]', 1.4);
await until(line(15).start + 3.0);
await glide('[data-testid="obs-slope"]', 0.9);
await until(line(16).start + 0.5);
await glide('[data-testid="experiment-c"] figure svg', 1.0, 0.5, 0.45);
await until(line(17).start + 0.3);
await glide('[data-testid="do-slope"]', 0.9);
await until(line(17).end + 0.2);
tween("cursor", 0, 0.4);
card(`<div class="accent">A note on honesty</div><h1>A designed, synthetic world</h1><p>It demonstrates causal reasoning.<br/>It does not discover laws of nature.</p>`);
tween("card", 1, 0.8);
await hold(0.9);
ui.scroll = 0;
await page.evaluate(() => {
  document.getElementById("tab-explore").click();
  document.getElementById("btn-replay").click();
});
await until(line(18).end + 0.3);

// Scene 7: closing. The comparison replays behind the credit.
tween("card", 0, 0.5);
await hold(0.5);
card(`<h1>Causal Universe</h1><p>What if?</p><div class="accent" style="margin-top:26px">Developed and built by Oren Salami</div>`);
tween("card", 1, 0.5);
await until(timeline.total - 1.2);
tween("black", 1, 1.0);
await until(timeline.total);

ffmpeg.stdin.end();
if (!DRY_RUN) await ffmpegDone;
await browser.close();
console.log(`captured ${frame} frames (${now().toFixed(2)} s)`);
if (problems.length) {
  console.error("browser problems during capture:", problems);
  process.exit(1);
}
