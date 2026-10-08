import numpy as np
import pytest

from app import scm
from app.scm import Intervention

QUIET = {"noise": 0.0, "season_amp": 0.0}


# --- graph structure -------------------------------------------------------

def test_graph_matches_documented_chain():
    edges = {(p, c) for p, c, lag in scm.EDGES if lag == 0}
    for edge in [("rainfall", "water"), ("water", "vegetation"), ("vegetation", "food"), ("food", "creatures")]:
        assert edge in edges
    assert scm.parents("rainfall") == ["sunlight"]
    assert scm.parents("sunlight") == []
    assert set(scm.parents("vegetation")) == {"sunlight", "water", "vegetation"}


def test_same_step_graph_is_acyclic_and_matches_evaluation_order():
    order = scm.topological_order()
    assert set(order) == set(scm.VARIABLES)
    for parent, child, lag in scm.EDGES:
        if lag == 0:
            assert order.index(parent) < order.index(child)


def test_all_edges_use_lag_zero_or_one_and_self_loops_are_lagged():
    for parent, child, lag in scm.EDGES:
        assert lag in (0, 1)
        if parent == child:
            assert lag == 1


def test_cycle_detection(monkeypatch):
    monkeypatch.setattr(scm, "EDGES", scm.EDGES + [("creatures", "rainfall", 0)])
    with pytest.raises(ValueError):
        scm.topological_order()


def test_descendants():
    assert scm.descendants("rainfall") == ["water", "vegetation", "food", "creatures", "health"]
    assert scm.descendants("food") == ["creatures", "health"]
    assert scm.descendants("creatures") == ["food", "health"]
    assert scm.descendants("health") == []


# --- intervention semantics ------------------------------------------------

def test_do_sets_variable_exactly_inside_window_only():
    base, intv = scm.paired_run(None, 3, 120, Intervention("rainfall", 0.2, start=40, end=80))
    assert np.all(intv["rainfall"][40:80] == 0.2)
    assert np.array_equal(intv["rainfall"][:40], base["rainfall"][:40])
    # Rainfall has no memory, so its own mechanism resumes untouched afterwards.
    assert np.array_equal(intv["rainfall"][80:], base["rainfall"][80:])


def test_nothing_changes_before_the_intervention_starts():
    base, intv = scm.paired_run(None, 3, 120, Intervention("rainfall", 0.9, start=50))
    for name in scm.VARIABLES:
        assert np.array_equal(base[name][:50], intv[name][:50])


@pytest.mark.parametrize("variable", scm.INTERVENABLE)
def test_do_changes_exactly_the_descendants(variable):
    """The code and the declared graph must agree, for every possible target."""
    base, intv = scm.paired_run(None, 11, 150, Intervention(variable, 0.05, start=20))
    changed = [v for v in scm.VARIABLES if v != variable and not np.array_equal(base[v], intv[v])]
    assert changed == scm.descendants(variable)


def test_do_cuts_incoming_arrows():
    # With vegetation held fixed, changing its parent (water) cannot reach food.
    noise = scm.make_noise(5, 100)
    hold = Intervention("vegetation", 0.5)
    wet = scm.simulate({"water0": 0.9, "rain_base": 0.9}, noise, hold)
    dry = scm.simulate({"water0": 0.1, "rain_base": 0.1}, noise, hold)
    assert not np.array_equal(wet["water"], dry["water"])
    assert np.array_equal(wet["food"], dry["food"])


def test_direction_of_effects_down_the_chain():
    base, intv = scm.paired_run(None, 8, 240, Intervention("rainfall", 0.9, start=60))
    for name in ["water", "vegetation", "food", "creatures", "health"]:
        assert intv[name][-1] > base[name][-1]
    base, intv = scm.paired_run(None, 8, 240, Intervention("rainfall", 0.05, start=60))
    for name in ["water", "vegetation", "food", "creatures", "health"]:
        assert intv[name][-1] < base[name][-1]


def test_invalid_interventions_rejected():
    with pytest.raises(ValueError):
        Intervention("health", 0.5)
    with pytest.raises(ValueError):
        Intervention("rainfall", 1.5)
    with pytest.raises(ValueError):
        Intervention("rainfall", 0.5, start=10, end=10)


# --- determinism and paired noise -----------------------------------------

def test_same_seed_is_bitwise_reproducible():
    a, b = scm.simulate(seed=7), scm.simulate(seed=7)
    for name in scm.VARIABLES:
        assert np.array_equal(a[name], b[name])


def test_different_seeds_differ():
    assert not np.array_equal(scm.simulate(seed=1)["water"], scm.simulate(seed=2)["water"])


def test_noise_prefix_is_stable_across_run_lengths():
    short, long = scm.simulate(seed=9, steps=80), scm.simulate(seed=9, steps=200)
    for name in scm.VARIABLES:
        assert np.array_equal(short[name], long[name][:80])


def test_paired_worlds_share_exogenous_noise():
    # Sunlight is upstream of rainfall, so it must be identical in both worlds:
    # same seasonal driver, same disturbances.
    base, intv = scm.paired_run(None, 4, 200, Intervention("rainfall", 0.9, start=0))
    assert np.array_equal(base["sunlight"], intv["sunlight"])


