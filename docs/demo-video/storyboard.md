# Storyboard and production notes

Final video: [`causal-universe-demo.mp4`](causal-universe-demo.mp4) · Poster: [`poster.jpg`](poster.jpg) · Captions: [`captions-he.vtt`](captions-he.vtt) (Hebrew), [`captions-en.vtt`](captions-en.vtt) (English)

## Scenes

| # | Scene | On screen (all real application footage) | Narration covers |
|---|---|---|---|
| 1 | Introduction | Title card over the live baseline world, then the card lifts | The question; what Causal Universe is |
| 2 | Meet the ecosystem | Explore view. The pointer walks along the chain strip: sunlight, rainfall, water, vegetation, food, creatures. Then the causal graph, with Water selected to show its equation | The mechanisms; each link is an equation in an SCM |
| 3 | The intervention | Back to Explore. *Run comparison* is clicked. Both worlds restart together and reach day 60, where the highlight ring marks rainfall in World B | Twins with shared weather and luck; `do(rainfall = 0.85)`; what an intervention is |
| 4 | Chain reaction | Timeline rewound to day 57 and replayed, so the chain strip lights up link by link. Then the graph view: arrow into Rainfall cut, downstream nodes lit, Sunlight unchanged | Propagation delays of 4, 8 and 14 days; why the graph predicts this |
| 5 | The evidence | The run plays to day 239. Experimental Evidence view: time-series charts, metrics table (creatures row), then Experiment D | The difference is the effect; +40%; 30 seeds |
| 6 | Scientific meaning | Experiment C: the three slope tiles and the scatter chart. Then a caveat card over the replaying worlds | Observation vs. intervention; sunlight as confounder; limits of a synthetic world |
| 7 | Closing | Title and credit over the replaying comparison, fade to black | "Developed and built by Oren Salami" |

Exact line timings are in [`script-en.md`](script-en.md).

## How it was produced

Four scripted steps, all local, no paid services.

1. **Narration and captions** (`scripts/video/narrate.py`). Each line of `scripts/video/script.json` is synthesised with Kokoro-82M. The clips are laid end to end with fixed pauses, giving a timeline with a start and end time for every line. The caption files are written from that same timeline, so captions and speech cannot drift apart.
2. **Music** (`scripts/video/music.py`). An original ambient bed, synthesised with NumPy.
3. **Footage** (`frontend/e2e/record-demo.mjs`). Playwright opens the real application in Chromium, served by the real Docker container. The script clicks the real controls and captures one screenshot per video frame at 30 frames per second, piping them into FFmpeg (H.264). The browser's clock is advanced manually between frames, so no frames are dropped and actions land on the narration timeline.
4. **Mix and mux** (`scripts/video/build.sh`). FFmpeg mixes voice and music, normalises loudness, encodes AAC audio and writes the MP4 and the poster.

## What is real and what is added

**Real:** every pixel of the application. The worlds, the chain strip, the graph, the charts and all numbers are rendered by the app from live backend responses during the capture. The comparison shown is seed 42, Temperate valley, `do(rainfall = 0.85)` from day 60, the same run as Experiment A.

**Added for the video only**, by an overlay the capture script injects on top of the page:

- Hebrew captions (rendered by the browser so right-to-left text is laid out correctly)
- A pointer and click ring. Headless browsers have no visible cursor, so one is drawn where each click is dispatched
- The title, caveat and closing cards
- Fades from and to black

**Timing.** Simulation playback speed varies between half speed and normal speed so that events line up with the narration. In scene 4 the timeline is rewound from about day 112 to day 57 to show the propagation again. Neither changes any value; the app plays back the same backend series at a different rate.

## Technical checks

See the "Demonstration video" section of [`../testing.md`](../testing.md) for the measured properties of the final file.
