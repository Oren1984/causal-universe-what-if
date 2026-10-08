"""Step 1 of the demo video: narration, timeline and caption files.

Synthesises each line of script.json with Kokoro-82M (local, Apache-2.0),
lays the clips on a timeline, and writes:

  .cache/narration.wav            full narration track
  .cache/timeline.json            start/end of every line (drives the capture)
  docs/demo-video/captions-he.vtt Hebrew captions
  docs/demo-video/captions-en.vtt English captions

Run with the video virtualenv:  .venv-video/Scripts/python scripts/video/narrate.py
"""
import json
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

HERE = Path(__file__).parent
CACHE = HERE / ".cache"
OUT = HERE.parents[1] / "docs" / "demo-video"
VOICE, SPEED, RATE = "af_heart", 0.95, 24000
LEAD_IN, GAP, SCENE_GAP, TAIL = 1.2, 0.45, 1.0, 3.0


def stamp(seconds: float) -> str:
    minutes, rest = divmod(seconds, 60)
    return f"00:{int(minutes):02d}:{rest:06.3f}"


def write_vtt(path: Path, lines: list[dict], key: str) -> None:
    cues = ["WEBVTT", ""]
    for i, line in enumerate(lines, 1):
        cues += [str(i), f"{stamp(line['start'])} --> {stamp(line['end'])}", line[key], ""]
    path.write_text("\n".join(cues), encoding="utf-8", newline="\n")


def main() -> None:
    script = json.loads((HERE / "script.json").read_text(encoding="utf-8"))
    kokoro = Kokoro(str(CACHE / "kokoro-v1.0.onnx"), str(CACHE / "voices-v1.0.bin"))
    track = [np.zeros(int(LEAD_IN * RATE), dtype=np.float32)]
    cursor = LEAD_IN
    for i, line in enumerate(script):
        samples, rate = kokoro.create(line["en"], voice=VOICE, speed=SPEED, lang="en-us")
        assert rate == RATE
        samples = np.trim_zeros(samples.astype(np.float32))
        line["start"] = round(cursor, 3)
        cursor += len(samples) / RATE
        line["end"] = round(cursor, 3)
        last = i == len(script) - 1
        pause = TAIL if last else SCENE_GAP if script[i + 1]["scene"] != line["scene"] else GAP
        track += [samples, np.zeros(int(pause * RATE), dtype=np.float32)]
        cursor += pause
        print(f"{line['start']:7.2f} - {line['end']:7.2f}  {line['en'][:60]}")

    audio = np.concatenate(track)
    sf.write(CACHE / "narration.wav", audio, RATE)
    total = len(audio) / RATE
    (CACHE / "timeline.json").write_text(json.dumps({"total": total, "lines": script}, ensure_ascii=False, indent=1), encoding="utf-8")
    OUT.mkdir(parents=True, exist_ok=True)
    write_vtt(OUT / "captions-he.vtt", script, "he")
    write_vtt(OUT / "captions-en.vtt", script, "en")
    print(f"total {total:.2f} s")


if __name__ == "__main__":
    main()
