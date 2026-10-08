"""Structural Causal Model of a miniature ecosystem.

Every endogenous variable lives in [0, 1] and is assigned, once per time step,
by one structural function of its parents and one exogenous noise term.

Within a step the evaluation order is a topological order of the lag-0 graph:

    sunlight -> rainfall -> water -> vegetation -> food -> creatures -> health

Temporal feedback (a variable's own previous value, and grazing by yesterday's
creatures) only ever points from step t-1 to step t, so the graph unrolled over
time is acyclic.

All functions are vectorised over a leading "world" axis so that many worlds
can be simulated at once; a single world is simply a batch of one.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

VARIABLES = ["sunlight", "rainfall", "water", "vegetation", "food", "creatures", "health"]
# health is a deterministic index of the others; it has no mechanism worth replacing.
INTERVENABLE = ["sunlight", "rainfall", "water", "vegetation", "food", "creatures"]
# One exogenous noise stream per stochastic mechanism, in this column order.
NOISE_VARS = ["sunlight", "rainfall", "water", "vegetation", "food", "creatures"]

# (parent, child, lag). lag 0 = same step, lag 1 = previous step.
EDGES: list[tuple[str, str, int]] = [
    ("sunlight", "rainfall", 0),
    ("sunlight", "vegetation", 0),
    ("rainfall", "water", 0),
    ("water", "vegetation", 0),
    ("vegetation", "food", 0),
    ("food", "creatures", 0),
    ("water", "health", 0),
    ("vegetation", "health", 0),
    ("creatures", "health", 0),
    ("water", "water", 1),
    ("vegetation", "vegetation", 1),
    ("food", "food", 1),
    ("creatures", "creatures", 1),
    ("creatures", "food", 1),
]

# Fixed mechanism constants (the "laws" of this universe).
SEASON_PERIOD = 120  # steps per seasonal cycle
SUN_TO_RAIN = 0.3  # sunnier (less cloudy) steps are drier
K_WATER = 0.12  # relaxation rates: fraction of the gap to the target closed per step
K_VEGETATION = 0.06
K_FOOD = 0.15
K_CREATURES = 0.05
SUN_GROWTH_BASE = 0.4  # vegetation target = soil * water * (base + gain * sunlight)
SUN_GROWTH_GAIN = 1.2
GRAZING = 0.3  # share of food eaten by a full creature population
CREATURES_PER_FOOD = 1.5
HEALTH_WEIGHTS = {"water": 0.3, "vegetation": 0.4, "creatures": 0.3}
NOISE_SD = {
    "sunlight": 0.04,
    "rainfall": 0.10,
    "water": 0.015,
    "vegetation": 0.010,
    "food": 0.015,
    "creatures": 0.010,
}

EQUATIONS = {
    "sunlight": "S[t] = clip(sun_base + season_amp*sin(2*pi*t/120) + 0.04*U_S[t])",
    "rainfall": "R[t] = clip(rain_base - 0.3*(S[t] - 0.5) + 0.10*U_R[t])",
    "water": "W[t] = clip(0.88*W[t-1] + 0.12*R[t] + 0.015*U_W[t])",
    "vegetation": "V[t] = clip(0.94*V[t-1] + 0.06*soil*W[t]*(0.4 + 1.2*S[t]) + 0.010*U_V[t])",
    "food": "F[t] = clip(0.85*F[t-1] + 0.15*V[t]*(1 - 0.3*C[t-1]) + 0.015*U_F[t])",
    "creatures": "C[t] = clip(0.95*C[t-1] + 0.05*min(1, 1.5*F[t]) + 0.010*U_C[t])",
    "health": "H[t] = 0.3*W[t] + 0.4*V[t] + 0.3*C[t]",
}

DESCRIPTIONS = {
    "sunlight": "How clear and bright the sky is. Follows a seasonal cycle.",
    "rainfall": "Rain falling this step. Clear, sunny skies bring less rain.",
    "water": "Water stored in the pond and soil. Fills with rain, drains slowly.",
    "vegetation": "Plant cover. Needs water, grows faster with sunlight and good soil.",
    "food": "Edible fruit and seeds produced by plants, minus what creatures ate.",
    "creatures": "Size of the creature population the food can support.",
    "health": "Overall ecosystem index: a weighted blend of water, plants and creatures.",
}


@dataclass(frozen=True)
class Intervention:
    """do(variable = value) for start <= t < end (end=None means until the last step)."""

    variable: str
    value: float
    start: int = 0
    end: int | None = None

    def __post_init__(self) -> None:
        if self.variable not in INTERVENABLE:
            raise ValueError(f"cannot intervene on {self.variable!r}")
        if not 0.0 <= self.value <= 1.0:
            raise ValueError("intervention value must be in [0, 1]")
        if self.start < 0 or (self.end is not None and self.end <= self.start):
            raise ValueError("intervention window is empty or negative")

    def active(self, t: int) -> bool:
        return t >= self.start and (self.end is None or t < self.end)


# Scenario parameters: per-world constants that are exogenous to the model.
SCENARIO_DEFAULTS = {
    "sun_base": 0.5,
    "rain_base": 0.5,
    "soil": 0.9,
    "season_amp": 0.12,
    "water0": 0.5,
    "vegetation0": 0.45,
    "food0": 0.38,
    "creatures0": 0.55,
    "noise": 1.0,  # multiplies every noise standard deviation; 0 = deterministic
}


def parents(variable: str, lag: int | None = None) -> list[str]:
    return [p for p, c, l in EDGES if c == variable and (lag is None or l == lag)]


def descendants(variable: str) -> list[str]:
    """Variables reachable from `variable` in the time-unrolled graph.

    Because do(X) removes only the arrows *into* X, this is also the set of
    variables an intervention on X can change.
    """
    children: dict[str, set[str]] = {v: set() for v in VARIABLES}
    for p, c, _ in EDGES:
        if p != c:
            children[p].add(c)
    seen: set[str] = set()
    stack = [variable]
    while stack:
        for child in children[stack.pop()]:
            if child != variable and child not in seen:
                seen.add(child)
                stack.append(child)
    return [v for v in VARIABLES if v in seen]


def topological_order() -> list[str]:
    """Kahn's algorithm on the lag-0 graph; raises if a same-step cycle exists."""
    indegree = {v: len(parents(v, lag=0)) for v in VARIABLES}
    order: list[str] = []
    ready = [v for v in VARIABLES if indegree[v] == 0]
    while ready:
        node = ready.pop(0)
        order.append(node)
        for p, c, l in EDGES:
            if p == node and l == 0:
                indegree[c] -= 1
                if indegree[c] == 0:
                    ready.append(c)
    if len(order) != len(VARIABLES):
        raise ValueError("same-step causal graph contains a cycle")
    return order


