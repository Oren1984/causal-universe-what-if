# Limitations

## Scientific

- **The world is invented.** The causal graph and every coefficient were written by hand. The app demonstrates how causal reasoning works on a known model. It says nothing about real rainfall, real plants or real animals.
- **Nothing is discovered.** The model's structure is given, not learned. No causal discovery, identification or estimation method is implemented beyond one illustrative linear regression.
- **Not true counterfactual inference.** The two worlds share their random disturbances because the simulator generated both. Pearl's counterfactual procedure begins by *inferring* those disturbances from observed evidence. That step is not implemented, so the comparison is a paired simulation.
- **The confounding is staged.** Experiment C shows a sign reversal because sunlight was designed to cause one. It illustrates the phenomenon; it is not evidence about how common or how large confounding is in practice.
- **Adjustment is approximate.** The sunlight-adjusted slope (+0.70) differs from the interventional slope (+0.88). The likely reasons are listed in the experiment write-up but were not individually verified.
- **Narrow intervention type.** Only "set one variable to a constant" is supported. No soft interventions, no simultaneous interventions on several variables, no changes to mechanisms.
- **Simple dynamics.** Every mechanism is a linear relaxation toward a target, with independent Gaussian noise. There are no thresholds, delays longer than one day, spatial effects or extreme events.
- **Mediation is shown, not measured.** The graph makes direct and indirect paths visible, but natural direct and indirect effects are not computed.
- **Statistics are within-model.** The confidence interval in Experiment D reflects variation across random seeds of this model only.

## Technical

- **Local use only.** No authentication, rate limiting or hardening for public exposure. The compose file binds to `127.0.0.1`.
- **Fixed run length in the UI.** The interface always simulates 240 days with the intervention on day 60. The API accepts other values.
- **Playback, not live simulation.** The browser requests a full run and then plays it. Changing a control requires running the comparison again.
- **Browser coverage.** Automated browser tests run in Chromium only. Firefox and Safari were not tested.
- **Accessibility.** Controls are keyboard-reachable, the two chart series colours were validated for contrast and colour-blind separation, and reduced-motion is respected. The canvases themselves carry only a short text label; the chain strip and evidence tables are the accessible representation of their content. No screen-reader testing was done.
- **Graph layout is hand-placed.** Node positions are fixed in the frontend. The arrows are data-driven, but a model with different variables would need new positions.

## Demonstration video

- The narration is synthetic speech. Its timing and loudness were measured; its naturalness was not judged by a human listener.
- The Hebrew captions were written by the same AI assistant that produced the rest of the project and have not been reviewed by a native-speaking editor.
- The music is a procedurally generated ambient bed, not a composed score.