def test_batch_equals_individual_runs():
    noise = np.stack([scm.make_noise(s, 90) for s in (1, 2, 3)])
    sun = np.array([0.3, 0.5, 0.7])
    batch = scm.simulate({"sun_base": sun}, noise)
    for i in range(3):
        single = scm.simulate({"sun_base": sun[i]}, noise[i])
        for name in scm.VARIABLES:
            assert np.array_equal(batch[name][i], single[name])


# --- mathematical reference cases -----------------------------------------

def test_first_step_matches_hand_calculation():
    run = scm.simulate(QUIET, steps=60)
    s, r = 0.5, 0.5
    w = 0.88 * 0.5 + 0.12 * r
    v = 0.94 * 0.45 + 0.06 * 0.9 * w * (0.4 + 1.2 * s)
    f = 0.85 * 0.38 + 0.15 * v * (1 - 0.3 * 0.55)
    c = 0.95 * 0.55 + 0.05 * min(1.0, 1.5 * f)
    expected = {"sunlight": s, "rainfall": r, "water": w, "vegetation": v, "food": f, "creatures": c,
                "health": 0.3 * w + 0.4 * v + 0.3 * c}
    for name, value in expected.items():
        assert run[name][0] == pytest.approx(value, abs=1e-12)


def test_deterministic_steady_state_matches_closed_form():
    run = scm.simulate(QUIET, steps=3000)
    water = 0.5
    vegetation = 0.9 * water * (0.4 + 1.2 * 0.5)
    # food = vegetation * (1 - 0.3 * creatures), creatures = 1.5 * food
    food = vegetation / (1 + 0.3 * 1.5 * vegetation)
    assert run["water"][-1] == pytest.approx(water, abs=1e-9)
    assert run["vegetation"][-1] == pytest.approx(vegetation, abs=1e-9)
    assert run["food"][-1] == pytest.approx(food, abs=1e-9)
    assert run["creatures"][-1] == pytest.approx(1.5 * food, abs=1e-9)


def test_water_relaxes_geometrically_under_do_rainfall():
    run = scm.simulate(QUIET, intervention=Intervention("rainfall", 1.0), steps=60)
    t = np.arange(1, 61)
    assert np.allclose(run["water"], 1.0 - 0.5 * 0.88**t, atol=1e-12)


def test_seasonal_sunlight_follows_the_sine():
    run = scm.simulate({"noise": 0.0, "season_amp": 0.12}, steps=240)
    t = np.arange(240)
    assert np.allclose(run["sunlight"], 0.5 + 0.12 * np.sin(2 * np.pi * t / 120))
    assert np.allclose(run["sunlight"][:120], run["sunlight"][120:])


# --- bounds ----------------------------------------------------------------

@pytest.mark.parametrize("extreme", [0.0, 1.0])
def test_values_stay_in_unit_interval_at_extremes(extreme):
    scenario = {"sun_base": extreme, "rain_base": extreme, "soil": 1.0, "noise": 2.0,
                "water0": extreme, "vegetation0": extreme, "food0": extreme, "creatures0": extreme}
    for variable in scm.INTERVENABLE:
        run = scm.simulate(scenario, seed=1, steps=200, intervention=Intervention(variable, 1.0 - extreme, start=50))
        for name in scm.VARIABLES:
            assert run[name].min() >= 0.0 and run[name].max() <= 1.0


def test_permanent_drought_collapses_the_chain():
    run = scm.simulate(QUIET, intervention=Intervention("rainfall", 0.0), steps=1500)
    for name in ["water", "vegetation", "food", "creatures", "health"]:
        assert run[name][-1] < 1e-6


# --- metrics ---------------------------------------------------------------

def test_effect_metrics_on_known_arrays():
    base = {v: np.full(10, 0.4) for v in scm.VARIABLES}
    intv = {v: np.full(10, 0.4) for v in scm.VARIABLES}
    intv["water"] = np.array([0.4, 0.4, 0.4, 0.4, 0.41, 0.5, 0.6, 0.6, 0.6, 0.7])
    base["food"] = np.zeros(10)
    intv["food"] = np.full(10, 0.2)
    m = scm.effect_metrics(base, intv, start=4)
    assert m["water"]["final_diff"] == pytest.approx(0.3)
    assert m["water"]["mean_diff"] == pytest.approx((0.01 + 0.1 + 0.2 * 3 + 0.3) / 6)
    assert m["water"]["relative_effect"] == pytest.approx(m["water"]["mean_diff"] / 0.4)
    assert m["water"]["max_abs_diff"] == pytest.approx(0.3)
    assert m["water"]["steps_to_divergence"] == 1  # 0.01 is below the 0.02 threshold
    assert m["sunlight"]["mean_diff"] == 0.0 and m["sunlight"]["steps_to_divergence"] is None
    assert m["food"]["relative_effect"] is None  # baseline is zero: ratio undefined