def make_noise(seed: int, steps: int) -> np.ndarray:
    """Exogenous disturbances U, shape (steps, 6), i.i.d. standard normal.

    Rows are drawn in time order, so a shorter run with the same seed sees
    exactly the first rows of a longer one.
    """
    return np.random.default_rng(seed).standard_normal((steps, len(NOISE_VARS)))


def simulate(
    scenario: dict | None = None,
    noise: np.ndarray | None = None,
    intervention: Intervention | None = None,
    *,
    seed: int = 0,
    steps: int = 240,
) -> dict[str, np.ndarray]:
    """Run the SCM forward.

    scenario: SCENARIO_DEFAULTS overrides; values may be scalars or arrays of
        shape (B,) to simulate B worlds at once.
    noise: array (steps, 6) or (B, steps, 6). If omitted it is drawn from `seed`.
    Returns {variable: array (steps,)} for one world, or (B, steps) for a batch.
    """
    p = {**SCENARIO_DEFAULTS, **(scenario or {})}
    if noise is None:
        noise = make_noise(seed, steps)
    noise = np.asarray(noise, dtype=float)
    single = noise.ndim == 2
    if single:
        noise = noise[None]
    n_worlds, steps, _ = noise.shape
    p = {k: np.broadcast_to(np.asarray(v, dtype=float), (n_worlds,)) for k, v in p.items()}
    u = {name: noise[:, :, i] * NOISE_SD[name] * p["noise"][:, None] for i, name in enumerate(NOISE_VARS)}

    out = {v: np.empty((n_worlds, steps)) for v in VARIABLES}
    prev = {v: p[f"{v}0"] for v in ("water", "vegetation", "food", "creatures")}

    for t in range(steps):
        do = intervention.variable if intervention and intervention.active(t) else None

        def assign(name: str, structural_value: np.ndarray) -> np.ndarray:
            # do(X = x): the structural assignment of X is replaced by the constant x.
            if name == do:
                value = np.full(n_worlds, intervention.value)
            else:
                value = np.clip(structural_value, 0.0, 1.0)
            out[name][:, t] = value
            return value

        s = assign("sunlight", p["sun_base"] + p["season_amp"] * np.sin(2 * np.pi * t / SEASON_PERIOD) + u["sunlight"][:, t])
        r = assign("rainfall", p["rain_base"] - SUN_TO_RAIN * (s - 0.5) + u["rainfall"][:, t])
        w = assign("water", (1 - K_WATER) * prev["water"] + K_WATER * r + u["water"][:, t])
        v = assign(
            "vegetation",
            (1 - K_VEGETATION) * prev["vegetation"]
            + K_VEGETATION * p["soil"] * w * (SUN_GROWTH_BASE + SUN_GROWTH_GAIN * s)
            + u["vegetation"][:, t],
        )
        f = assign("food", (1 - K_FOOD) * prev["food"] + K_FOOD * v * (1 - GRAZING * prev["creatures"]) + u["food"][:, t])
        c = assign(
            "creatures",
            (1 - K_CREATURES) * prev["creatures"] + K_CREATURES * np.minimum(1.0, CREATURES_PER_FOOD * f) + u["creatures"][:, t],
        )
        out["health"][:, t] = HEALTH_WEIGHTS["water"] * w + HEALTH_WEIGHTS["vegetation"] * v + HEALTH_WEIGHTS["creatures"] * c
        prev = {"water": w, "vegetation": v, "food": f, "creatures": c}

    return {k: a[0] for k, a in out.items()} if single else out


