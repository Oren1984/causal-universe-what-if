"""The four reproducible research experiments.

Run `python -m app.experiments` from `backend/` to regenerate
`results/experiments.json` and `results/experiments.md`.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

from . import scm
from .scm import Intervention

STEPS = 240
START = 60
SEED_A = 42
MAIN_INTERVENTION = Intervention("rainfall", 0.85, start=START)
SEEDS_D = list(range(1, 31))
# Two-sided 95% Student-t critical value for 29 degrees of freedom (n = 30 seeds).
T_CRIT_DF29 = 2.045
N_WORLDS_C = 300
SEED_C = 2024
RAIN_LEVELS_C = [0.2, 0.35, 0.5, 0.65, 0.8]


def experiment_a() -> dict:
    """Baseline vs. intervention on one paired world."""
    base, intv = scm.paired_run(None, SEED_A, STEPS, MAIN_INTERVENTION)
    return {
        "title": "Baseline vs. intervention",
        "seed": SEED_A,
        "steps": STEPS,
        "intervention": _describe(MAIN_INTERVENTION),
        "metrics": scm.effect_metrics(base, intv, START),
        "series_diff": {v: _round(intv[v] - base[v]) for v in scm.VARIABLES},
    }


def experiment_b() -> dict:
    """Causal propagation: do(X) must move exactly the descendants of X."""
    rows = []
    for variable, value in [("rainfall", 0.85), ("water", 0.85), ("vegetation", 0.2), ("food", 0.15)]:
        intervention = Intervention(variable, value, start=START)
        base, intv = scm.paired_run(None, SEED_A, STEPS, intervention)
        max_diff = {v: float(np.abs(intv[v] - base[v]).max()) for v in scm.VARIABLES}
        expected = set(scm.descendants(variable))
        changed = {v for v, d in max_diff.items() if d > 0 and v != variable}
        metrics = scm.effect_metrics(base, intv, START)
        rows.append(
            {
                "intervention": _describe(intervention),
                "expected_descendants": sorted(expected, key=scm.VARIABLES.index),
                "changed_variables": sorted(changed, key=scm.VARIABLES.index),
                "matches_graph": changed == expected,
                "max_abs_diff": max_diff,
                "steps_to_divergence": {v: metrics[v]["steps_to_divergence"] for v in scm.VARIABLES},
            }
        )
    return {
        "title": "Causal propagation",
        "seed": SEED_A,
        "divergence_threshold": scm.DIVERGENCE_THRESHOLD,
        "interventions": rows,
        "all_match_graph": all(r["matches_graph"] for r in rows),
    }


def experiment_c() -> dict:
    """Correlation vs. causation with sunlight as a designed confounder.

    Worlds differ in their climate (sun_base). Sunlight lowers rainfall and
    raises plant growth, so it opens a back-door path
    rainfall <- sunlight -> vegetation.
    """
    rng = np.random.default_rng(SEED_C)
    sun_base = rng.uniform(0.2, 0.8, N_WORLDS_C)
    noise = rng.standard_normal((N_WORLDS_C, STEPS, len(scm.NOISE_VARS)))
    scenario = {"sun_base": sun_base, "season_amp": 0.0}
    half = STEPS // 2

    obs = scm.simulate(scenario, noise)
    sun, rain, veg = (obs[v][:, half:].mean(axis=1) for v in ("sunlight", "rainfall", "vegetation"))
    obs_slope, obs_intercept = np.polyfit(rain, veg, 1)
    # Back-door adjustment by regression: vegetation ~ rainfall + sunlight.
    design = np.column_stack([rain, sun, np.ones_like(rain)])
    adjusted_slope = np.linalg.lstsq(design, veg, rcond=None)[0][0]

    do_means = []
    for level in RAIN_LEVELS_C:
        world = scm.simulate(scenario, noise, Intervention("rainfall", level))
        do_means.append(float(world["vegetation"][:, half:].mean()))
    do_slope, do_intercept = np.polyfit(RAIN_LEVELS_C, do_means, 1)

    return {
        "title": "Correlation vs. causation",
        "n_worlds": N_WORLDS_C,
        "seed": SEED_C,
        "steps": STEPS,
        "outcome": "mean vegetation over the last half of the run",
        "observational": {
            "correlation_rain_vegetation": float(np.corrcoef(rain, veg)[0, 1]),
            "slope": float(obs_slope),
            "intercept": float(obs_intercept),
            "correlation_sun_rain": float(np.corrcoef(sun, rain)[0, 1]),
            "correlation_sun_vegetation": float(np.corrcoef(sun, veg)[0, 1]),
        },
        "interventional": {
            "rain_levels": RAIN_LEVELS_C,
            "mean_vegetation": do_means,
            "slope": float(do_slope),
            "intercept": float(do_intercept),
        },
        "adjusted_for_sunlight": {"slope": float(adjusted_slope)},
        "points": {"rainfall": _round(rain), "vegetation": _round(veg), "sunlight": _round(sun)},
    }


def experiment_d() -> dict:
    """Reproducibility across 30 predefined seeds, paired within each seed."""
    outcome = "creatures"
    paired, unpaired, per_seed = [], [], []
    for seed in SEEDS_D:
        base, intv = scm.paired_run(None, seed, STEPS, MAIN_INTERVENTION)
        effect = float((intv[outcome] - base[outcome])[START:].mean())
        # Same comparison but the intervened world gets unrelated noise.
        other = scm.simulate(None, scm.make_noise(seed + 10_000, STEPS), MAIN_INTERVENTION)
        paired.append(effect)
        unpaired.append(float((other[outcome] - base[outcome])[START:].mean()))
        per_seed.append({"seed": seed, "effect": effect, "final_diff": float(intv[outcome][-1] - base[outcome][-1])})

    rerun_base, rerun_intv = scm.paired_run(None, SEED_A, STEPS, MAIN_INTERVENTION)
    again_base, again_intv = scm.paired_run(None, SEED_A, STEPS, MAIN_INTERVENTION)
    identical = max(
        float(np.abs(rerun_base[v] - again_base[v]).max() + np.abs(rerun_intv[v] - again_intv[v]).max())
        for v in scm.VARIABLES
    )

    n = len(paired)
    mean, sd = float(np.mean(paired)), float(np.std(paired, ddof=1))
    half_width = T_CRIT_DF29 * sd / np.sqrt(n)
    return {
        "title": "Reproducibility across seeds",
        "seeds": SEEDS_D,
        "steps": STEPS,
        "intervention": _describe(MAIN_INTERVENTION),
        "outcome": f"mean difference in {outcome} after the intervention starts",
        "mean_effect": mean,
        "sd_effect": sd,
        "min_effect": float(np.min(paired)),
        "max_effect": float(np.max(paired)),
        "ci95": [mean - half_width, mean + half_width],
        "ci_method": "Student-t interval for the mean of 30 paired differences (df = 29)",
        "unpaired_sd_effect": float(np.std(unpaired, ddof=1)),
        "identical_seed_max_abs_diff": identical,
        "per_seed": per_seed,
    }


EXPERIMENTS = {"A": experiment_a, "B": experiment_b, "C": experiment_c, "D": experiment_d}


def run(names: list[str] | None = None) -> dict:
    return {name: EXPERIMENTS[name]() for name in (names or list(EXPERIMENTS))}


def _describe(i: Intervention) -> dict:
    return {"variable": i.variable, "value": i.value, "start": i.start, "end": i.end}


def _round(values: np.ndarray) -> list[float]:
    return [round(float(x), 4) for x in values]


def to_markdown(r: dict) -> str:
    a, b, c, d = r["A"], r["B"], r["C"], r["D"]
    do_a = f"do({a['intervention']['variable']} = {a['intervention']['value']})"
    lines = [
        "# Experiment results",
        "",
        "Generated by `python -m app.experiments`. All numbers come from the SCM in `backend/app/scm.py`.",
        "",
        f"## A. Baseline vs. intervention: {do_a} from step {a['intervention']['start']} (seed {a['seed']}, {a['steps']} steps)",
        "",
        "| Variable | Final baseline | Final intervention | Final difference | Mean difference | Relative effect | Steps to diverge |",
        "|---|---|---|---|---|---|---|",
    ]
    for v, m in a["metrics"].items():
        rel = "n/a" if m["relative_effect"] is None else f"{m['relative_effect']:+.1%}"
        lag = "never" if m["steps_to_divergence"] is None else str(m["steps_to_divergence"])
        lines.append(
            f"| {v} | {m['final_baseline']:.3f} | {m['final_intervention']:.3f} | {m['final_diff']:+.3f} | {m['mean_diff']:+.3f} | {rel} | {lag} |"
        )
    lines += [
        "",
        f"## B. Causal propagation (seed {b['seed']})",
        "",
        "| Intervention | Descendants in the graph | Variables that actually changed | Match |",
        "|---|---|---|---|",
    ]
    for row in b["interventions"]:
        i = row["intervention"]
        lines.append(
            f"| do({i['variable']} = {i['value']}) | {', '.join(row['expected_descendants'])} | {', '.join(row['changed_variables'])} | {'yes' if row['matches_graph'] else 'NO'} |"
        )
    chain = b["interventions"][0]["steps_to_divergence"]
    lines += [
        "",
        f"Steps until each variable differs by more than {b['divergence_threshold']} under do(rainfall = 0.85): "
        + ", ".join(f"{v} {chain[v]}" for v in ["rainfall", "water", "vegetation", "food", "creatures", "health"])
        + ".",
        "",
        f"## C. Correlation vs. causation ({c['n_worlds']} worlds, seed {c['seed']})",
        "",
        "| Quantity | Value |",
        "|---|---|",
        f"| Observed correlation, rainfall vs. vegetation | {c['observational']['correlation_rain_vegetation']:+.3f} |",
        f"| Observed slope (vegetation per unit rainfall) | {c['observational']['slope']:+.3f} |",
        f"| Interventional slope, do(rainfall = r) | {c['interventional']['slope']:+.3f} |",
        f"| Observed slope adjusted for sunlight | {c['adjusted_for_sunlight']['slope']:+.3f} |",
        f"| Correlation, sunlight vs. rainfall | {c['observational']['correlation_sun_rain']:+.3f} |",
        f"| Correlation, sunlight vs. vegetation | {c['observational']['correlation_sun_vegetation']:+.3f} |",
        "",
        "Mean vegetation under do(rainfall = r): "
        + ", ".join(f"r={lvl}: {m:.3f}" for lvl, m in zip(c["interventional"]["rain_levels"], c["interventional"]["mean_vegetation"]))
        + ".",
        "",
        f"## D. Reproducibility ({len(d['seeds'])} seeds, paired)",
        "",
        "| Quantity | Value |",
        "|---|---|",
        f"| Mean effect on creatures | {d['mean_effect']:+.4f} |",
        f"| Standard deviation across seeds | {d['sd_effect']:.4f} |",
        f"| Range | {d['min_effect']:+.4f} to {d['max_effect']:+.4f} |",
        f"| 95% confidence interval of the mean | {d['ci95'][0]:+.4f} to {d['ci95'][1]:+.4f} |",
        f"| Standard deviation without paired noise | {d['unpaired_sd_effect']:.4f} |",
        f"| Max difference between two identical-seed runs | {d['identical_seed_max_abs_diff']:.1e} |",
        "",
        f"Confidence interval method: {d['ci_method']}.",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / "results"
    out_dir.mkdir(parents=True, exist_ok=True)
    results = run()
    # Fixed line endings so the files are byte-identical on every platform.
    (out_dir / "experiments.json").write_text(json.dumps(results, indent=1), encoding="utf-8", newline="\n")
    (out_dir / "experiments.md").write_text(to_markdown(results), encoding="utf-8", newline="\n")
    print(to_markdown(results))


if __name__ == "__main__":
    main()
