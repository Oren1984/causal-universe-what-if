import { COLOR_A, COLOR_B, confoundingChart, legend, lineChart, seedChart } from "./charts";
import { h } from "./dom";
import { LABELS, VARS, signed, signedPct } from "./playback";
import type { Experiments, Intervention, InterveneResponse, Metric, Series, VarId } from "./types";

const doText = (i: Intervention): string => `do(${i.variable} = ${i.value})`;
const lagText = (steps: number | null): string => (steps === null ? "never" : `${steps} days`);

function metricsTable(metrics: Record<VarId, Metric>): HTMLElement {
  return h("div", { class: "table-scroll" },
    h("table", { "data-testid": "metrics-table" },
      h("thead", {}, h("tr", {}, ...["Variable", "World A, final", "World B, final", "Final difference", "Mean difference", "Relative effect", "Diverges after"].map((t) => h("th", {}, t)))),
      h("tbody", {}, ...VARS.map((v) => {
        const m = metrics[v];
        return h("tr", { "data-var": v },
          h("th", {}, LABELS[v]),
          h("td", {}, m.final_baseline.toFixed(3)),
          h("td", {}, m.final_intervention.toFixed(3)),
          h("td", { "data-testid": `final-diff-${v}` }, signed(m.final_diff)),
          h("td", {}, signed(m.mean_diff)),
          h("td", {}, signedPct(m.relative_effect)),
          h("td", {}, lagText(m.steps_to_divergence)),
        );
      })),
    ),
  );
}

/** Evidence for the run currently shown in the Explore view. */
export function renderRun(container: HTMLElement, baseline: Series, comparison: InterveneResponse | null): void {
  const charts = h("div", { class: "minis" }, ...VARS.map((v) =>
    lineChart(LABELS[v], baseline[v], comparison ? comparison.intervention_world[v] : null, comparison ? comparison.intervention.start : null)));
  if (!comparison) {
    container.replaceChildren(
      h("h2", {}, "Your experiment"),
      h("p", { class: "muted", "data-testid": "no-comparison" }, "No intervention has been run yet. These charts show the world simply being observed. Run a comparison in Explore the Universe to measure an effect."),
      charts,
    );
    return;
  }
  const i = comparison.intervention;
  container.replaceChildren(
    h("h2", {}, "Your experiment"),
    h("p", { "data-testid": "run-summary" }, `${doText(i)} from day ${i.start}, seed ${comparison.seed}. Both worlds share the same starting state and the same random weather, so every difference below was caused by the intervention.`),
    legend([[COLOR_A, "World A, baseline"], [COLOR_B, "World B, intervention"]]),
    charts,
    metricsTable(comparison.metrics),
    h("p", { class: "muted" }, "Mean difference and relative effect are averaged from the day the intervention starts. A variable diverges once the two worlds differ by more than 0.02."),
  );
}

const tile = (value: string, label: string, testid?: string): HTMLElement =>
  h("div", { class: "tile", "data-testid": testid }, h("strong", {}, value), h("span", {}, label));

/** The four fixed research experiments, computed by the backend. */
export function renderExperiments(container: HTMLElement, r: Experiments): void {
  const { A, B, C, D } = r;
  const chain = B.interventions[0].steps_to_divergence;
  container.replaceChildren(
    h("h2", {}, "Research experiments"),
    h("p", { class: "muted" }, "Fixed seeds, recomputed by the backend each time this page loads."),

    h("section", { class: "experiment", "data-testid": "experiment-a" },
      h("h3", {}, "A. Baseline vs. intervention"),
      h("p", {}, `${doText(A.intervention)} from day ${A.intervention.start}, seed ${A.seed}, ${A.steps} days.`),
      h("div", { class: "tiles" },
        ...(["water", "vegetation", "food", "creatures"] as VarId[]).map((v) =>
          tile(signedPct(A.metrics[v].relative_effect), `${LABELS[v]}, mean change (${signed(A.metrics[v].mean_diff)})`))),
    ),

    h("section", { class: "experiment", "data-testid": "experiment-b" },
      h("h3", {}, "B. Causal propagation"),
      h("p", {}, "An intervention should move the variables downstream of it in the graph, and nothing else."),
      h("div", { class: "table-scroll" }, h("table", {},
        h("thead", {}, h("tr", {}, ...["Intervention", "Predicted by the graph", "Actually changed", "Match"].map((t) => h("th", {}, t)))),
        h("tbody", {}, ...B.interventions.map((row) => h("tr", {},
          h("th", {}, doText(row.intervention)),
          h("td", {}, row.expected_descendants.map((v) => LABELS[v]).join(", ")),
          h("td", {}, row.changed_variables.map((v) => LABELS[v]).join(", ")),
          h("td", { class: row.matches_graph ? "ok" : "bad" }, row.matches_graph ? "✓ yes" : "✗ no"),
        ))),
      )),
      h("p", {}, `After ${doText(B.interventions[0].intervention)}, the change travels down the chain: `
        + (["water", "vegetation", "food", "creatures"] as VarId[]).map((v) => `${LABELS[v]} after ${lagText(chain[v])}`).join(", ") + "."),
    ),

    h("section", { class: "experiment", "data-testid": "experiment-c" },
      h("h3", {}, "C. Correlation vs. causation"),
      h("p", {}, `${C.n_worlds} worlds with different climates. Sunnier worlds get less rain but grow plants faster, so sunlight confounds the link between rain and plants.`),
      h("div", { class: "tiles" },
        tile(signed(C.observational.slope, 2), "Observed slope: rainier worlds look less green", "obs-slope"),
        tile(signed(C.interventional.slope, 2), "Interventional slope: making it rain grows plants", "do-slope"),
        tile(signed(C.adjusted_for_sunlight.slope, 2), "Observed slope after adjusting for sunlight"),
      ),
      confoundingChart({ x: C.points.rainfall, y: C.points.vegetation }, C.observational, C.interventional.rain_levels, C.interventional.mean_vegetation, C.interventional),
      h("p", { class: "muted" }, `Observed correlation ${signed(C.observational.correlation_rain_vegetation, 2)}. The adjustment is a straight-line regression, so it recovers the sign and rough size of the true effect but not its exact value.`),
    ),

    h("section", { class: "experiment", "data-testid": "experiment-d" },
      h("h3", {}, "D. Reproducibility"),
      h("p", {}, `The same intervention repeated on ${D.seeds.length} predefined seeds, each compared with its own matched baseline.`),
      h("div", { class: "tiles" },
        tile(signed(D.mean_effect), "Mean effect on creatures", "mean-effect"),
        tile(`${signed(D.ci95[0])} to ${signed(D.ci95[1])}`, "95% confidence interval of the mean"),
        tile(D.sd_effect.toFixed(4), `Spread across seeds (${D.unpaired_sd_effect.toFixed(4)} without matched noise)`),
        tile(D.identical_seed_max_abs_diff === 0 ? "0" : D.identical_seed_max_abs_diff.toExponential(1), "Difference between two runs of the same seed"),
      ),
      seedChart(D.per_seed, D.mean_effect, D.ci95),
      h("p", { class: "muted" }, `${D.ci_method}.`),
    ),
  );
}
