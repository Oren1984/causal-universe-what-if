"""Step 2 of the demo video: an original ambient music bed.

The track is synthesised from scratch with NumPy (slow detuned pads over a
four-chord loop, a soft sub bass and a sparse bell), so there is no third-party
recording and no licence to clear. Deterministic: same seed, same audio.

Usage: python scripts/video/music.py <seconds> [output.wav]
"""
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

RATE = 44100
CHORD_SECONDS = 8.0
# D minor 9 colours: Dm9, Bbmaj7, Fmaj7, Am7 (frequencies in Hz).
CHORDS = [
    [146.83, 220.00, 261.63, 329.63, 349.23],
    [116.54, 174.61, 220.00, 293.66, 349.23],
    [87.31, 174.61, 220.00, 261.63, 329.63],
    [110.00, 164.81, 196.00, 261.63, 329.63],
]


def pad(freqs: list[float], seconds: float, rng: np.random.Generator) -> np.ndarray:
    t = np.arange(int(seconds * RATE)) / RATE
    out = np.zeros((len(t), 2))
    for f in freqs:
        for detune in (-0.004, 0.0, 0.004):
            phase = rng.uniform(0, 2 * np.pi)
            wobble = 1 + 0.15 * np.sin(2 * np.pi * rng.uniform(0.05, 0.2) * t + phase)
            voice = (np.sin(2 * np.pi * f * (1 + detune) * t + phase) + 0.25 * np.sin(4 * np.pi * f * (1 + detune) * t)) * wobble
            pan = rng.uniform(0.25, 0.75)
            out += np.column_stack([voice * (1 - pan), voice * pan])
    # Long attack and release so chords melt into each other.
    edge = int(2.5 * RATE)
    envelope = np.ones(len(t))
    envelope[:edge] = np.sin(np.linspace(0, np.pi / 2, edge)) ** 2
    envelope[-edge:] = np.cos(np.linspace(0, np.pi / 2, edge)) ** 2
    return out * envelope[:, None]


def bell(freq: float, rng: np.random.Generator) -> np.ndarray:
    t = np.arange(int(4 * RATE)) / RATE
    tone = (np.sin(2 * np.pi * freq * t) + 0.4 * np.sin(2 * np.pi * freq * 2.01 * t)) * np.exp(-t * 1.4)
    pan = rng.uniform(0.2, 0.8)
    return np.column_stack([tone * (1 - pan), tone * pan])


def main() -> None:
    seconds = float(sys.argv[1])
    target = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).parent / ".cache" / "music.wav"
    rng = np.random.default_rng(1984)
    total = int(seconds * RATE)
    mix = np.zeros((total + int(12 * RATE), 2))
    hop = int((CHORD_SECONDS - 2.5) * RATE)  # overlap the fades
    for i, start in enumerate(range(0, total, hop)):
        chord = CHORDS[i % len(CHORDS)]
        layer = pad(chord, CHORD_SECONDS, rng)
        mix[start:start + len(layer)] += layer
        t = np.arange(len(layer)) / RATE
        sub = np.sin(2 * np.pi * chord[0] / 2 * t) * np.sin(np.pi * t / CHORD_SECONDS) ** 2
        mix[start:start + len(layer)] += 2.0 * sub[:, None]
        if i % 2 == 1:
            note = bell(chord[int(rng.integers(2, 5))] * 2, rng) * 1.5
            at = start + int(rng.uniform(1, 3) * RATE)
            mix[at:at + len(note)] += note
    mix = mix[:total]
    # Simple echo for space, then fade in and out and normalise.
    delay = int(0.37 * RATE)
    for _ in range(3):
        mix[delay:] += 0.3 * mix[:-delay]
    mix[: 3 * RATE] *= np.linspace(0, 1, 3 * RATE)[:, None]
    mix[-4 * RATE:] *= np.linspace(1, 0, 4 * RATE)[:, None]
    mix *= 0.7 / np.abs(mix).max()
    target.parent.mkdir(parents=True, exist_ok=True)
    sf.write(target, mix.astype(np.float32), RATE)
    print(f"wrote {target} ({seconds:.1f} s)")


if __name__ == "__main__":
    main()
