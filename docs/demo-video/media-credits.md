# Media credits and licences

Everything in the video was generated locally for this project. No stock footage, stock music or paid service was used.

| Element | Source | Licence | Attribution required |
|---|---|---|---|
| Footage | Screen capture of this project's own application | Project's own work | No |
| Narration audio | Synthesised with the Kokoro-82M text-to-speech model, voice `af_heart` | Model weights: Apache 2.0 | No. Credited here as a courtesy |
| Music | Original. Synthesised by `scripts/video/music.py` (NumPy, fixed random seed) | Project's own work; no third-party recording or sample | No |
| Captions | Written for this project | Project's own work | No |
| Title and caption font | Segoe UI as installed on the production machine, rendered into video frames | Microsoft system font | No. See note below |

## Tools

| Tool | Role | Licence |
|---|---|---|
| [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) | Speech model | Apache 2.0 (stated on the model page: "Apache-licensed weights") |
| [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) 0.6.1 | Runs the model locally | MIT for the code; its README lists the model as Apache 2.0 |
| FFmpeg | Encoding and mixing | LGPL/GPL (a tool; does not affect the licence of its output) |
| Playwright + Chromium | Frame capture | Apache 2.0 / BSD-style |
| NumPy, soundfile | Audio synthesis and file writing | BSD |

Licence statements for Kokoro-82M and kokoro-onnx were read from their project pages on 8 October 2026.

Model files used (downloaded from the kokoro-onnx `model-files-v1.0` release, not stored in this repository):

| File | SHA-256 |
|---|---|
| `kokoro-v1.0.onnx` | `7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5` |
| `voices-v1.0.bin` | `bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d` |

## Notes

- **Music licence.** Because the track is computed from sine waves by code in this repository, there is no upstream rights holder. It is distributed with the project under the project's MIT License.
- **Synthetic voice.** The narration is machine-generated. Viewers should not take it for a human recording.
- **Font.** Text in the video is rasterised into frames. If the video is to be distributed commercially and font licensing matters, rebuild with an openly licensed font by editing the `font-family` in `frontend/e2e/record-demo.mjs`.
- **Project licence.** The project, including the footage, captions and music it produced, is released under the [MIT License](../../LICENSE).
