# Testing

Results below are from the final acceptance run on 9 October 2026, against a Docker image built from scratch (`docker compose build --no-cache`) and served on `http://localhost:8080`.

| Suite | Command | Passed | Failed | Skipped |
|---|---|---|---|---|
| Backend, local (Python 3.12.10, NumPy 2.4.2) | `cd backend && python -m pytest` | 60 | 0 | 0 |
| Backend, clean `python:3.12-slim` container with the pinned `requirements-dev.txt` | see below | 60 | 0 | 0 |
| Frontend unit (Vitest, jsdom) | `cd frontend && npm test` | 27 | 0 | 0 |
| Frontend type check and production build | `cd frontend && npm run build` | ok | | |
| Browser end-to-end (Playwright, Chromium) | `cd frontend && npm run e2e` | 5 | 0 | 0 |

The browser suite was then repeated 30 times in a row: 30 of 30 runs passed all 5 tests.

## What the backend tests cover (60)

**The model** (`tests/test_scm.py`, 29 tests)

- *Graph structure:* the documented chain exists; the same-day graph is acyclic and matches the evaluation order; every lagged arrow has lag 1; an injected same-day cycle is detected.
- *Intervention semantics:* `do()` pins the variable inside its window only; nothing changes before it starts; holding a variable fixed cuts it off from its parents.
- *Propagation:* for each of the six possible targets, the set of variables that numerically change equals the graph's descendants exactly.
- *Determinism and paired noise:* same seed gives bitwise-equal output; different seeds differ; a short run is a prefix of a long one; upstream variables are identical across a paired run; a batch of worlds equals the same worlds run one at a time.
- *Mathematical reference cases:* the first step matches a hand calculation; the deterministic steady state matches the closed form; water under `do(rainfall = 1)` follows `1 − 0.5 · 0.88^t`; sunlight follows the seasonal sine.
- *Bounds:* values stay within 0 to 1 at extreme parameters with doubled noise; permanent drought drives the chain to zero.
- *Metrics:* effect metrics on hand-built arrays, including the "relative effect undefined at zero baseline" case.

**The experiments** (`tests/test_experiments.py`, 6 tests): results are reproducible and serialisable; metrics agree with the time series; propagation matches the graph and is ordered down the chain; the confounded slope is negative while the interventional slope is positive; mean, standard deviation and confidence interval are recomputed independently.

**The API** (`tests/test_api.py`, 25 tests): every endpoint's response shape; reproducibility; the baseline of a comparison equals a plain simulation; 13 kinds of invalid input are rejected with HTTP 422 (out-of-range steps, seeds and values, unknown fields, an unknown variable, an injection-style string, impossible windows); unknown scenarios return 404; malformed JSON and wrong methods are rejected.

## What the frontend tests cover (27)

- **Playback and sampling** (8): the shared clock's start, pause, reset, replay, seek and end-of-run behaviour; interpolation; divergence detection; number formatting.
- **Causal graph** (5): the drawing contains exactly the backend's variables and arrows; an intervention cuts only the arrows into its target; highlights follow the diverged set and can be switched off; selecting a node shows its equation, causes and descendants.
- **Application** (14): selectors are filled from the backend; controls drive one clock; scenario changes and *New scenario*; preset and slider set the request that is sent; the chain strip lights up only where the backend series diverge; the evidence table shows backend metrics unchanged; a new scenario clears the comparison; view switching; experiments requested once; backend errors are surfaced; controls tolerate events during the first load, and a late response cannot overwrite a newer one.

These run in jsdom with a fake backend. Canvas drawing is not exercised here; it is covered by the browser tests.

## What the browser tests cover (5)

Run in real Chromium against the running container.

1. **Full user journey.** Open the app, select a scenario, start the simulation, apply an intervention, compare the worlds, inspect the graph, review the results, reset, replay, new scenario. Along the way it asserts that:
   - the two canvases are **pixel-identical** before the intervention day and differ afterwards;
   - on-screen percentages and the metrics table equal the values in the `/api/intervene` response;
   - the graph has exactly as many nodes and arrows as `/api/model`;
   - experiment figures equal a fresh `/api/experiments` response;
   - there were no console errors, page errors, failed requests or HTTP error responses.
