# Narration script (English)

Source of truth: [`scripts/video/script.json`](../../scripts/video/script.json). Times are where each line starts in the final video.

Total running time: 2:10.6 (130.6 seconds). Voice: Kokoro-82M, `af_heart`, speed 0.95.

## Scene 1: Introduction

**0:01.2** What if changing one variable could reshape an entire world?

**0:05.0** This is Causal Universe: a small simulated ecosystem, built to show what a change really causes.

## Scene 2: Meet the ecosystem

**0:12.7** Here is the world. Sunlight shapes the rain. Rain fills the pond. Water grows the plants.

**0:18.9** Plants produce food, and food sustains the creatures.

**0:22.5** Each of these links is an explicit equation in a structural causal model, computed in Python.

## Scene 3: The intervention

**0:29.1** Now we create a twin. World A and World B start identical, with the same weather and the same random luck.

**0:36.5** On day sixty, in World B only, we reach in and set the rainfall to eighty-five percent.

**0:42.5** This is an intervention. We do not wait for a rainy season. We replace the rainfall equation with a fixed value.

## Scene 4: Chain reaction

**0:50.7** Watch the change travel. Water rises at once. Plants follow after four days, food after eight, and creatures after fourteen.

**0:59.5** The causal graph shows why. The arrow into rainfall is cut, and everything downstream lights up.

**1:06.0** Sunlight sits upstream of rainfall, so it stays exactly the same in both worlds.

## Scene 5: The evidence

**1:11.9** By the end, World B holds far more life. Since the two worlds share everything except the intervention, that difference is its effect.

**1:20.3** The measurements confirm it. After the intervention, the creature population averages forty percent higher.

**1:27.0** Repeated across thirty random seeds, the effect holds: plus zero point two two, with a narrow confidence interval.

## Scene 6: Scientific meaning

**1:35.4** But observing is not intervening. Across three hundred worlds that we only watched, the rainier ones look less green.

**1:42.7** Why? Sunny climates get less rain, yet grow plants faster. Sunlight is a confounder.

**1:48.8** When we set the rain ourselves, plants grow. The correlation pointed the wrong way.

**1:54.1** One caveat. This is a designed, synthetic world. It demonstrates causal reasoning. It does not discover laws of nature.

## Scene 7: Closing

**2:03.4** Causal Universe. What if? Developed and built by Oren Salami.

## Figures quoted in the narration

Each number spoken is taken from `results/experiments.md`.

| Line | Claim | Source |
|---|---|---|
| Scene 3 | Rainfall set to 85% on day 60 | The intervention `do(rainfall = 0.85)`, start 60 |
| Scene 4 | Plants after four days, food after eight, creatures after fourteen | Experiment B, days to diverge: 4, 8, 14 |
| Scene 5 | Creature population averages forty percent higher | Experiment A, relative effect on creatures: +40.5% |
| Scene 5 | Thirty seeds, plus 0.22, narrow interval | Experiment D: mean +0.2215, 95% CI +0.2183 to +0.2248 |
| Scene 6 | Three hundred worlds, rainier ones look less green | Experiment C: 300 worlds, observed slope −0.857 |
| Scene 6 | When we set the rain, plants grow | Experiment C: interventional slope +0.883 |
