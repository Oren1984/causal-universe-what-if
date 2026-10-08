# Local development

## Run with Docker (recommended)

```bash
docker compose up --build
```

Open <http://localhost:8080>. Stop with `Ctrl+C`, or `docker compose down` from another terminal.

If port 8080 is already in use, choose another:

```bash
PORT=8090 docker compose up --build          # macOS, Linux, Git Bash
$env:PORT = "8090"; docker compose up --build   # PowerShell
```

The container reports its own health (`docker ps` shows `healthy`), listens on `127.0.0.1` only, and shuts down cleanly on `SIGTERM`.

## Run without Docker

Requires Python 3.12 and Node 24.

```bash
# Terminal 1: backend on port 8000
cd backend
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000

# Terminal 2: frontend dev server with hot reload, proxying /api to the backend
cd frontend
npm install
npm run dev
```

## Tests

```bash
cd backend && python -m pytest          # model, experiments, API
cd frontend && npm test                 # frontend unit tests (Vitest + jsdom)

# Browser tests need the app running (Docker) and Chromium installed once:
cd frontend
npx playwright install chromium
npm run e2e                             # against http://localhost:8080
BASE_URL=http://localhost:8090 npm run e2e
```

See [testing.md](testing.md) for what each suite covers.

## Regenerate research results

```bash
cd backend
python -m app.experiments               # writes results/experiments.json and .md
```

## Regenerate screenshots

```bash
cd frontend
node e2e/screenshots.mjs http://localhost:8080
```

## Rebuild the demonstration video

See [demo-video/storyboard.md](demo-video/storyboard.md) for the full pipeline. In short, with the app running:

```bash
python -m venv .venv-video
.venv-video/Scripts/python -m pip install kokoro-onnx==0.6.1 soundfile numpy
# download kokoro-v1.0.onnx and voices-v1.0.bin into scripts/video/.cache/ (see media-credits.md)
.venv-video/Scripts/python scripts/video/narrate.py
.venv-video/Scripts/python scripts/video/music.py <total seconds printed by narrate.py>
(cd frontend && node e2e/record-demo.mjs http://localhost:8080)
bash scripts/video/build.sh
```

## Layout

```text
backend/     Python: the causal model, experiments, API, tests
frontend/    TypeScript: the interface, unit tests, browser tests
results/     Saved experiment output
scripts/     Demo-video pipeline
docs/        Documentation, screenshots, diagrams, video
```