2. **Every intervention preset** produces a negative effect on creatures where expected (drought, less vegetation, less food).
3. **The slider value** is the value sent to the backend.
4. **Phone-sized layout** (390 × 844) stacks the worlds and does not scroll sideways.
5. **Reduced-motion preference** still shows the real, diverged state.

## Docker verification

| Check | Result |
|---|---|
| Uncached build | Succeeded |
| Health | `healthy` 4 seconds after start |
| Default command | `docker compose up --build` serves `http://localhost:8080` |
| Alternative port | `PORT=8090` verified |
| Runs as | non-root user `appuser` |
| Port binding | `127.0.0.1` only |
| Shutdown | `docker compose stop` exits with code 0; Uvicorn logs "Application shutdown complete"; `docker compose down` took 3 seconds |
| Results | The container's `/api/experiments` output equals `results/experiments.json` exactly |

Backend tests inside a clean container:

```bash
docker run --rm -v "$PWD/backend:/src:ro" python:3.12-slim sh -c \
  "cp -r /src /tmp/b && cd /tmp/b && pip install -q -r requirements-dev.txt && python -m pytest -q"
```

## Reproducibility across environments

Within one environment, results are bit-for-bit identical from run to run. Across environments they agree to the last decimal place or two: between NumPy 2.2.1 on Linux (the container) and NumPy 2.4.2 on Windows, 10 summary statistics differ, by at most 3.3 × 10⁻¹⁶. The human-readable report `results/experiments.md` is byte-identical in both. `results/experiments.json` was generated inside the container, which pins its dependency versions and is the reference environment.

## Demonstration video

Checked with `ffprobe`, FFmpeg analysis filters, and a script comparing the audio with the narration timeline.

| Property | Measured |
|---|---|
| File | `docs/demo-video/causal-universe-demo.mp4`, 32.4 MB, MP4 with the index at the front (fast start) |
| Duration | 130.63 s (2 min 11 s) |
| Video | H.264 High, 1920 × 1080, 30 fps, 3,919 frames, `yuv420p`, BT.709 limited range |
| Audio | AAC-LC, 48 kHz, stereo |
| Decode | Entire file decodes with no errors |
| Loudness | −15.9 LUFS integrated, loudness range 2.5 LU |
| Narration present | All 19 narration segments carry signal (mean −18.9 dB); no silence longer than 2 s |
| Music balance | Voice sits 13.1 dB above the music-only passages |
| Captions | `captions-he.vtt` and `captions-en.vtt`: valid WebVTT header, 19 cues each, in order, non-overlapping, ending before the video does; all 19 Hebrew cues contain Hebrew text |
| Caption timing | Generated from the same timeline as the audio, and burned into the frames from that timeline |
| Black frames | Only the final 0.53 s (the closing fade) |
| Capture | 0 browser errors during the final capture |
| Content | Sixteen sampled frames were inspected: real UI, right-to-left captions laid out correctly, and on-screen numbers equal to `results/experiments.md` |

**Not verified:** how the narration *sounds*. No one listened to it. Its presence, timing and level were measured; its naturalness and pronunciation were not judged. The Hebrew captions were not reviewed by a native-speaking editor.

## Defects found during testing and fixed

- **Startup race in the app.** A window resize arriving before the first world had loaded made the app try to draw with no data (`Cannot read properties of undefined`). Found while capturing the video. Fixed: drawing is skipped until data exists, the control area is inert until the first load completes, and a late response can no longer overwrite a newer one. Two unit tests cover this.
- **Image build broken by the test files.** After the frontend tests were added, the Docker build failed its type check because Node's type definitions were missing. The failure went unnoticed for a while because the build output was being truncated, so several test runs in that period exercised an older image. Fixed by adding `@types/node`; all results on this page come from runs after the fix, on a verified new image.
- **Timing races in the browser tests.** Three places where a test acted before the response it depended on had arrived. Each now waits for that response. This is what the 30-run repeat was for.
- **Environment-dependent assertion.** One API test expected HTTP 405 for a wrong method; when the built frontend is mounted the static handler answers 404 instead. The test now accepts either.

## Known gaps

- Chromium only; Firefox and Safari were not tested.
- No automated accessibility audit and no screen-reader testing.
- No load or performance testing; the app is a single-user local tool.
- The canvas renderer has no unit tests. It is covered indirectly, by the pixel comparison in the browser tests.
