"""FastAPI service: exposes the SCM and serves the built frontend."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, model_validator

from . import experiments, scm

MIN_STEPS, MAX_STEPS = 60, 720
MAX_SEED = 2**31 - 1

SCENARIOS = {
    "temperate": {
        "name": "Temperate valley",
        "description": "Balanced sun and rain. A calm, moderately green world.",
        "params": {},
    },
    "arid": {
        "name": "Arid basin",
        "description": "Bright skies, little rain, thin soil. Life hangs on.",
        "params": {"sun_base": 0.7, "rain_base": 0.35, "soil": 0.75, "water0": 0.25, "vegetation0": 0.25, "food0": 0.2, "creatures0": 0.3},
    },
    "wetland": {
        "name": "Lush wetland",
        "description": "Cloudy, rainy and fertile. Water everywhere.",
        "params": {"sun_base": 0.4, "rain_base": 0.7, "soil": 1.0, "water0": 0.75, "vegetation0": 0.5, "food0": 0.4, "creatures0": 0.6},
    },
}

INTERVENTION_PRESETS = [
    {"id": "more-rain", "label": "Increase rainfall", "variable": "rainfall", "value": 0.85},
    {"id": "drought", "label": "Introduce drought", "variable": "rainfall", "value": 0.1},
    {"id": "less-vegetation", "label": "Reduce vegetation", "variable": "vegetation", "value": 0.15},
    {"id": "less-food", "label": "Decrease available food", "variable": "food", "value": 0.1},
]


class RunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scenario: str = "temperate"
    seed: int = Field(42, ge=0, le=MAX_SEED)
    steps: int = Field(240, ge=MIN_STEPS, le=MAX_STEPS)


class InterventionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    variable: Literal["sunlight", "rainfall", "water", "vegetation", "food", "creatures"]
    value: float = Field(ge=0.0, le=1.0)
    start: int = Field(60, ge=0)
    end: int | None = Field(None, ge=1)


class InterveneRequest(RunRequest):
    intervention: InterventionIn

    @model_validator(mode="after")
    def window_inside_run(self) -> "InterveneRequest":
        i = self.intervention
        if i.start >= self.steps:
            raise ValueError("intervention.start must be before the last step")
        if i.end is not None and not i.start < i.end <= self.steps:
            raise ValueError("intervention.end must satisfy start < end <= steps")
        return self


class ExperimentsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    experiments: list[Literal["A", "B", "C", "D"]] = Field(default=["A", "B", "C", "D"], min_length=1, max_length=4)


app = FastAPI(title="Causal Universe", version="1.0.0")


def _scenario_params(scenario_id: str) -> dict:
    if scenario_id not in SCENARIOS:
        raise HTTPException(status_code=404, detail=f"unknown scenario '{scenario_id}'")
    return SCENARIOS[scenario_id]["params"]


def _series(run: dict) -> dict[str, list[float]]:
    return {name: [round(float(x), 5) for x in values] for name, values in run.items()}


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/model")
def model() -> dict:
    return {
        "variables": [
            {
                "id": v,
                "description": scm.DESCRIPTIONS[v],
                "equation": scm.EQUATIONS[v],
                "parents": [{"id": p, "lag": lag} for p, c, lag in scm.EDGES if c == v],
                "descendants": scm.descendants(v),
                "intervenable": v in scm.INTERVENABLE,
            }
            for v in scm.VARIABLES
        ],
        "edges": [{"source": p, "target": c, "lag": lag} for p, c, lag in scm.EDGES],
        "evaluation_order": scm.topological_order(),
        "interventions": INTERVENTION_PRESETS,
        "limits": {"min_steps": MIN_STEPS, "max_steps": MAX_STEPS, "max_seed": MAX_SEED, "value_min": 0.0, "value_max": 1.0},
        "divergence_threshold": scm.DIVERGENCE_THRESHOLD,
    }


@app.get("/api/scenarios")
def scenarios() -> dict:
    return {
        "scenarios": [
            {"id": key, "name": s["name"], "description": s["description"], "params": {**scm.SCENARIO_DEFAULTS, **s["params"]}}
            for key, s in SCENARIOS.items()
        ]
    }


@app.post("/api/simulate")
def simulate(req: RunRequest) -> dict:
    """Observation: let the world evolve with no intervention."""
    run = scm.simulate(_scenario_params(req.scenario), seed=req.seed, steps=req.steps)
    return {"scenario": req.scenario, "seed": req.seed, "steps": req.steps, "series": _series(run)}


@app.post("/api/intervene")
def intervene(req: InterveneRequest) -> dict:
    """Paired comparison: the same world with and without do(variable = value)."""
    i = req.intervention
    intervention = scm.Intervention(i.variable, i.value, i.start, i.end)
    baseline, intervened = scm.paired_run(_scenario_params(req.scenario), req.seed, req.steps, intervention)
    return {
        "scenario": req.scenario,
        "seed": req.seed,
        "steps": req.steps,
        "intervention": i.model_dump(),
        "affected": scm.descendants(i.variable),
        "baseline": _series(baseline),
        "intervention_world": _series(intervened),
        "metrics": scm.effect_metrics(baseline, intervened, i.start),
    }


@app.post("/api/experiments")
def run_experiments(req: ExperimentsRequest) -> dict:
    """Run the fixed research experiments (fixed seeds, bounded size)."""
    return {"results": experiments.run(sorted(set(req.experiments)))}


# Serve the built frontend when it exists (it does inside the Docker image).
_static = Path(os.environ.get("STATIC_DIR", Path(__file__).resolve().parents[2] / "frontend" / "dist"))
if _static.is_dir():
    app.mount("/", StaticFiles(directory=_static, html=True), name="frontend")
