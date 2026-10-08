import pytest
from fastapi.testclient import TestClient

from app import scm
from app.main import app

client = TestClient(app)
INTERVENE = {"scenario": "temperate", "seed": 42, "steps": 120, "intervention": {"variable": "rainfall", "value": 0.85, "start": 30}}


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_model_describes_the_real_graph():
    body = client.get("/api/model").json()
    assert [v["id"] for v in body["variables"]] == scm.VARIABLES
    assert {(e["source"], e["target"], e["lag"]) for e in body["edges"]} == set(scm.EDGES)
    by_id = {v["id"]: v for v in body["variables"]}
    assert by_id["rainfall"]["descendants"] == scm.descendants("rainfall")
    assert not by_id["health"]["intervenable"]
    assert len(body["interventions"]) == 4


def test_scenarios_have_full_parameter_sets():
    scenarios = client.get("/api/scenarios").json()["scenarios"]
    assert [s["id"] for s in scenarios] == ["temperate", "arid", "wetland"]
    for s in scenarios:
        assert set(s["params"]) == set(scm.SCENARIO_DEFAULTS)
        assert all(0.0 <= value <= 1.0 for value in s["params"].values())


def test_simulate_shape_bounds_and_reproducibility():
    payload = {"scenario": "arid", "seed": 5, "steps": 90}
    first = client.post("/api/simulate", json=payload).json()
    assert set(first["series"]) == set(scm.VARIABLES)
    for values in first["series"].values():
        assert len(values) == 90 and all(0.0 <= x <= 1.0 for x in values)
    assert first == client.post("/api/simulate", json=payload).json()
    assert first != client.post("/api/simulate", json={**payload, "seed": 6}).json()


def test_simulate_defaults():
    body = client.post("/api/simulate", json={}).json()
    assert (body["scenario"], body["seed"], body["steps"]) == ("temperate", 42, 240)


def test_intervene_returns_paired_worlds_and_consistent_metrics():
    body = client.post("/api/intervene", json=INTERVENE).json()
    base, intv = body["baseline"], body["intervention_world"]
    assert base["rainfall"][:30] == intv["rainfall"][:30]
    assert set(intv["rainfall"][30:]) == {0.85}
    assert base["sunlight"] == intv["sunlight"]
    assert body["affected"] == ["water", "vegetation", "food", "creatures", "health"]
    for name in scm.VARIABLES:
        metric = body["metrics"][name]
        assert metric["final_diff"] == pytest.approx(intv[name][-1] - base[name][-1], abs=1e-4)
    assert body["metrics"]["creatures"]["final_diff"] > 0


def test_intervene_baseline_equals_plain_simulation():
    plain = client.post("/api/simulate", json={k: INTERVENE[k] for k in ("scenario", "seed", "steps")}).json()
    assert client.post("/api/intervene", json=INTERVENE).json()["baseline"] == plain["series"]


def test_intervene_is_reproducible():
    assert client.post("/api/intervene", json=INTERVENE).json() == client.post("/api/intervene", json=INTERVENE).json()


@pytest.mark.parametrize(
    "patch",
    [
        {"steps": 10},
        {"steps": 100000},
        {"seed": -1},
        {"seed": "abc"},
        {"unknown_field": 1},
        {"intervention": {"variable": "health", "value": 0.5}},
        {"intervention": {"variable": "rainfall", "value": 1.5}},
        {"intervention": {"variable": "rainfall", "value": -0.1}},
        {"intervention": {"variable": "rainfall", "value": 0.5, "start": 500}},
        {"intervention": {"variable": "rainfall", "value": 0.5, "start": 50, "end": 40}},
        {"intervention": {"variable": "rainfall", "value": 0.5, "start": 50, "end": 999}},
        {"intervention": {"variable": "__import__('os')", "value": 0.5}},
        {"intervention": None},
    ],
)
def test_intervene_rejects_invalid_input(patch):
    response = client.post("/api/intervene", json={**INTERVENE, **patch})
    assert response.status_code == 422
    assert "detail" in response.json()


def test_missing_intervention_rejected():
    assert client.post("/api/intervene", json={"scenario": "temperate"}).status_code == 422


def test_unknown_scenario_is_404():
    for path, payload in [("/api/simulate", {"scenario": "mars"}), ("/api/intervene", {**INTERVENE, "scenario": "mars"})]:
        response = client.post(path, json=payload)
        assert response.status_code == 404
        assert "mars" in response.json()["detail"]


def test_malformed_json_and_wrong_method():
    assert client.post("/api/simulate", content="{not json", headers={"content-type": "application/json"}).status_code == 422
    # 405 from the API alone; 404 when the built frontend is mounted and the static handler answers.
    assert client.get("/api/simulate").status_code in (404, 405)


def test_experiments_endpoint():
    body = client.post("/api/experiments", json={"experiments": ["B", "D"]}).json()
    assert set(body["results"]) == {"B", "D"}
    assert body["results"]["B"]["all_match_graph"] is True
    assert set(client.post("/api/experiments", json={}).json()["results"]) == {"A", "B", "C", "D"}
    assert client.post("/api/experiments", json={"experiments": ["Z"]}).status_code == 422
    assert client.post("/api/experiments", json={"experiments": []}).status_code == 422