def paired_run(
    scenario: dict | None, seed: int, steps: int, intervention: Intervention
) -> tuple[dict[str, np.ndarray], dict[str, np.ndarray]]:
    """Baseline and intervened worlds driven by the *same* exogenous noise.

    The two runs share scenario, initial state and every disturbance U[t]; the
    only difference is the replaced structural assignment and what follows
    from it.
    """
    noise = make_noise(seed, steps)
    return simulate(scenario, noise), simulate(scenario, noise, intervention)


DIVERGENCE_THRESHOLD = 0.02


def effect_metrics(baseline: dict[str, np.ndarray], intervened: dict[str, np.ndarray], start: int) -> dict[str, dict]:
    """Per-variable differences (intervened - baseline) for one paired run."""
    metrics = {}
    for name in VARIABLES:
        diff = intervened[name] - baseline[name]
        post, base_post = diff[start:], baseline[name][start:]
        base_mean = float(base_post.mean())
        diverged = np.flatnonzero(np.abs(post) > DIVERGENCE_THRESHOLD)
        metrics[name] = {
            "final_baseline": float(baseline[name][-1]),
            "final_intervention": float(intervened[name][-1]),
            "final_diff": float(diff[-1]),
            "mean_diff": float(post.mean()),
            "max_abs_diff": float(np.abs(diff).max()),
            # A ratio against a near-zero baseline is not meaningful.
            "relative_effect": float(post.mean() / base_mean) if base_mean > 1e-6 else None,
            "steps_to_divergence": int(diverged[0]) if diverged.size else None,
        }
    return metrics
