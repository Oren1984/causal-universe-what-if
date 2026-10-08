import json

import numpy as np
import pytest

from app import experiments, scm


@pytest.fixture(scope="module")
def results():
    return experiments.run()


def test_results_are_json_serialisable_and_reproducible(results):
    assert json.dumps(results) == json.dumps(experiments.run())


def test_a_metrics_agree_with_series(results):
    a = results["A"]
    for name in scm.VARIABLES:
        diff = np.array(a["series_diff"][name])
        assert len(diff) == a["steps"]
        assert diff[-1] == pytest.approx(a["metrics"][name]["final_diff"], abs=1e-4)
        assert diff[experiments.START:].mean() == pytest.approx(a["metrics"][name]["mean_diff"], abs=1e-4)
    assert a["metrics"]["sunlight"]["max_abs_diff"] == 0.0


def test_b_propagation_matches_graph_and_orders_the_chain(results):
    b = results["B"]
    assert b["all_match_graph"]
    lag = b["interventions"][0]["steps_to_divergence"]
    assert lag["water"] <= lag["vegetation"] <= lag["food"] <= lag["creatures"]


def test_c_confounding_reverses_the_observed_sign(results):
    c = results["C"]
    assert c["observational"]["slope"] < 0 < c["interventional"]["slope"]
    assert c["adjusted_for_sunlight"]["slope"] > 0
    means = c["interventional"]["mean_vegetation"]
    assert means == sorted(means)


def test_d_statistics(results):
    d = results["D"]
    effects = [row["effect"] for row in d["per_seed"]]
    assert len(effects) == 30
    assert d["mean_effect"] == pytest.approx(np.mean(effects))
    assert d["sd_effect"] == pytest.approx(np.std(effects, ddof=1))
    assert d["ci95"][0] < d["mean_effect"] < d["ci95"][1]
    assert d["ci95"][1] - d["mean_effect"] == pytest.approx(2.045 * d["sd_effect"] / np.sqrt(30))
    assert d["identical_seed_max_abs_diff"] == 0.0
    assert d["sd_effect"] < d["unpaired_sd_effect"]


def test_markdown_report_renders(results):
    text = experiments.to_markdown(results)
    for heading in ["## A.", "## B.", "## C.", "## D."]:
        assert heading in text
